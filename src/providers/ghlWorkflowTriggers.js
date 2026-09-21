const express = require('express');
const { authenticate } = require('./ghlWorkflowActions');
const keys = new Set(['tenx_wa_message_received','tenx_wa_message_status_updated']);
const fail = (code,status=400) => Object.assign(new Error(code),{code,status});
function validateTarget(target, location, id) {
  let url; try { url=new URL(target); } catch { throw fail('TRIGGER_TARGET_INVALID'); }
  if (url.origin !== 'https://services.leadconnectorhq.com' || url.username || url.password || url.search || url.hash || url.pathname !== `/workflows-marketplace/triggers/execute/${location}/${id}`) throw fail('TRIGGER_TARGET_INVALID');
  return url.href;
}
function validateFilters(filters) {
  if (!Array.isArray(filters) || filters.length>10) throw fail('TRIGGER_FILTER_INVALID');
  for (const f of filters) if (!['status','from_number','message_type'].includes(f.field) || !['==','!='].includes(f.operator) || typeof f.value!=='string') throw fail('TRIGGER_FILTER_UNSUPPORTED');
  return filters;
}
function matches(filters, payload) { return validateFilters(filters).every(f => f.operator==='==' ? payload[f.field]===f.value : payload[f.field]!==f.value); }
function createWorkflowTriggers({pool,env=process.env,fetchImpl=fetch,logger=console}) {
  async function subscribe(body,token) {
    const {extras={},triggerData={},meta={}}=body||{}; const {locationId,workflowId}=extras;
    authenticate(locationId,token,env);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(triggerData.id||'') || !workflowId || !keys.has(meta.key) || triggerData.key!==meta.key || !['CREATED','UPDATED','DELETED'].includes(triggerData.eventType)) throw fail('TRIGGER_SUBSCRIPTION_INVALID');
    const installed=await pool.query("SELECT 1 FROM ghl_installations WHERE location_id=$1 AND status='active' LIMIT 1",[locationId]);
    if (!installed.rowCount) throw fail('LOCATION_NOT_INSTALLED',403);
    if (triggerData.eventType==='DELETED') {
      await pool.query('UPDATE ghl_workflow_subscriptions SET active=false,target_url=NULL,updated_at=now() WHERE location_id=$1 AND trigger_id=$2 AND workflow_id=$3',[locationId,triggerData.id,workflowId]);
      return {success:true};
    }
    const target=validateTarget(triggerData.targetUrl,locationId,triggerData.id), filters=validateFilters(triggerData.filters||[]);
    await pool.query(`INSERT INTO ghl_workflow_subscriptions(location_id,trigger_id,workflow_id,trigger_key,target_url,filters)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(location_id,trigger_id) DO UPDATE SET workflow_id=EXCLUDED.workflow_id,trigger_key=EXCLUDED.trigger_key,target_url=EXCLUDED.target_url,filters=EXCLUDED.filters,active=true,updated_at=now()`,[locationId,triggerData.id,workflowId,meta.key,target,JSON.stringify(filters)]);
    return {success:true};
  }
  const router=express.Router();router.post('/',express.json({limit:'64kb'}),async(req,res)=>{
    try { res.json(await subscribe(req.body,req.get('x-tenx-workflow-key'))); }
    catch(e){res.status(e.status||503).json({success:false,error_code:e.code||'TRIGGER_SUBSCRIPTION_FAILED'});}
  });
  let running=false,timer;
  async function tick() {
    if(running)return;running=true;let db,locked=false;
    try {
      db=await pool.connect();
      locked=(await db.query("SELECT pg_try_advisory_lock(hashtext('ghl-workflow-triggers')) AS locked")).rows[0].locked;if(!locked)return;
      await db.query("UPDATE ghl_workflow_deliveries SET state='uncertain',error_code='DELIVERY_INTERRUPTED' WHERE state='sending'");
      const rows=(await db.query(`SELECT d.*,s.active,s.target_url,s.filters,s.trigger_key,m.body,m.type AS message_type,m.direction,
        n.phone AS from_number,ct.phone_e164 AS phone,l.ghl_contact_id,i.status AS installation_status
        FROM ghl_workflow_deliveries d JOIN ghl_workflow_subscriptions s USING(location_id,trigger_id)
        JOIN messages m ON m.id=d.message_id JOIN conversations c ON c.id=m.conversation_id
        JOIN contacts ct ON ct.id=c.contact_id JOIN whatsapp_numbers n ON n.id=c.whatsapp_number_id
        JOIN ghl_number_mappings g ON g.id=d.mapping_id JOIN ghl_installations i ON i.id=g.installation_id
        LEFT JOIN ghl_conversation_links l ON l.mapping_id=d.mapping_id AND l.conversation_id=m.conversation_id
        WHERE d.state='pending' AND d.retry_at<=now() ORDER BY d.id LIMIT 25`)).rows;
      for(const row of rows){
        const finish=(state,code=null)=>db.query('UPDATE ghl_workflow_deliveries SET state=$2,error_code=$3,updated_at=now() WHERE id=$1',[row.id,state,code]);
        if(!row.active||row.installation_status!=='active'||row.trigger_key!==row.event_key){await finish('skipped','SUBSCRIPTION_INACTIVE');continue;}
        if(!row.ghl_contact_id){await db.query("UPDATE ghl_workflow_deliveries SET retry_at=now()+interval '30 seconds',error_code='WAITING_CONTACT_SYNC' WHERE id=$1",[row.id]);continue;}
        const payload={event_id:`wa-event:${row.id}`,contactId:row.ghl_contact_id,locationId:row.location_id,phone:row.phone,from_number:row.from_number,message_id:row.message_id,message:row.body||'',message_type:row.message_type,direction:row.direction,status:row.event_status,occurred_at:new Date(row.occurred_at).toISOString()};
        try { validateTarget(row.target_url,row.location_id,row.trigger_id);if(!matches(row.filters,payload)){await finish('skipped','FILTER_NOT_MATCHED');continue;} }
        catch(e){await finish('failed',e.code);continue;}
        // Persist intent before external execution. Ambiguous replies need reconciliation.
        await finish('sending');
        try {
          const response=await fetchImpl(row.target_url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Idempotency-Key':payload.event_id},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
          if(response.ok) await finish('delivered');
          else if(response.status===429) await db.query("UPDATE ghl_workflow_deliveries SET state='pending',retry_at=now()+interval '5 minutes',error_code='HTTP_429' WHERE id=$1",[row.id]);
          else await finish(response.status>=500?'uncertain':'failed',`HTTP_${response.status}`);
        }catch{await finish('uncertain','DELIVERY_NETWORK_ERROR');}
      }
    }catch{logger.error?.('GHL workflow trigger worker needs attention');}
    finally{try{if(locked)await db.query("SELECT pg_advisory_unlock(hashtext('ghl-workflow-triggers'))");}finally{db?.release();running=false;}}
  }
  return {router,subscribe,tick,start(){if(!timer){void tick();timer=setInterval(()=>void tick(),5000);timer.unref?.();}},stop(){clearInterval(timer);timer=null;}};
}
module.exports={createWorkflowTriggers,validateTarget,validateFilters,matches};
