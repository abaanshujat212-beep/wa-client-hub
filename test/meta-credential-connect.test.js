const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MetaCredentialConnect, validCredentials } = require('../src/messaging/metaCredentialConnect');
const body = { workspaceId:'w', phoneNumberId:'123', businessAccountId:'456', accessToken:'fixture-not-a-real-access-token' };

test('credentials reject injected identity, URL IDs and malformed tokens',()=>{
  assert.equal(validCredentials(body),true);
  for(const input of [{...body,actorId:'admin'},{...body,phoneNumberId:'https://evil.test'},{...body,accessToken:'bad\nsecret'},null]) assert.equal(validCredentials(input),false);
});
test('unauthorized workspace fails before any provider request or save',async()=>{
  const service=new MetaCredentialConnect({authorization:{canManageWorkspace:async()=>false},repository:{install(){assert.fail('saved');}},graphClient:{request(){assert.fail('provider request');}}});
  await assert.rejects(service.connect({id:'u'},body),e=>e.status===404);
});
test('credentials verify WABA membership across pages and use provider phone data',async()=>{
  const calls=[];let installed;
  const service=new MetaCredentialConnect({authorization:{canManageWorkspace:async()=>true},repository:{install:async input=>{installed=input;return {connection:{id:'c'}};}},graphClient:{request:async input=>{calls.push(input);return calls.length===1?{data:[],paging:{next:'ignored-provider-url',cursors:{after:'cursor'}}}:{data:[{id:'123',display_phone_number:'+923001112222',verified_name:'Example'}]};}}});
  assert.deepEqual(await service.connect({id:'u'},body),{connection:{id:'c'}});
  assert.deepEqual(calls[1].path,['456','phone_numbers']);assert.equal(calls[1].query.after,'cursor');
  assert.equal(installed.actorId,'u');assert.equal(installed.phone,'+923001112222');
});
test('mismatched WABA never installs a connection',async()=>{
  const service=new MetaCredentialConnect({authorization:{canManageWorkspace:async()=>true},repository:{install(){assert.fail('saved');}},graphClient:{request:async()=>({data:[{id:'999'}]})}});
  await assert.rejects(service.connect({id:'u'},body),e=>e.status===400);
});

test('Postgres credentials, activation, messaging and template access stay workspace scoped', {skip:!process.env.TEST_DATABASE_URL,timeout:60000},async()=>{
  const {Pool}=require('pg');const {runMigrations}=require('../src/db/migrate');
  const {NumberCreationPolicy}=require('../src/db/numberCreationPolicy');
  const {MetaConnectionRepository}=require('../src/messaging/metaConnectionRepository');
  const {MetaConnectionLifecycleRepository}=require('../src/messaging/metaConnectionLifecycleRepository');
  const {MetaTemplateSyncRepository}=require('../src/messaging/metaTemplateSyncRepository');
  const {CredentialVault}=require('../src/security/credentialVault');
  const schema='credential_'+crypto.randomBytes(6).toString('hex');
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);await runMigrations(pool);
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('u','Owner','u@test.local','x','client'),('other','Other','other@test.local','x','client')");
    await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('p','Plan',5,5,5)");
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w','u','Workspace','p'),('w2','other','Other','p')");
    await pool.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES('m','w','u','owner'),('m2','w2','other','owner')");
    const vault=new CredentialVault({key:crypto.randomBytes(32)});
    const service=new MetaCredentialConnect({authorization:new NumberCreationPolicy(pool),repository:new MetaConnectionRepository(pool,vault),graphClient:{request:async()=>({data:[{id:'123',display_phone_number:'+923001112222',verified_name:'Example'}]})}});
    const installed=await service.connect({id:'u'},body),scope={actorId:'u',workspaceId:'w',connectionId:installed.connection.id};
    assert.doesNotMatch(JSON.stringify(installed),/fixture-not/);
    const stored=(await pool.query('SELECT encrypted_credentials,encryption_key_id FROM provider_connections WHERE id=$1',[scope.connectionId])).rows[0];
    assert.equal(vault.decrypt(stored.encrypted_credentials,scope.connectionId,stored.encryption_key_id).accessToken,body.accessToken);
    const lifecycle=new MetaConnectionLifecycleRepository(pool,vault);
    await assert.rejects(lifecycle.enableMessaging(scope),e=>e.code==='META_ACTIVATION_NOT_READY');
    await lifecycle.recordDiagnostics({...scope,result:{healthy:true,tokenStatus:'valid',webhookSubscribed:true,accountStatus:'connected',code:'META_DIAGNOSTICS_OK'}});
    await lifecycle.activate(scope);
    await assert.rejects(lifecycle.enableMessaging({...scope,actorId:'other'}),e=>e.code==='META_ACTIVATION_NOT_READY');
    await lifecycle.enableMessaging(scope);
    assert.equal((await lifecycle.status(scope)).automationEnabled,true);
    const templates=new MetaTemplateSyncRepository(pool,vault);
    assert.equal((await templates.target({...scope,numberId:installed.number.id})).wabaId,'456');
    await assert.rejects(templates.target({...scope,workspaceId:'w2',numberId:installed.number.id}),e=>e.code==='META_CONNECTION_NOT_FOUND');
    await pool.query("DELETE FROM workspace_members WHERE id='m'");
    await assert.rejects(service.connect({id:'u'},body),e=>e.status===404);
  }finally{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});