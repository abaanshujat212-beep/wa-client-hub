const test=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');const express=require('express');
const {createMetaSignupRouter}=require('../src/messaging/metaSignupRoutes');
const {createMetaCallingRouter}=require('../src/messaging/metaCallingRoutes');
const {CredentialVault}=require('../src/security/credentialVault');
const origin='https://hub.test',csrf='a'.repeat(48),id='11111111-1111-4111-8111-111111111111';
async function serve(app,fn){const server=app.listen(0,'127.0.0.1');await once(server,'listening');try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
test('credential endpoint enforces session, origin, CSRF, schema and fresh workspace authorization',async()=>{
  let providerCalls=0;const pool={connect(){throw new Error('unexpected write');},async query(sql){if(sql.includes('meta_signup_rate_limits'))return {rows:[{hits:1,retry_after:600}]};if(sql.includes('SELECT id,active'))return {rows:[{id:'u',active:true}]};return {rowCount:0,rows:[]};}};
  const app=express();app.use((req,res,next)=>{if(req.get('x-test-user')){req.session={userId:'u',csrfToken:csrf};req.sessionID='s';}next();});
  app.use('/signup',createMetaSignupRouter({enabled:true,pool,origin,signupService:{exchangeAndVerify(){}},vault:{encrypt(){}},graphClient:{request(){providerCalls++;throw new Error('unexpected provider call');}}}));
  await serve(app,async url=>{const body={workspaceId:'w',phoneNumberId:'123',businessAccountId:'456',accessToken:'fixture-not-a-real-access-token'};const post=(changes={},input=body)=>fetch(url+'/signup/credentials',{method:'POST',headers:{'content-type':'application/json','x-test-user':'yes',origin,'x-csrf-token':csrf,...changes},body:JSON.stringify(input)});
    assert.equal((await post({'x-test-user':''})).status,401);assert.equal((await post({origin:'https://other.test'})).status,403);assert.equal((await post({'x-csrf-token':''})).status,403);
    assert.equal((await post({}, {...body,actorId:'admin'})).status,400);assert.equal((await post()).status,404);assert.equal(providerCalls,0);
  });
});
test('calling route resolves scoped server credentials and rejects unauthorized workspace before Meta',async()=>{
  const env={CONNECTOR_MASTER_KEY:Buffer.alloc(32,1).toString('base64'),META_GRAPH_VERSION:'v23.0'};const vault=new CredentialVault({env});const secret=vault.encrypt({accessToken:'scoped-server-token'},id);let allowed=true;const requests=[];
  const pool={async query(sql){if(sql.includes('SELECT 1 FROM users'))return {rowCount:allowed?1:0};return {rows:[{id,workspace_id:'w',encrypted_credentials:secret.ciphertext,encryption_key_id:secret.keyId,waba_id:'456',phone_number_id:'123'}]};}};
  const store={driver:'postgres',repository:{pool},findUser:()=>({id:'u',active:true})};const app=express();app.use((req,res,next)=>{req.session={userId:'u',csrfToken:csrf};next();});
  app.use('/connections/:connectionId/calling',createMetaCallingRouter({enabled:true,env,store,origin,fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({success:true})};}}));
  await serve(app,async url=>{const result=await fetch(url+'/connections/'+id+'/calling/action',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({workspaceId:'w',action:'terminate',callId:'fixture-call',phoneNumberId:'999',accessToken:'untrusted-token'})});assert.equal(result.status,202);assert.match(requests[0].url,/\/123\/calls$/);assert.equal(requests[0].options.headers.authorization,'Bearer scoped-server-token');
    allowed=false;const denied=await fetch(url+'/connections/'+id+'/calling/readiness?workspaceId=w');assert.equal(denied.status,404);assert.equal(requests.length,1);
  });
});
test('expired Meta token is an actionable conflict, not a proxy gateway error',()=>{
  const {mapError}=require('../src/messaging/metaTemplateSyncRoutes');
  const {lifecycleError}=require('../src/messaging/metaConnectionRoutes');
  assert.equal(mapError({code:'META_ERROR_190'}).status,409);
  assert.equal(lifecycleError({code:'META_DIAGNOSTICS_AUTH_FAILED'}).status,409);
});
test('an unrelated Meta app subscription cannot activate this app',async()=>{
  const {MetaConnectionDiagnosticsService}=require('../src/messaging/metaConnectionDiagnosticsService');
  let saved;
  const repository={diagnosticsTarget:async()=>({phoneNumberId:'123',wabaId:'456',accessToken:'fixture'}),recordDiagnostics:async input=>{saved=input.result;return input.result;}};
  const service=new MetaConnectionDiagnosticsService({repository,appId:'our-app',graphVersion:'v23.0',fetchImpl:async url=>({ok:true,status:200,json:async()=>url.includes('subscribed_apps')?{data:[{whatsapp_business_api_data:{id:'another-app'}}]}:{id:'123'}})});
  await service.run({actorId:'u',workspaceId:'w',connectionId:'c'});assert.equal(saved.healthy,false);assert.equal(saved.webhookSubscribed,false);
});