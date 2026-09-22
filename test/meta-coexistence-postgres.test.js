const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const { MetaWebhookRepository } = require('../src/messaging/metaWebhookRepository');
const { MetaCoexistenceWorker } = require('../src/messaging/metaCoexistenceWorker');
const url = process.env.TEST_DATABASE_URL;

test('coexistence durable sync, scoped imports, no imported workflows, contact removal and media reconciliation', { skip: !url, timeout: 60000 }, async () => {
  const schema = 'coex_' + crypto.randomBytes(8).toString('hex');
  const admin = new Pool({connectionString:url});
  const pool = new Pool({connectionString:url,options:'-c search_path='+schema});
  try {
    await admin.query('CREATE SCHEMA '+schema); await runMigrations(pool); await runMigrations(pool);
    await pool.query(`INSERT INTO users(id,name,email,password_hash,role) VALUES('owner','Owner','coex@example.invalid','test','client');
      INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Test',5,5,5);
      INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w','owner','Test','plan');
      INSERT INTO provider_connections(id,workspace_id,provider,label,status,settings) VALUES('c','w','whatsapp_cloud','Test','connecting','{"coexistence":true}');
      INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id) VALUES('n','owner','w','Test','+15551234567','c');
      INSERT INTO meta_connection_assets(provider_connection_id,workspace_id,waba_id,phone_number_id,display_phone_number) VALUES('c','w','987','123','+15551234567');
      INSERT INTO meta_coexistence_jobs(provider_connection_id,step) VALUES('c','subscribe'),('c','smb_app_state_sync'),('c','history');
      INSERT INTO ghl_installations(id,installation_id,location_id,workspace_id,encrypted_credentials,encryption_key_id,scopes,access_token_expires_at)
        VALUES('i','ie','l','w','test','key',ARRAY['contacts.write'],now()+interval '1 hour');
      INSERT INTO ghl_number_mappings(id,installation_id,workspace_id,location_id,whatsapp_number_id,provider_connection_id,conversation_provider_id)
        VALUES('map','i','w','l','n','c','ghl');
      INSERT INTO ghl_workflow_subscriptions(location_id,trigger_id,workflow_id,trigger_key,target_url,created_at)
        VALUES('l','t','f','tenx_wa_message_received','https://example.invalid','2000-01-01');`);
    const requests=[];
    const worker=new MetaCoexistenceWorker({pool,vault:{decrypt:()=>({accessToken:'fixture'})},graphClient:{request:async request=>{requests.push(request);return request.path[1]==='subscribed_apps'?{success:true}:{request_id:'request-'+requests.length};}}});
    await worker.tick();await worker.tick();await worker.tick();await worker.tick();
    assert.deepEqual(requests.map(r=>r.body.sync_type||'subscribe'),['subscribe','smb_app_state_sync','history']);
    assert.equal((await pool.query("SELECT count(*)::int n FROM meta_coexistence_jobs WHERE state='accepted'")).rows[0].n,3);
    const repository=new MetaWebhookRepository(pool);
    const value={metadata:{phone_number_id:'123',display_phone_number:'15551234567'}};
    const wrap=(field,contents,waba='987')=>({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field,value:{...value,...contents}}]}]});
    const drain=async()=>{for(const r of await repository.claim(100))await repository.processReceipt(r);};
    const old={id:'past',from:'923001234567',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'imported'}};
    const history=wrap('history',{history:[{metadata:{phase:0,progress:100},threads:[{id:'923001234567',messages:[old,{...old,id:'media',type:'media_placeholder'}]}]}]});
    assert.equal((await repository.admit(history)).accepted,3);await drain();
    assert.equal((await repository.admit(history)).duplicates,3);
    assert.equal((await pool.query('SELECT count(*)::int n FROM ghl_workflow_deliveries')).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM outbox_events')).rows[0].n,0);
    assert.equal((await pool.query('SELECT unread_count FROM conversations')).rows[0].unread_count,0);
    assert.equal((await repository.admit(wrap('messages',{messages:[{...old,id:'bad-tenant'}]},'999'))).unknown,1);
    await repository.admit(wrap('history',{messages:[{...old,id:'media',type:'image',image:{id:'asset',caption:'Photo'}}]}));await drain();
    assert.equal((await pool.query("SELECT type FROM messages WHERE external_message_id='media'")).rows[0].type,'image');
    await repository.admit(wrap('smb_message_echoes',{message_echoes:[{...old,id:'echo',from:'15551234567',to:'923001234567'}]}));await drain();
    assert.equal((await pool.query("SELECT direction FROM messages WHERE external_message_id='echo'")).rows[0].direction,'outbound');
    const contact={type:'contact',action:'add',contact:{phone_number:'923001234567',full_name:'Review Demo'},metadata:{timestamp:'100'}};
    await repository.admit(wrap('smb_app_state_sync',{state_sync:[contact]}));await drain();
    await repository.admit(wrap('smb_app_state_sync',{state_sync:[{...contact,action:'remove',contact:{phone_number:'923001234567'},metadata:{timestamp:'200'}}]}));await drain();
    await repository.admit(wrap('smb_app_state_sync',{state_sync:[{...contact,metadata:{timestamp:'150'}}]}));await drain();
    const saved=(await pool.query('SELECT display_name,attributes FROM contacts')).rows[0];
    assert.equal(saved.display_name,'Review Demo');assert.equal(saved.attributes.metaBusinessApp.c.removed,true);
    await repository.admit(wrap('history',{history:[{errors:[{code:2593109}]}]}));await drain();
    assert.equal((await pool.query("SELECT settings->>'historySharing' state FROM provider_connections WHERE id='c'")).rows[0].state,'declined');
    await repository.admit(wrap('messages',{messages:[{...old,id:'live',timestamp:String(Math.floor(Date.now()/1000))}]}));await drain();
    assert.equal((await pool.query('SELECT count(*)::int n FROM ghl_workflow_deliveries')).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM outbox_events')).rows[0].n,1);
  } finally { await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end(); }
});
