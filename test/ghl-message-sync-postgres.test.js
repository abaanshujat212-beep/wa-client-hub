const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {Pool}=require('pg');const {runMigrations}=require('../src/db/migrate');const {GhlMessageSync}=require('../src/providers/ghlMessageSync');
test('sync worker maps contacts, imports both directions, avoids duplicate CRM messages and preserves uncertain state',{skip:!process.env.TEST_DATABASE_URL,timeout:90000},async()=>{
 const schema='sync_'+crypto.randomBytes(8).toString('hex'),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try{
  await runMigrations(pool);
  await pool.query(`INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Test',10,10,10);
   INSERT INTO users(id,name,email,password_hash,role,active) VALUES('user','Test','test@example.invalid','hash','client',true);
   INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('workspace','user','Test','plan');
   INSERT INTO provider_connections(id,workspace_id,provider,label,status) VALUES('provider','workspace','whatsapp_cloud','Test','active');
   INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id) VALUES('number','user','workspace','Test','+15550001111','provider');
   INSERT INTO ghl_installations(id,installation_id,location_id,workspace_id,encrypted_credentials,encryption_key_id,scopes,access_token_expires_at) VALUES('installation-row','installation-external','location','workspace','test','key',ARRAY['contacts.write','conversations/message.write'],now()+interval '1 hour');
   INSERT INTO ghl_number_mappings(id,installation_id,workspace_id,location_id,whatsapp_number_id,provider_connection_id,conversation_provider_id) VALUES('mapping','installation-row','workspace','location','number','provider','ghl-provider');
   INSERT INTO contacts(id,workspace_id,phone_e164) VALUES('contact','workspace','+923001234567');
   INSERT INTO conversations(id,workspace_id,whatsapp_number_id,contact_id) VALUES('conversation','workspace','number','contact');
   INSERT INTO messages(id,workspace_id,conversation_id,provider_connection_id,direction,origin,type,body,status,occurred_at) VALUES
   ('in','workspace','conversation','provider','inbound','contact','text','incoming','received','2026-09-01'),
   ('out','workspace','conversation','provider','outbound','phone','text','outgoing','sent','2026-09-02'),
   ('crm','workspace','conversation','provider','outbound','crm','text','already in GHL','sent','2026-09-03');`);
  const calls=[];const runtime={client:{config:{apiUrl:'https://fixture.invalid'}},repository:{getAccessToken:async()=>({accessToken:'token'})}};
  const service=new GhlMessageSync({pool,runtime,logger:{error(){}},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return {ok:true,json:async()=>url.endsWith('/contacts/upsert')?{contact:{id:'ghl-contact',locationId:'location'}}:{messageId:'ghl-'+body.altId,conversationId:'ghl-conversation'}}}});
  await service.tick();await service.tick();
  assert.equal(calls.filter(c=>c.url.endsWith('/contacts/upsert')).length,1);
  const imports=calls.filter(c=>c.url.endsWith('/messages/inbound'));assert.equal(imports.length,2);
  assert.deepEqual(imports.map(c=>c.body.direction),['inbound','outbound']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ghl_conversation_links')).rows[0].n,1);
  assert.equal((await pool.query("SELECT state FROM ghl_message_sync WHERE message_id='crm'")).rows[0].state,'existing');
  await pool.query("UPDATE ghl_message_sync SET state='importing' WHERE message_id='in'");await service.tick();
  assert.equal((await pool.query("SELECT state FROM ghl_message_sync WHERE message_id='in'")).rows[0].state,'uncertain');
  assert.equal(calls.length,3);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
