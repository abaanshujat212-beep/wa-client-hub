const crypto = require('node:crypto');
const { MetaCallingError, buildCallActionBody } = require('./metaCallingClient');
const { terminal } = require('./metaCallEvents');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code,message,status=409) => { throw new MetaCallingError(code,message,status); };
function recipient(value) {
  const number = String(value || '').trim().replace(/^\+/, '');
  if (!/^[1-9]\d{7,14}$/.test(number)) fail('META_CALL_RECIPIENT_INVALID','Use an international WhatsApp number',400);
  return number;
}
function permissionSummary(data, now=Date.now()) {
  const permission = data?.permission || {};
  const expiry = Number(permission.expiration_time);
  const status = String(permission.status || 'unknown');
  const alive = status === 'permanent' || (status === 'granted' && permission.expiration_time == null) || (['temporary','granted'].includes(status) && Number.isFinite(expiry) && expiry*1000>now);
  const allowed = action => data?.actions?.some(a=>a.action_name===action && a.can_perform_action===true) === true;
  return { status, expiresAt:Number.isFinite(expiry)&&expiry>0?new Date(expiry*1000).toISOString():null, canStartCall:alive&&allowed('start_call'), canRequestPermission:allowed('send_call_permission_request') };
}
class MetaCallService {
  constructor({pool,graph,calling,vault}) { Object.assign(this,{pool,graph,calling,vault}); }
  async permissions(target,to) {
    return permissionSummary(await this.graph.request({path:[target.phoneNumberId,'call_permissions'],accessToken:target.accessToken,query:{user_wa_id:recipient(to)}}));
  }
  async sweep() {
    await this.pool.query("UPDATE meta_call_commands SET state='uncertain',error_code='META_CALL_INTERRUPTED',updated_at=now() WHERE state='sending' AND created_at<now()-interval '90 seconds'");
    await this.pool.query("UPDATE meta_call_sessions SET remote_session=NULL,remote_key_id=NULL,remote_expires_at=NULL WHERE remote_session IS NOT NULL AND remote_expires_at<=now()");
    await this.pool.query("UPDATE webhook_receipts SET payload=jsonb_set(payload,'{value}',(payload->'value')-'encryptedSession'-'sessionKeyId') WHERE source='meta_whatsapp' AND payload->>'kind'='call' AND received_at<now()-interval '2 minutes' AND payload->'value' ? 'encryptedSession'");
  }
  async list(target) {
    await this.sweep();
    return (await this.pool.query(`SELECT id,external_call_id,direction,recipient,state,owner_user_id,created_at,updated_at,
      EXISTS(SELECT 1 FROM meta_call_commands c WHERE c.session_id=s.id AND c.state IN ('sending','uncertain')) AS action_unconfirmed
      FROM meta_call_sessions s WHERE workspace_id=$1 AND provider_connection_id=$2 ORDER BY created_at DESC LIMIT 100`,[target.workspaceId,target.connectionId])).rows;
  }
  async claim(target,id) {
    const row = (await this.pool.query(`UPDATE meta_call_sessions SET owner_user_id=$4,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND provider_connection_id=$3
      AND state NOT IN ('terminated','rejected','failed') AND (owner_user_id IS NULL OR owner_user_id=$4) RETURNING id,owner_user_id,state`,[id,target.workspaceId,target.connectionId,target.user.id])).rows[0];
    if (!row) fail('META_CALL_CLAIM_UNAVAILABLE','Call is unavailable or already claimed');
    return row;
  }
  async signaling(target,id) {
    await this.sweep();
    const row = (await this.pool.query(`SELECT remote_session,remote_key_id,remote_expires_at FROM meta_call_sessions WHERE id=$1 AND workspace_id=$2 AND provider_connection_id=$3 AND owner_user_id=$4 AND state NOT IN ('terminated','rejected','failed')`,[id,target.workspaceId,target.connectionId,target.user.id])).rows[0];
    if (!row) fail('META_CALL_NOT_FOUND','Claim this call before reading its signaling',404);
    return {session:row.remote_session && row.remote_expires_at>new Date()?this.vault.decrypt(row.remote_session,target.connectionId,row.remote_key_id):null,expiresAt:row.remote_expires_at};
  }
  async detail(target,id) {
    const session=(await this.pool.query('SELECT id,external_call_id,direction,recipient,state,owner_user_id,created_at,updated_at FROM meta_call_sessions WHERE id=$1 AND workspace_id=$2 AND provider_connection_id=$3',[id,target.workspaceId,target.connectionId])).rows[0];
    if(!session)fail('META_CALL_NOT_FOUND','Call not found',404);
    const events=(await this.pool.query('SELECT event,occurred_at,error_code FROM meta_call_session_events WHERE session_id=$1 ORDER BY occurred_at,id LIMIT 100',[id])).rows;
    const commands=(await this.pool.query('SELECT id,action,state,error_code,created_at,updated_at FROM meta_call_commands WHERE session_id=$1 ORDER BY created_at LIMIT 100',[id])).rows;
    return {session,events,commands};
  }
  response(row) { return {commandId:row.id,sessionId:row.session_id,state:row.state,result:row.result,errorCode:row.error_code}; }
  async action(target,input,key) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(key||''))) fail('IDEMPOTENCY_KEY_REQUIRED','Provide a unique Idempotency-Key (16–128 letters, digits, _ or -)',400);
    const action = String(input.action||'').toLowerCase();
    const permissionRequest = action === 'request_permission';
    const normalized = permissionRequest ? {action,to:recipient(input.to),text:String(input.text||'').trim()} : buildCallActionBody(input);
    if (permissionRequest && (!normalized.text || normalized.text.length>1024)) fail('META_CALL_PERMISSION_TEXT_INVALID','Explain the call request in 1–1024 characters',400);
    const fingerprint=hash(normalized);
    await this.sweep();
    const previous=(await this.pool.query('SELECT * FROM meta_call_commands WHERE provider_connection_id=$1 AND idempotency_key=$2',[target.connectionId,key])).rows[0];
    if(previous){if(previous.request_hash!==fingerprint||previous.actor_id!==target.user.id)fail('IDEMPOTENCY_CONFLICT','This key belongs to another request');return this.response(previous);}
    if(action==='connect'||permissionRequest){
      const suppressed=await this.pool.query("SELECT 1 FROM suppressions WHERE phone_e164=$1 AND (scope='global' OR workspace_id=$2) LIMIT 1",['+'+normalized.to,target.workspaceId]);
      if(suppressed.rowCount)fail('META_CALL_RECIPIENT_SUPPRESSED','This recipient has opted out');
      const permission=await this.permissions(target,normalized.to);
      if(!(permissionRequest?permission.canRequestPermission:permission.canStartCall))fail('META_CALL_PERMISSION_REQUIRED',permissionRequest?'Meta does not currently allow a permission request':'Recipient calling permission is missing, expired or rate limited');
      if(permissionRequest){
        const window=await this.pool.query(`SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN contacts t ON t.id=c.contact_id
          WHERE m.workspace_id=$1 AND m.provider_connection_id=$2 AND t.phone_e164=$3 AND m.direction='inbound' AND COALESCE(m.metadata->>'history','false')<>'true' AND m.occurred_at>now()-interval '24 hours' LIMIT 1`,[target.workspaceId,target.connectionId,'+'+normalized.to]);
        if(!window.rowCount)fail('META_CALL_SERVICE_WINDOW_REQUIRED','A recent customer message is required for a free-form permission request. Use an approved call-permission template outside the service window.');
      }
    }
    const client=await this.pool.connect();let command,session;
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+target.connectionId]);
      const duplicate=(await client.query('SELECT * FROM meta_call_commands WHERE provider_connection_id=$1 AND idempotency_key=$2',[target.connectionId,key])).rows[0];
      if(duplicate){if(duplicate.request_hash!==fingerprint||duplicate.actor_id!==target.user.id)fail('IDEMPOTENCY_CONFLICT','This key belongs to another request');await client.query('COMMIT');return this.response(duplicate);}
      if(permissionRequest){
        const recent=await client.query("SELECT 1 FROM meta_call_commands WHERE provider_connection_id=$1 AND action='request_permission' AND created_at>now()-interval '30 seconds' LIMIT 1",[target.connectionId]);
        if(recent.rowCount)fail('META_CALL_REQUEST_THROTTLED','Wait before sending another permission request',429);
      }
      if(action==='connect') {
        const active=await client.query("SELECT 1 FROM meta_call_sessions WHERE provider_connection_id=$1 AND recipient=$2 AND state NOT IN ('terminated','rejected','failed')",[target.connectionId,normalized.to]);
        if(active.rowCount)fail('META_CALL_ALREADY_ACTIVE','A call for this recipient is active or awaiting reconciliation');
        session=(await client.query("INSERT INTO meta_call_sessions(id,workspace_id,provider_connection_id,direction,recipient,owner_user_id) VALUES($1,$2,$3,'outbound',$4,$5) RETURNING *",[crypto.randomUUID(),target.workspaceId,target.connectionId,normalized.to,target.user.id])).rows[0];
      } else if (!permissionRequest) {
        session=(await client.query('SELECT * FROM meta_call_sessions WHERE provider_connection_id=$1 AND workspace_id=$2 AND external_call_id=$3 FOR UPDATE',[target.connectionId,target.workspaceId,normalized.call_id])).rows[0];
        if(!session)fail('META_CALL_NOT_FOUND','Call not found',404);
        if(session.owner_user_id!==target.user.id)fail('META_CALL_NOT_CLAIMED','Claim the call first');
        if(terminal.has(session.state))fail('META_CALL_ENDED','Call has already ended');
        if(['accept','pre_accept','reject'].includes(action) && (session.direction!=='inbound'||!['ringing','pre_accepted'].includes(session.state)))fail('META_CALL_ACTION_STATE','This action is not valid for the current call state');
        if(normalized.session && session.answer_hash && session.answer_hash!==hash(normalized.session))fail('META_CALL_SDP_MISMATCH','Use the same SDP answer for pre-accept and accept');
        const pending=await client.query("SELECT action FROM meta_call_commands WHERE session_id=$1 AND state IN ('sending','uncertain')",[session.id]);
        if(pending.rowCount && (action!=='terminate'||pending.rows.some(c=>c.action==='terminate')))fail('META_CALL_ACTION_PENDING','A previous action is awaiting confirmation');
        if(normalized.session)await client.query('UPDATE meta_call_sessions SET answer_hash=$2 WHERE id=$1',[session.id,hash(normalized.session)]);
      }
      command=(await client.query("INSERT INTO meta_call_commands(id,workspace_id,provider_connection_id,session_id,actor_id,idempotency_key,request_hash,action,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sending') RETURNING *",[crypto.randomUUID(),target.workspaceId,target.connectionId,session?.id||null,target.user.id,key,fingerprint,action])).rows[0];
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
    let result;
    try {
      if(permissionRequest)result=await this.graph.request({path:[target.phoneNumberId,'messages'],accessToken:target.accessToken,method:'POST',body:{messaging_product:'whatsapp',recipient_type:'individual',to:normalized.to,type:'interactive',interactive:{type:'call_permission_request',action:{name:'call_permission_request'},body:{text:normalized.text}}}});
      else result=await this.calling.action({...input,phoneNumberId:target.phoneNumberId,accessToken:target.accessToken,correlationId:session.id});
      const externalId=result?.calls?.[0]?.id;
      if(action==='connect' && (typeof externalId!=='string'||!externalId||externalId.length>512))fail('META_CALL_RESPONSE_INVALID','Meta returned no call identifier',503);
      if(permissionRequest && !result?.messages?.[0]?.id)fail('META_CALL_RESPONSE_INVALID','Meta returned no permission message identifier',503);
      if(!permissionRequest && action!=='connect' && result?.success!==true)fail('META_CALL_RESPONSE_INVALID','Meta did not confirm the call action',503);
      const tx=await this.pool.connect();
      try {
        await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+target.connectionId]);
        if(session){
          if(externalId)await tx.query('UPDATE meta_call_sessions SET external_call_id=$2,updated_at=now() WHERE id=$1 AND (external_call_id IS NULL OR external_call_id=$2)',[session.id,externalId]);
          const next={pre_accept:'pre_accepted',accept:'accepted',reject:'rejected',terminate:'terminated'}[action];
          if(next)await tx.query("UPDATE meta_call_sessions SET state=$2,updated_at=now(),remote_session=CASE WHEN $3 THEN NULL ELSE remote_session END WHERE id=$1 AND state NOT IN ('terminated','rejected','failed') AND NOT ($2='pre_accepted' AND state='accepted')",[session.id,next,terminal.has(next)]);
        }
        if(permissionRequest){
          const {MetaWebhookRepository}=require('./metaWebhookRepository');
          await new MetaWebhookRepository(this.pool).persistMessage(tx,{id:command.id},{workspace_id:target.workspaceId,provider_connection_id:target.connectionId,number_id:target.numberId},{providerMessageId:result.messages[0].id,direction:'outbound',value:{message:{id:result.messages[0].id,to:normalized.to,timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{type:'call_permission_request'},text:{body:normalized.text}}}});
          await tx.query("UPDATE messages SET origin='crm',status=CASE WHEN status='sent' THEN 'accepted' ELSE status END,metadata=metadata||'{\"callPermissionRequest\":true}'::jsonb WHERE workspace_id=$1 AND provider_connection_id=$2 AND external_message_id=$3",[target.workspaceId,target.connectionId,result.messages[0].id]);
        }
        const safeResult=permissionRequest?{messageId:result.messages[0].id}:action==='connect'?{callId:externalId}:{success:true};
        command=(await tx.query("UPDATE meta_call_commands SET state='accepted',result=$2,updated_at=now() WHERE id=$1 RETURNING *",[command.id,safeResult])).rows[0];
        await tx.query('COMMIT');
      } catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
      return this.response(command);
    } catch(error){
      const rejected=Number(error.providerStatus)>=400&&Number(error.providerStatus)<500;
      const state=rejected?'failed':'uncertain';
      await this.pool.query('UPDATE meta_call_commands SET state=$2,error_code=$3,updated_at=now() WHERE id=$1',[command.id,state,String(error.code||'META_CALL_UNCONFIRMED').slice(0,100)]);
      if(rejected && action==='connect')await this.pool.query("UPDATE meta_call_sessions SET state='failed',updated_at=now() WHERE id=$1 AND state='initiating'",[session.id]);
      return this.response({...command,state,error_code:error.code||'META_CALL_UNCONFIRMED'});
    }
  }
}
module.exports={MetaCallService,permissionSummary,recipient};
