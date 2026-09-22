const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMessage, createSignupCoordinator, loginOptions } = require('../public/meta-signup');
const { MetaEmbeddedSignupService } = require('../src/messaging/metaEmbeddedSignupService');
const { validBody } = require('../src/messaging/metaSignupRoutes');
const { extractMetaEvents } = require('../src/messaging/metaWebhookNormalizer');
const { MetaWebhookWorker } = require('../src/messaging/metaWebhookWorker');
const { MetaCoexistenceWorker } = require('../src/messaging/metaCoexistenceWorker');

test('coexistence WABA-only completion reconciles either callback order exactly once', async () => {
  const data = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '987' } };
  assert.equal(parseMessage('https://facebook.com.evil.test', data), null);
  const finish = parseMessage('https://www.facebook.com', data);
  for (const order of ['code-first','finish-first']) {
    const calls = []; const coordinator = createSignupCoordinator({ complete: async body => calls.push(body) });
    coordinator.start('s'.repeat(43));
    if (order === 'code-first') await coordinator.receiveCode('code');
    await coordinator.receiveFinish(finish);
    await coordinator.receiveCode('code');
    await coordinator.receiveFinish(finish);
    assert.equal(calls.length, 1); assert.equal(calls[0].coexistence, true);
    assert.equal(calls[0].phoneNumberId, null); assert.equal(validBody('complete', calls[0]), true);
    assert.equal(validBody('complete', { ...calls[0], coexistence: false }), false);
  }
  assert.equal(loginOptions({configId:'123'},true).extras.featureType,'whatsapp_business_app_onboarding');
  assert.equal(loginOptions({configId:'123'},false).extras.featureType,undefined);
  assert.equal(loginOptions({configId:'123'},true).extras.sessionInfoVersion,'3');
});

test('server resolves exactly one verified coexistence number, never an arbitrary WABA phone', async () => {
  let phones = [{id:'123',is_on_biz_app:true,platform_type:'CLOUD_API',display_phone_number:'+15551234567'}];
  let paged = false;
  const service = new MetaEmbeddedSignupService({graphVersion:'v26.0',appId:'1',appSecret:'secret',fetchImpl:async url => ({ok:true,json:async()=>String(url).includes('oauth/')?{access_token:'test-token'}:String(url).includes('/me?')?{id:'555'}:{data:phones,...(paged?{paging:{next:'unused'}}:{})}})});
  const input={code:'code',businessAccountId:'987',coexistence:true};
  assert.equal((await service.exchangeAndVerify(input)).phoneNumberId,'123');
  phones.push({...phones[0],id:'124'});
  await assert.rejects(service.exchangeAndVerify(input),{code:'META_NUMBER_MAPPING_INVALID'});
  phones=phones.slice(0,1);phones[0].is_on_biz_app=false;
  await assert.rejects(service.exchangeAndVerify(input),{code:'META_NUMBER_MAPPING_INVALID'});
  phones[0].is_on_biz_app=true;paged=true;
  await assert.rejects(service.exchangeAndVerify(input),{code:'META_NUMBER_MAPPING_INVALID'});
});

test('real echo/history/contact payloads retain routing and cannot trigger live inbound automation', async () => {
  const base={metadata:{phone_number_id:'123',display_phone_number:'15551234567'}};
  const message={id:'old',from:'923001112222',timestamp:'1790000000',type:'text',text:{body:'old'}};
  const events=extractMetaEvents({object:'whatsapp_business_account',entry:[{id:'987',changes:[
    {field:'history',value:{...base,history:[{metadata:{phase:0,progress:100},threads:[{id:'923001112222',messages:[message]}]}]}},
    {field:'smb_message_echoes',value:{...base,message_echoes:[{...message,id:'echo',from:'15551234567',to:'923001112222'}]}},
    {field:'smb_app_state_sync',value:{...base,state_sync:[{type:'contact',action:'add',contact:{phone_number:'923001112222',full_name:'Demo'},metadata:{timestamp:'100'}}]}}
  ]}]});
  assert.deepEqual(events.map(e=>e.kind),['history_progress','message','message','contact']);
  assert.equal(events[1].history,true);assert.equal(events[2].echo,true);assert.equal(events[2].direction,'outbound');
  let deliveries=0;
  const worker=new MetaWebhookWorker({repository:{claim:async()=>[{payload:{direction:'inbound',history:true}}],processReceipt:async()=>({messageId:'old'})},onInboundMessage:async()=>deliveries++});
  await worker.tick();assert.equal(deliveries,0);
});

test('one-shot sync timeout is retained as uncertain, never silently retried', async () => {
  const writes=[];let calls=0;
  const worker=new MetaCoexistenceWorker({pool:{query:async(sql,args)=>{writes.push({sql,args});return sql.startsWith('SELECT')?{rows:[{id:'c',waba_id:'987',phone_number_id:'123'}]}:{rows:[]};}},vault:{decrypt:()=>({accessToken:'secret'})},graphClient:{request:async()=>{calls++;throw Object.assign(new Error(),{code:'META_TIMEOUT',retryable:true});}}});
  await worker.process({provider_connection_id:'c',step:'history'});
  assert.equal(calls,1);assert.equal(writes.at(-1).args[2],'uncertain');
});
