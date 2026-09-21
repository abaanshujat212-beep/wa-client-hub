const test = require('node:test');
const assert = require('node:assert/strict');
const {createWorkflowActions, locationToken} = require('../src/providers/ghlWorkflowActions');
const env = {GHL_WORKFLOW_SECRET:'test-secret'};
function fixture(contactLocation='loc') {
  const sends=[]; let queries=0,creates=0;
  const send=async v=>{sends.push(v);return{message:{id:'message',status:'sent'}}};
  const service=createWorkflowActions({env,pool:{query:async(sql)=>{queries++;if(sql.includes('whatsapp_message_templates'))return{rows:[{name:'hello_world',language:'en_US',components:[]}]};return{rows:[{workspace_id:'workspace',whatsapp_number_id:'number',installation_id:'install'}]}}},
    ghl:{repository:{getAccessToken:async()=>({accessToken:'secret'})},client:{config:{apiUrl:'https://ghl.test'}}},
    fetchImpl:async()=>({ok:true,json:async()=>({contact:{locationId:contactLocation,phone:'+923701064742'}})}),
    sendService:{repository:{resolveOrCreateConversation:async()=>{creates++;return 'conversation'}},sendTemplate:send,sendText:send,sendMedia:send}});
  return {service,sends,counts:()=>({queries,creates})};
}
const body=()=>({meta:{key:'tenx_wa_send_template'},extras:{locationId:'loc',contactId:'contact',workflowId:'workflow'},data:{from_number:'+15551972307',recipient_phone:'+923701064742',request_id:'event-1',template_name:'hello_world',template_language:'en_US'}});
test('unauthorized and cross-location tokens never query or send',async()=>{const f=fixture();for(const token of ['',locationToken('other',env)])await assert.rejects(f.service.execute(body(),token),{code:'WORKFLOW_UNAUTHORIZED'});assert.equal(f.counts().queries,0)});
test('contact must match location and recipient before creating conversation',async()=>{const f=fixture('other');await assert.rejects(f.service.execute(body(),locationToken('loc',env)),{code:'CONTACT_LOCATION_OR_PHONE_MISMATCH'});assert.equal(f.counts().creates,0)});
test('missing event identity fails closed before send',async()=>{const f=fixture(),b=body();delete b.data.request_id;await assert.rejects(f.service.execute(b,locationToken('loc',env)),{code:'REQUEST_ID_REQUIRED'});assert.equal(f.counts().queries,0)});
test('dry run validates binding without creating or sending',async()=>{const f=fixture(),b=body();b.data.dry_run=true;assert.equal((await f.service.execute(b,locationToken('loc',env))).status,'validated');assert.equal(f.counts().creates,0);assert.equal(f.sends.length,0)});
test('all actions use canonical scope and stable event identity',async()=>{const f=fixture();for(const key of ['tenx_wa_send_template','tenx_wa_send_message','tenx_wa_send_media']){const b=body();b.meta.key=key;Object.assign(b.data,{message:'hello',media_id:'12345',media_type:'image'});await f.service.execute(b,locationToken('loc',env));await f.service.execute(b,locationToken('loc',env));const [a,z]=f.sends.slice(-2);assert.equal(a.idempotencyKey,z.idempotencyKey);assert.deepEqual(a.workspaceIds,['workspace']);assert.equal(a.origin,'api');}assert.equal(new Set(f.sends.map(s=>s.idempotencyKey)).size,3)});
test('missing middle template variable is not silently reordered',async()=>{const f=fixture(),b=body();b.data.variable_2='second';await assert.rejects(f.service.execute(b,locationToken('loc',env)),{code:'TEMPLATE_PARAMETERS_INVALID'});assert.equal(f.sends.length,0)});
