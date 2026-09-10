const test=require('node:test');
const assert=require('node:assert/strict');
const{prependExactRouter}=require('../src/messaging/prependExactRouter');
test('exact router runs before existing handler and never intercepts sibling paths',()=>{const calls=[];const app={handle(req,_res,out){calls.push(['existing',req.url]);out?.();}};const router={handle(req,_res){calls.push(['webhook',req.url]);}};prependExactRouter(app,'/webhooks/meta/whatsapp',router);app.handle({url:'/webhooks/meta/whatsapp?x=1'},{},()=>{});app.handle({url:'/webhooks/meta/whatsapp/extra'},{},()=>{});app.handle({url:'/api/meta'},{},()=>{});assert.deepEqual(calls,[['webhook','/?x=1'],['existing','/webhooks/meta/whatsapp/extra'],['existing','/api/meta']]);});
