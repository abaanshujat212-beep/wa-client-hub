const test=require('node:test');const assert=require('node:assert/strict');
const {GhlMessageSync,importBody}=require('../src/providers/ghlMessageSync');
const mapping={id:'map',location_id:'location',conversation_provider_id:'provider',workspace_id:'workspace',whatsapp_number_id:'number',installation_row_id:'installation'};
const message={id:'message',conversation_id:'conversation',phone_e164:'+923001234567',body:'hello',direction:'inbound',type:'text',occurred_at:'2026-09-01T12:00:00Z'};
test('history import preserves direction, timestamp and stable identity without using send endpoint',()=>{
 for(const direction of ['inbound','outbound']){const body=importBody({...message,direction},mapping,'contact');assert.equal(body.type,'Custom');assert.equal(body.direction,direction);assert.equal(body.date,'2026-09-01T12:00:00.000Z');assert.equal(body.altId,'wa:map:message');assert.equal(body.contactId,'contact');}
});
test('media-only messages retain attachments; empty unsupported messages do not silently sync',()=>{
 assert.deepEqual(importBody({...message,body:'',type:'image'},mapping,'contact',['https://files.test/photo.png']).attachments,['https://files.test/photo.png']);
 assert.throws(()=>importBody({...message,body:'',type:'other'},mapping,'contact'),{code:'GHL_MESSAGE_CONTENT_UNAVAILABLE'});
});
test('contact mapping uses phone and location without overwriting profile fields',async()=>{
 const requests=[],queries=[];const service=new GhlMessageSync({runtime:{client:{config:{apiUrl:'https://ghl.test'}}},fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({contact:{id:'contact',locationId:'location'}})};}});
 const db={query:async(sql,params)=>{queries.push({sql,params});return{rows:[]}}};
 assert.equal(await service.contact(db,mapping,message,'token'),'contact');
 assert.deepEqual(requests[0].body,{locationId:'location',phone:'+923001234567'});
 assert.equal(queries[1].params[2],'installation');
});
test('cross-location upsert response is rejected before local mapping is saved',async()=>{
 const service=new GhlMessageSync({runtime:{client:{config:{apiUrl:'https://ghl.test'}}},fetchImpl:async()=>({ok:true,json:async()=>({contact:{id:'contact',locationId:'other'}})})});let count=0;
 await assert.rejects(service.contact({query:async()=>{count++;return{rows:[]}}},mapping,message,'token'),{code:'GHL_CONTACT_LOCATION_MISMATCH'});assert.equal(count,1);
});
test('ambiguous import timeout is flagged for reconciliation, not blind retry',async()=>{
 const service=new GhlMessageSync({runtime:{client:{config:{apiUrl:'https://ghl.test'}}},fetchImpl:async()=>{throw Error('timeout')}});
 await assert.rejects(service.request('/conversations/messages/inbound','token',{},true),e=>e.uncertain===true);
});

test('sync router constructs without unrelated template handlers',()=>{require('../src/providers/ghlMessageSync').createSyncRouter({service:{},store:{}});});
