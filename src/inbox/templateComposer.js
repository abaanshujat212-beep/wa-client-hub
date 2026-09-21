const crypto = require('node:crypto');
const { createMessagingRuntime } = require('../messaging/runtime');
const { approvedBodySpec } = require('../messaging/templateCatalog');
function registerTemplateComposer(router, { store, repository, events, workspaceIds, sendService }) {
  let service = sendService;
  const runtime = () => service ||= createMessagingRuntime({pool:repository.pool,events,audit:(...args)=>store.addAudit(...args)});
  router.get('/template-options', async(req,res)=>{
    try {
      const numbers=(await repository.pool.query("SELECT n.id,n.workspace_id,n.phone,n.label FROM whatsapp_numbers n JOIN provider_connections p ON p.id=n.provider_connection_id AND p.workspace_id=n.workspace_id WHERE n.workspace_id=ANY($1::text[]) AND p.provider='whatsapp_cloud' AND p.status='active' AND n.automation_enabled=true",[workspaceIds(req)])).rows;
      const templates=(await repository.pool.query("SELECT t.* FROM whatsapp_message_templates t JOIN whatsapp_numbers n ON n.id=t.whatsapp_number_id AND n.workspace_id=t.workspace_id AND n.provider_connection_id=t.provider_connection_id WHERE t.workspace_id=ANY($1::text[]) AND t.status='APPROVED'",[workspaceIds(req)])).rows.map(t=>({name:t.name,language:t.language,numberId:t.whatsapp_number_id,body:(t.components||[]).find(c=>c.type==='BODY')?.text||'',spec:approvedBodySpec(t),supported:!(t.components||[]).some(c=>c.type==='HEADER'&&c.format&&c.format!=='TEXT'||c.type==='HEADER'&&/\{\{/.test(c.text||'')||c.type==='BUTTONS'&&(c.buttons||[]).some(b=>/\{\{/.test(b.url||'')||['COPY_CODE','FLOW','OTP'].includes(b.type)))}));
      res.json({numbers,templates});
    }catch{res.status(503).json({error:'Template options unavailable'});}
  });
  router.post('/send-template',async(req,res)=>{
    const {workspaceId,numberId,to,template,consentConfirmed}=req.body||{};
    if(!workspaceIds(req).includes(workspaceId))return res.status(404).json({error:'Workspace not found'});
    if(!/^\+[1-9]\d{7,14}$/.test(String(to||'')))return res.status(400).json({error:'Enter recipient with country code, for example +923001234567'});
    const key=req.get('idempotency-key');if(!key||key.length>200)return res.status(400).json({error:'Send request identity is required'});
    try {
      const s=runtime();
      const conversationId=await s.repository.resolveOrCreateConversation({workspaceId,numberId,phone:to});
      if(!conversationId)return res.status(409).json({error:'An active, enabled WhatsApp number is required'});
      if(consentConfirmed===true){
        await repository.pool.query("INSERT INTO consent_records(id,workspace_id,contact_id,purpose,status,source,policy_version,evidence,captured_at) SELECT $1,workspace_id,contact_id,'direct_message','granted','operator_confirmation','1',$3::jsonb,now() FROM conversations WHERE id=$2 AND workspace_id=$4",[crypto.randomUUID(),conversationId,JSON.stringify({actorId:req.user.id,statement:'Recipient has agreed to WhatsApp messages'}),workspaceId]);
      }
      const result=await s.sendTemplate({actorId:req.user.id,workspaceIds:[workspaceId],conversationId,template,idempotencyKey:key});
      res.status(202).json({...result,conversationId});
    }catch(e){res.status(e.status===502?422:e.status||503).json({error:e.code==='META_ACCOUNT_NOT_REGISTERED'?'Sender is not registered on Meta Cloud API (133010). Complete the sender phone registration in Meta WhatsApp API Setup before sending.':e.status?`${e.message}${e.code ? ' ('+e.code+')' : ''}`:'Template send unavailable',code:e.code||'TEMPLATE_SEND_FAILED'});}
  });
}
module.exports={registerTemplateComposer};
