const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const connectionString = process.env.TEST_DATABASE_URL;

async function databaseFixture(prefix) {
  const { Pool } = require('pg');
  const { runMigrations } = require('../src/db/migrate');
  const schema = `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 15000 });
  await admin.query(`CREATE SCHEMA ${schema}`); await runMigrations(pool); await runMigrations(pool);
  await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('owner','Owner','owner@test.local','unused','client')");
  await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('test-plan','Test',99,3,3)");
  return { schema, pool, async workspace(id) { await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES($1,'owner',$1,'test-plan')", [id]); await pool.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES($1,$2,'owner','owner')", [`member-${id}`, id]); }, async close() { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); } };
}
function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test('PostgreSQL signup claims are released after provider failure and finalized after one successful install', { skip: !connectionString, timeout: 60000 }, async () => {
  const { NumberCreationPolicy } = require('../src/db/numberCreationPolicy'); const { MetaSignupStateRepository } = require('../src/messaging/metaSignupStateRepository'); const { MetaConnectionRepository } = require('../src/messaging/metaConnectionRepository'); const { createMetaSignupHandlers } = require('../src/messaging/metaSignupOrchestrator');
  const db = await databaseFixture('retry'); let first = true;
  try {
    await db.workspace('workspace');
    const handlers = createMetaSignupHandlers({ authorization: new NumberCreationPolicy(db.pool), stateRepository: new MetaSignupStateRepository(db.pool), signupService: { async exchangeAndVerify() { if (first) { first = false; throw Object.assign(new Error('temporary Meta network failure'), { code: 'META_CODE_EXCHANGE_FAILED' }); } return { accessToken: 'fixture-not-real-meta-access-token', metaUserId: '555666777', businessAccountId: '987654321', phoneNumberId: '123456789', displayPhoneNumber: '+923001112222' }; } }, connectionRepository: new MetaConnectionRepository(db.pool, { encrypt() { return { ciphertext: Buffer.from('fixture'), keyId: 'fixture' }; } }) });
    const request = body => ({ user: { id: 'owner', active: true }, sessionID: 'session-a', session: {}, body });
    const started = response(); await handlers.start(request({ workspaceId: 'workspace', label: 'Official' }), started); assert.equal(started.statusCode, 201); const state = started.body.state;
    const body = { state, code: 'fixture-code', businessAccountId: '987654321', phoneNumberId: '123456789' };
    const failed = response(); await handlers.complete(request(body), failed); assert.equal(failed.statusCode, 502);
    const pending = await db.pool.query("SELECT status FROM meta_signup_states WHERE expires_at>now()"); assert.equal(pending.rows[0].status, 'pending');
    const success = response(); await handlers.complete(request(body), success); assert.equal(success.statusCode, 201);
    const replay = response(); await handlers.complete(request(body), replay); assert.equal(replay.statusCode, 409);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM provider_connections WHERE provider='whatsapp_cloud'")).rows[0].n, 1);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed'")).rows[0].n, 1);
  } finally { await db.close(); }
});

test('Meta and runtime legacy creation share transactional last-slot, billing and workspace guards', { skip: !connectionString, timeout: 60000 }, async () => {
  const PostgresRepository = require('../src/db/postgresRepository'); const PostgresStore = require('../src/db/postgresStore'); const { MetaConnectionRepository } = require('../src/messaging/metaConnectionRepository'); const db = await databaseFixture('limits'); const store = () => new PostgresStore(process.cwd(), { repository: new PostgresRepository({ pool: db.pool, connectionString }) }); let sequence = 200000000; const meta = new MetaConnectionRepository(db.pool, { encrypt() { return { ciphertext: Buffer.from('fixture'), keyId: 'fixture' }; } }); const createMeta = (workspaceId, actorId = 'owner') => { const id = String(++sequence); return meta.install({ workspaceId, actorId, label: 'Official', phoneNumberId: id, businessAccountId: '987654321', phone: `+92${id}`, accessToken: 'fixture-not-a-real-provider-secret' }); }; const createLegacy = workspaceId => store().createAccount({ workspaceId, ownerId: 'owner', label: 'Legacy', phone: `+92${++sequence}` });
  try { for (const [workspace, creators] of [['mixed', [createMeta, createLegacy]], ['metas', [createMeta, createMeta]], ['legacies', [createLegacy, createLegacy]]]) { await db.workspace(workspace); const results = await Promise.allSettled(creators.map(create => create(workspace))); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, workspace); const error = results.find(result => result.status === 'rejected').reason; assert.ok(error.code === 'NUMBER_LIMIT_REACHED' || /Plan limit reached/.test(error.message)); assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM whatsapp_numbers WHERE workspace_id=$1', [workspace])).rows[0].n, 1); const connections = (await db.pool.query('SELECT count(*)::int AS n FROM provider_connections WHERE workspace_id=$1', [workspace])).rows[0].n; const audit = (await db.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed' AND details->>'workspaceId'=$1", [workspace])).rows[0].n; assert.equal(connections, audit); assert.ok(connections <= 1); } await db.workspace('blocked'); for (const status of ['pending', 'past_due', 'canceled', 'unpaid']) { await db.pool.query('UPDATE workspaces SET billing_status=$1 WHERE id=$2', [status, 'blocked']); await assert.rejects(createMeta('blocked'), error => error.code === 'BILLING_RESOURCE_BLOCKED'); await assert.rejects(createLegacy('blocked'), /Billing status/); } await db.pool.query("UPDATE workspaces SET billing_status='manual',status='suspended' WHERE id='blocked'"); await assert.rejects(createMeta('blocked'), error => error.code === 'WORKSPACE_INACTIVE'); await assert.rejects(createLegacy('blocked'), error => error.code === 'WORKSPACE_INACTIVE'); await db.pool.query("UPDATE workspaces SET status='active' WHERE id='blocked'"); const { NumberCreationPolicy } = require('../src/db/numberCreationPolicy'); await db.pool.query("DELETE FROM workspace_members WHERE workspace_id='blocked'"); const policy = new NumberCreationPolicy(db.pool); assert.equal(await policy.canManageWorkspace({ id: 'owner', role: 'admin' }, 'blocked'), false); await assert.rejects(createMeta('blocked'), error => error.code === 'WORKSPACE_NOT_FOUND'); assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM provider_connections WHERE workspace_id='blocked'")).rows[0].n, 0); await db.pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('platform-admin','Admin','admin@test.local','unused','admin')"); assert.equal(await policy.canManageWorkspace({ id: 'platform-admin' }, 'blocked'), true); await createMeta('blocked', 'platform-admin'); } finally { await db.close(); }
});
