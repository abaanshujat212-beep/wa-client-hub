const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {Pool}=require('pg');const {runMigrations}=require('../src/db/migrate');const {createWorkflowTriggers}=require('../src/providers/ghlWorkflowTriggers');
test('durable trigger capture, filter, delivery deduplication and uncertain handling',{skip:!process.env.TEST_DATABASE_URL},async()=>{
const schema='triggers_'+crypto.randomBytes(8).toString('hex'),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});try{await runMigrations(pool);
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

await pool.query(`INSERT INTO ghl_conversation_links(id,mapping_id,installation_id,location_id,workspace_id,ghl_conversation_id,ghl_contact_id,conversation_id,whatsapp_number_id,provider_connection_id) VALUES('link','mapping','installation-row','location','workspace','ghl-conversation','ghl-contact','conversation','number','provider');
INSERT INTO ghl_workflow_subscriptions(location_id,trigger_id,workflow_id,trigger_key,target_url) VALUES('location','trigger','workflow','tenx_wa_message_received','https://services.leadconnectorhq.com/workflows-marketplace/triggers/execute/location/trigger'),('location','status','workflow','tenx_wa_message_status_updated','https://services.leadconnectorhq.com/workflows-marketplace/triggers/execute/location/status');`);
assert.equal((await pool.query('SELECT count(*)::int AS n FROM ghl_workflow_deliveries')).rows[0].n,0);
await pool.query(`INSERT INTO messages(id,workspace_id,conversation_id,provider_connection_id,direction,origin,type,body,status,occurred_at) VALUES('new','workspace','conversation','provider','inbound','contact','text','new','received',clock_timestamp());UPDATE messages SET status='read' WHERE id='out';UPDATE messages SET status='read' WHERE id='out';`);
assert.equal((await pool.query('SELECT count(*)::int AS n FROM ghl_workflow_deliveries')).rows[0].n,2);
const calls=[];const svc=createWorkflowTriggers({pool,fetchImpl:async(url,o)=>{calls.push(JSON.parse(o.body));return{ok:true}}});await svc.tick();await svc.tick();assert.equal(calls.length,2);assert.equal(calls[0].contactId,'ghl-contact');
await pool.query(`UPDATE ghl_workflow_deliveries SET state='sending' WHERE message_id='new'`);await svc.tick();assert.equal(calls.length,2);assert.equal((await pool.query("SELECT state FROM ghl_workflow_deliveries WHERE message_id='new'")).rows[0].state,'uncertain');
await pool.query(`UPDATE ghl_workflow_subscriptions SET active=false;INSERT INTO messages(id,workspace_id,conversation_id,provider_connection_id,direction,origin,type,body,status,occurred_at) VALUES('disabled','workspace','conversation','provider','inbound','contact','text','no','received',clock_timestamp());`);assert.equal((await pool.query('SELECT count(*)::int AS n FROM ghl_workflow_deliveries')).rows[0].n,2);
}finally{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}});
