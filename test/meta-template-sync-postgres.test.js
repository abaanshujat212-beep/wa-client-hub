const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const { MetaTemplateSyncRepository } = require('../src/messaging/metaTemplateSyncRepository');
const connectionString = process.env.TEST_DATABASE_URL;

test('Meta template sync persists and archives only the exact tenant connection and number', { skip: !connectionString, timeout: 60000 }, async () => {
  const schema = `meta_template_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool);
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('admin','Admin','admin@template.test','x','admin'),('u2','Two','two@template.test','x','client')");
    await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Plan',5,5,5)");
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w1','admin','One','plan'),('w2','u2','Two','plan')");
    await pool.query("INSERT INTO provider_connections(id,workspace_id,provider,label,status,encrypted_credentials,encryption_key_id) VALUES('meta1','w1','whatsapp_cloud','Sales','active',decode('00','hex'),'v1'),('meta2','w2','whatsapp_cloud','Other','active',decode('00','hex'),'v1')");
    await pool.query("INSERT INTO meta_connection_assets(provider_connection_id,workspace_id,waba_id,phone_number_id) VALUES('meta1','w1','111','222'),('meta2','w2','333','444')");
    await pool.query("INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id,external_session_id) VALUES('sales','admin','w1','Sales','+923001110000','meta1','222'),('other','u2','w2','Other','+923002220000','meta2','444')");
    const repository = new MetaTemplateSyncRepository(pool, { decrypt() { return { accessToken: 'server-token' }; } });
    const scope = { actorId: 'admin', workspaceId: 'w1', connectionId: 'meta1' };
    const target = await repository.target(scope);
    assert.deepEqual(target, { workspaceId: 'w1', connectionId: 'meta1', numberId: 'sales', wabaId: '111', accessToken: 'server-token' });
    const first = [{ officialTemplateId: 't1', name: 'order_update', language: 'en', category: 'UTILITY', status: 'APPROVED', parameterFormat: 'POSITIONAL', components: [{ type: 'BODY', text: 'Hello' }] }];
    assert.equal((await repository.replace(scope, first))[0].status, 'APPROVED');
    await repository.replace(scope, []);
    assert.equal((await repository.list(scope))[0].status, 'ARCHIVED');
    const crossTenant = await pool.query("SELECT count(*)::int AS count FROM whatsapp_message_templates WHERE workspace_id='w2'");
    assert.equal(crossTenant.rows[0].count, 0);
    await assert.rejects(repository.target({ actorId: 'u2', workspaceId: 'w1', connectionId: 'meta1' }), error => error.code === 'META_CONNECTION_NOT_FOUND');
    const audit = await pool.query("SELECT details FROM audit_logs WHERE action='meta.templates.synced' ORDER BY created_at DESC LIMIT 1");
    assert.equal(audit.rows[0].details.numberId, 'sales');
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
