const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const { GhlProvisioningService } = require('../src/providers/ghlAutoProvisioning');

const connectionString = process.env.TEST_DATABASE_URL;
async function fixture() {
  const schema = `ghl_provisioning_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 15000 });
  await admin.query(`CREATE SCHEMA ${schema}`); await runMigrations(pool);
  await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('team','Team',20,20,20)");
  return { pool, admin, schema, async close(){ await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); } };
}
const vault = { encrypt(){ return { ciphertext: Buffer.from('fixture'), keyId: 'v1' }; } };
function token() { return { accessToken: 'fixture-access-token', refreshToken: 'fixture-refresh-token', tokenType: 'Bearer', expiresIn: 3600 }; }

test('first GHL install is idempotent under concurrent provisioning and locations stay isolated', { skip: !connectionString, timeout: 60000 }, async () => {
  const db = await fixture();
  try {
    const service = new GhlProvisioningService({ pool: db.pool, vault });
    const identity = { installationId: 'agency-1:location-1', locationId: 'location-1', companyId: 'agency-1', ghlUserId: 'ghl-user-1', email: 'owner@example.test', roleType: 'company_owner' };
    const results = await Promise.all([service.provision({ identity, token: token(), grantedScopes: ['conversations.write'] }), service.provision({ identity, token: token(), grantedScopes: ['conversations.write'] })]);
    assert.equal(new Set(results.map(row => row.workspaceId)).size, 1);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM ghl_installations WHERE location_id=$1', ['location-1'])).rows[0].n, 1);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 1);
    const second = await service.provision({ identity: { ...identity, installationId: 'agency-1:location-2', locationId: 'location-2', ghlUserId: 'ghl-user-2', email: 'second@example.test' }, token: token(), grantedScopes: ['conversations.write'] });
    assert.notEqual(second.workspaceId, results[0].workspaceId);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('assignment constraints allow many users per number but one active number per user', { skip: !connectionString, timeout: 60000 }, async () => {
  const db = await fixture();
  try {
    await db.pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('u1','One','one@example.test','x','client'),('u2','Two','two@example.test','x','client')");
    await db.pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w1','u1','Workspace','team')");
    await db.pool.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES('m1','w1','u1','owner'),('m2','w1','u2','agent')");
    await db.pool.query("INSERT INTO provider_connections(id,workspace_id,provider,label,status) VALUES('p1','w1','whatsapp_cloud','Meta','active')");
    await db.pool.query("INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id) VALUES('n1','u1','w1','One','+923001111111','p1'),('n2','u1','w1','Two','+923002222222','p1')");
    await db.pool.query("INSERT INTO whatsapp_number_assignments(id,workspace_id,whatsapp_number_id,user_id) VALUES('a1','w1','n1','u1'),('a2','w1','n1','u2')");
    await assert.rejects(db.pool.query("INSERT INTO whatsapp_number_assignments(id,workspace_id,whatsapp_number_id,user_id) VALUES('a3','w1','n2','u1')"), error => error.code === '23505');
    await db.pool.query("UPDATE whatsapp_number_assignments SET removed_at=now() WHERE id='a1'");
    await db.pool.query("INSERT INTO whatsapp_number_assignments(id,workspace_id,whatsapp_number_id,user_id) VALUES('a3','w1','n2','u1')");
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM whatsapp_number_assignments WHERE workspace_id='w1' AND removed_at IS NULL")).rows[0].n, 2);
  } finally { await db.close(); }
});
