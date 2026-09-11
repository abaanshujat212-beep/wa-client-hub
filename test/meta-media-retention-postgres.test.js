const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const { MetaMediaRepository } = require('../src/messaging/metaMediaRepository');

const connectionString = process.env.TEST_DATABASE_URL;

test('Meta media retention columns preserve legacy attachments and isolate due candidates', { skip: !connectionString, timeout: 60000 }, async () => {
  const schema = `media_retention_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 15000 });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool);
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('owner','Owner','owner@media.test','unused','client')");
    await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Plan',5,5,5)");
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('workspace','owner','Workspace','plan')");
    await pool.query("INSERT INTO provider_connections(id,workspace_id,provider,label,status,encrypted_credentials,encryption_key_id) VALUES('connection','workspace','whatsapp_cloud','Official','active','ciphertext','key-1')");
    await pool.query("INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id,external_session_id,automation_enabled) VALUES('number','owner','workspace','Official','+923001112222','connection','123',false)");
    await pool.query("INSERT INTO meta_connection_assets(provider_connection_id,workspace_id,waba_id,phone_number_id,display_phone_number,token_status,webhook_subscribed,account_status) VALUES('connection','workspace','987','123','+923001112222','valid',true,'connected')");
    await pool.query("INSERT INTO contacts(id,workspace_id,phone_e164) VALUES('contact','workspace','+923009999999')");
    await pool.query("INSERT INTO conversations(id,workspace_id,whatsapp_number_id,contact_id) VALUES('conversation','workspace','number','contact')");
    await pool.query("INSERT INTO messages(id,workspace_id,conversation_id,provider_connection_id,external_message_id,direction,origin,type,body,status,occurred_at) VALUES('message','workspace','conversation','connection','provider-message','outbound','api','image','sent','accepted',now())");
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,media_type) VALUES('legacy-attachment','workspace','message','image')");
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,provider_connection_id,provider_media_id,media_type,provider_media_delete_after) VALUES('due-attachment','workspace','message','connection','provider-media','image',$1)", [new Date('2026-01-01T00:00:00Z')]);
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,provider_connection_id,provider_media_id,media_type,provider_media_delete_after) VALUES('future-attachment','workspace','message','connection','future-media','image',$1)", [new Date('2099-01-01T00:00:00Z')]);
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,provider_connection_id,provider_media_id,media_type,provider_media_delete_after,provider_media_deleted_at) VALUES('deleted-attachment','workspace','message','connection','deleted-media','image',$1,now())", [new Date('2026-01-01T00:00:00Z')]);
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,provider_connection_id,provider_media_id,media_type,provider_media_delete_after,provider_media_delete_attempts) VALUES('exhausted-attachment','workspace','message','connection','exhausted-media','image',$1,5)", [new Date('2026-01-01T00:00:00Z')]);

    const repository = new MetaMediaRepository(pool, { decrypt(ciphertext, connectionId, keyId) { assert.deepEqual([ciphertext, connectionId, keyId], ['ciphertext', 'connection', 'key-1']); return { accessToken: 'server-token' }; } });
    const candidates = await repository.listMediaCleanupCandidates({ now: new Date('2026-02-01T00:00:00Z'), limit: 100 });
    assert.deepEqual(candidates.map(row => row.attachmentId), ['due-attachment']);
    assert.equal(candidates[0].providerMediaId, 'provider-media');
    assert.equal(candidates[0].accessToken, 'server-token');
    assert.equal((await pool.query("SELECT provider_media_id,provider_media_delete_attempts,provider_media_deleted_at FROM message_attachments WHERE id='legacy-attachment'")).rows[0].provider_media_id, null);
    assert.equal((await pool.query("SELECT provider_media_delete_attempts FROM message_attachments WHERE id='due-attachment'")).rows[0].provider_media_delete_attempts, 0);

    await assert.rejects(pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,provider_connection_id,provider_media_id,media_type) VALUES('duplicate-attachment','workspace','message','connection','provider-media','image')"), error => error.code === '23505');
    assert.equal(await repository.markMediaCleanupFailure({ attachmentId: 'due-attachment', code: 'META_HTTP_500' }), true);
    const failed = (await pool.query("SELECT provider_media_delete_attempts,provider_media_last_error FROM message_attachments WHERE id='due-attachment'")).rows[0];
    assert.deepEqual(failed, { provider_media_delete_attempts: 1, provider_media_last_error: 'META_HTTP_500' });
    assert.equal(await repository.markMediaCleanupDeleted({ attachmentId: 'due-attachment' }), true);
    assert.equal((await repository.listMediaCleanupCandidates({ now: new Date('2026-02-01T00:00:00Z'), limit: 100 })).length, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
