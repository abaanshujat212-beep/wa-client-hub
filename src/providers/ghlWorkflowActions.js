const crypto = require('node:crypto');
const express = require('express');
const { createMessagingRuntime } = require('../messaging/runtime');
const { normalizeTemplate, approvedBodySpec } = require('../messaging/templateCatalog');
const { normalizeMediaReference } = require('../messaging/mediaReference');
const { normalizeText } = require('../messaging/canonicalSendService');

const actions = { tenx_wa_send_template: 'template', tenx_wa_send_message: 'message', tenx_wa_send_media: 'media' };
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
function locationToken(locationId, env = process.env) {
  const secret = env.GHL_WORKFLOW_SECRET || env.CONNECTOR_MASTER_KEY;
  if (!secret) throw fail('WORKFLOW_AUTH_NOT_CONFIGURED', 503);
  return crypto.createHmac('sha256', secret).update(`ghl-workflow:v1:${locationId}`).digest('hex');
}
function authenticate(locationId, token, env) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(locationId || '')) throw fail('LOCATION_REQUIRED');
  const supplied = Buffer.from(String(token || ''));
  const valid = [locationToken(locationId, env), locationToken('marketplace-app', env)].some(value => {
    const expected = Buffer.from(value);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
  });
  if (!valid) throw fail('WORKFLOW_UNAUTHORIZED', 401);
}
function parseAction(payload) {
  const data = payload?.data || {}, extras = payload?.extras || {};
  const kind = actions[payload?.meta?.key];
  if (!kind) throw fail('ACTION_NOT_SUPPORTED');
  if (!/^\+[1-9]\d{7,14}$/.test(data.from_number || '') || !/^\+[1-9]\d{7,14}$/.test(data.recipient_phone || '')) throw fail('PHONE_INVALID');
  if (!extras.contactId || !extras.workflowId) throw fail('WORKFLOW_CONTACT_REQUIRED');
  // Explicit business-event identity must survive GHL retries and change for a new intended send.
  if (typeof data.request_id !== 'string' || !data.request_id.trim() || data.request_id.length > 200) throw fail('REQUEST_ID_REQUIRED');
  let content;
  if (kind === 'template') {
    const parameters = Array.isArray(data.parameters) ? [...data.parameters] : Array.from({length:20},(_,i)=>data[`variable_${i+1}`]);
    while (parameters.length && (parameters.at(-1) == null || parameters.at(-1) === '')) parameters.pop();
    content = { name: data.template_name, language: data.template_language, parameters };
    normalizeTemplate(content);
  } else if (kind === 'message') content = normalizeText(data.message);
  else content = normalizeMediaReference({ type: data.media_type, mediaId: data.media_id, caption: data.caption, filename: data.filename });
  return { kind, content, data, extras, key: payload.meta.key };
}
function createWorkflowActions({ pool, ghl, env = process.env, sendService, fetchImpl = fetch }) {
  let sender = sendService;
  async function execute(payload, token) {
    authenticate(payload?.extras?.locationId, token, env);
    const parsed = parseAction(payload), { data, extras, kind, content, key } = parsed;
    const rows = (await pool.query(`SELECT g.workspace_id,g.whatsapp_number_id,g.provider_connection_id,i.installation_id FROM ghl_number_mappings g
      JOIN ghl_installations i ON i.id=g.installation_id AND i.location_id=g.location_id AND i.workspace_id=g.workspace_id AND i.status='active'
      JOIN whatsapp_numbers n ON n.id=g.whatsapp_number_id AND n.workspace_id=g.workspace_id AND n.provider_connection_id=g.provider_connection_id
      JOIN provider_connections p ON p.id=n.provider_connection_id AND p.workspace_id=n.workspace_id AND p.status='active' AND p.provider='whatsapp_cloud'
      WHERE g.location_id=$1 AND n.phone=$2 AND n.automation_enabled=true`, [extras.locationId, data.from_number])).rows;
    if (rows.length !== 1) throw fail('NUMBER_MAPPING_UNAVAILABLE', 409);
    const mapping = rows[0];
    if(kind==='template') {
      const approved=(await pool.query("SELECT * FROM whatsapp_message_templates WHERE workspace_id=$1 AND whatsapp_number_id=$2 AND provider_connection_id=$3 AND name=$4 AND language=$5 AND status='APPROVED'",[mapping.workspace_id,mapping.whatsapp_number_id,mapping.provider_connection_id,content.name,content.language])).rows[0];
      if(!approved)throw fail('TEMPLATE_NOT_APPROVED',409);
      if(!supportedTemplate(approved))throw fail('TEMPLATE_COMPONENTS_UNSUPPORTED',409);
      const spec=approvedBodySpec(approved);
      if(content.parameters.length!==spec.count)throw fail('TEMPLATE_PARAMETERS_MISMATCH',409);
      if(spec.names.length)content.parameters=content.parameters.map((value,i)=>({text:typeof value==='object'?value.text:value,parameter_name:spec.names[i]}));
    }
    const access = await ghl.repository.getAccessToken({ installationId: mapping.installation_id, locationId: extras.locationId, refresh: v => ghl.client.refreshToken(v) });
    const response = await fetchImpl(`${ghl.client.config.apiUrl}/contacts/${encodeURIComponent(extras.contactId)}`, { headers: { Authorization: `Bearer ${access.accessToken}`, Version: '2023-02-21' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail('GHL_CONTACT_LOOKUP_FAILED', 422);
    const contact = (await response.json()).contact;
    if (contact?.locationId !== extras.locationId || `+${String(contact?.phone || '').replace(/\D/g, '')}` !== data.recipient_phone) throw fail('CONTACT_LOCATION_OR_PHONE_MISMATCH', 409);
    if (data.dry_run === true || data.dry_run === 'true') return { success: true, status: 'validated', message_id: null, duplicate: false, error_code: null };
    sender ||= createMessagingRuntime({ pool, env });
    const conversationId = await sender.repository.resolveOrCreateConversation({ workspaceId: mapping.workspace_id, numberId: mapping.whatsapp_number_id, phone: data.recipient_phone });
    if (!conversationId) throw fail('NUMBER_MAPPING_UNAVAILABLE', 409);
    const idempotencyKey = 'ghl-action:' + crypto.createHash('sha256').update(JSON.stringify([extras.locationId, extras.workflowId, extras.contactId, key, data.request_id])).digest('hex');
    const common = { actorId: null, workspaceIds: [mapping.workspace_id], conversationId, idempotencyKey, origin: 'api' };
    const result = kind === 'template' ? await sender.sendTemplate({ ...common, template: content }) : kind === 'message' ? await sender.sendText({ ...common, text: content }) : await sender.sendMedia({ ...common, media: content });
    return { success: true, status: result.message?.status || 'accepted', message_id: result.message?.id || null, duplicate: Boolean(result.duplicate), error_code: null };
  }
  const router = express.Router();
  router.post('/', express.json({ limit: '64kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await execute(req.body, req.get('x-tenx-workflow-key'))); }
    catch (e) { res.status(e.status && e.status < 500 ? e.status : 503).json({ success: false, status: 'failed', message_id: null, error_code: e.code || 'WORKFLOW_ACTION_FAILED' }); }
  });
  const fieldsRouter=express.Router();
  fieldsRouter.post('/',express.json({limit:'64kb'}),async(req,res)=>{
    try {
      const location=req.body?.extras?.locationId;authenticate(location,req.get('x-tenx-workflow-key'),env);
      const data=req.body?.data||{};
      const numbers=(await pool.query(`SELECT DISTINCT n.id,n.phone,n.label,n.workspace_id,n.provider_connection_id FROM ghl_number_mappings g JOIN ghl_installations i ON i.id=g.installation_id AND i.status='active' JOIN whatsapp_numbers n ON n.id=g.whatsapp_number_id AND n.workspace_id=g.workspace_id AND n.provider_connection_id=g.provider_connection_id JOIN provider_connections p ON p.id=n.provider_connection_id AND p.status='active' AND p.provider='whatsapp_cloud' WHERE g.location_id=$1 AND n.automation_enabled=true`,[location])).rows;
      const fields=[{field:'from_number',title:'From WhatsApp Number',fieldType:'select',required:true,altersDynamicField:true,options:numbers.map(n=>({label:`${n.phone} — ${n.label}`,value:n.phone}))}];
      const number=numbers.find(n=>n.phone===data.from_number);
      if(number&&req.body?.meta?.key==='tenx_wa_send_template'){
        const templates=(await pool.query("SELECT * FROM whatsapp_message_templates WHERE workspace_id=$1 AND whatsapp_number_id=$2 AND provider_connection_id=$3 AND status='APPROVED' ORDER BY name,language",[number.workspace_id,number.id,number.provider_connection_id])).rows.filter(supportedTemplate);
        fields.push({field:'template_name',title:'Approved Template',fieldType:'select',required:true,altersDynamicField:true,options:[...new Set(templates.map(t=>t.name))].map(name=>({label:name,value:name}))});
        const languages=templates.filter(t=>t.name===data.template_name);
        fields.push({field:'template_language',title:'Template Language',fieldType:'select',required:true,altersDynamicField:true,options:languages.map(t=>({label:t.language,value:t.language}))});
        const template=languages.find(t=>t.language===data.template_language);
        if(template){const spec=approvedBodySpec(template);for(let i=0;i<spec.count;i++)fields.push({field:`variable_${i+1}`,title:spec.names[i]||`Variable ${i+1}`,fieldType:'string',required:true,allowCustomInputPicker:true});}
      }
      res.set('Cache-Control','no-store').json({inputs:[{section:'WhatsApp',fields}]});
    }catch(e){res.status(e.status||503).json({error_code:e.code||'WORKFLOW_FIELDS_UNAVAILABLE'});}
  });
  return { router, fieldsRouter, execute };
}
function supportedTemplate(t){return !(t.components||[]).some(c=>!['BODY','FOOTER','HEADER','BUTTONS'].includes(c.type)||c.type==='HEADER'&&(c.format!=='TEXT'||/\{\{/.test(c.text||''))||c.type==='BUTTONS'&&(c.buttons||[]).some(b=>/\{\{/.test(b.url||'')||['COPY_CODE','FLOW','OTP'].includes(b.type)));}
module.exports = { createWorkflowActions, parseAction, authenticate, locationToken, supportedTemplate };

