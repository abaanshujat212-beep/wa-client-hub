const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const connectionString = process.env.TEST_DATABASE_URL;

async function databaseFixture(prefix) {
  const { Pool } = require('pg');
  const { runMigrations } = require('../src/db/migrate');
  const schema = `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 15000 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool); await runMigrations(pool);
  await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('owner','Owner','owner@test.local','unused','client')");
  await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('test-plan','Test',99,1,3)");
  return { schema, pool, async workspace(id) {
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES($1,'owner',$1,'test-plan')", [id]);
    await pool.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES($1,$2,'owner','owner')", [`member-${id}`, id]);
  }, async close() { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); } };
}

// Test-only HTTP routes; provider exchange/encryption are fixtures, not live Meta.
test('signup uses persisted sessions, durable claims and fresh DB authorization across HTTP servers', { skip: !connectionString, timeout: 60000 }, async () => {
  const express = require('express');
  const session = require('express-session');
  const PgStore = require('connect-pg-simple')(session);
  const { NumberCreationPolicy } = require('../src/db/numberCreationPolicy');
  const { MetaSignupStateRepository } = require('../src/messaging/metaSignupStateRepository');
  const { MetaConnectionRepository } = require('../src/messaging/metaConnectionRepository');
  const { createMetaSignupHandlers } = require('../src/messaging/metaSignupOrchestrator');
  const db = await databaseFixture('signup'); const servers = []; const sessionStores = [];
  let providerCalls = 0; let revokeDuringExchange = false;
  try {
    await db.workspace('workspace');
    const policy = new NumberCreationPolicy(db.pool);
    for (let i = 0; i < 2; i++) {
      const app = express(); app.use(express.json());
      const store = new PgStore({ pool: db.pool, schemaName: db.schema, tableName: 'user_sessions', createTableIfMissing: true, pruneSessionInterval: false });
      sessionStores.push(store);
      app.use(session({ store, secret: 'fixture-session-secret-not-for-production', resave: false, saveUninitialized: false }));
      app.post('/login', (req, res) => { req.session.userId = 'owner'; req.session.csrf = 'fixture'; res.json({ ok: true }); });
      app.use((req, res, next) => {
        if (!req.session.userId) return res.sendStatus(401);
        if (req.get('x-csrf-token') !== req.session.csrf) return res.sendStatus(403);
        req.user = { id: req.session.userId, role: 'admin', active: true }; // Deliberately stale/forged role: DB must win.
        next();
      });
      const handlers = createMetaSignupHandlers({
        authorization: policy, stateRepository: new MetaSignupStateRepository(db.pool),
        signupService: { async exchangeAndVerify() {
          providerCalls++;
          if (revokeDuringExchange) await db.pool.query("DELETE FROM workspace_members WHERE workspace_id='workspace'");
          await new Promise(resolve => setTimeout(resolve, 30));
          return { accessToken: 'fixture-not-real-meta-access-token', businessAccountId: '987654321', phoneNumberId: '123456789', displayPhoneNumber: '+923001112222' };
        } },
        connectionRepository: new MetaConnectionRepository(db.pool, { encrypt() { return { ciphertext: Buffer.from('fixture'), keyId: 'fixture' }; } }),
      });
      app.post('/start', handlers.start); app.post('/complete', handlers.complete);
      const server = app.listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
    }
    const urls = servers.map(server => `http://127.0.0.1:${server.address().port}`);
    const login = await fetch(`${urls[0]}/login`, { method: 'POST' });
    const cookie = login.headers.get('set-cookie').split(';')[0]; await login.json();
    const headers = { cookie, 'content-type': 'application/json', 'x-csrf-token': 'fixture' };
    const post = (index, path, body, override = headers) => fetch(`${urls[index]}${path}`, { method: 'POST', headers: override, body: JSON.stringify(body) });
    const start = async () => { const response = await post(0, '/start', { workspaceId: 'workspace', label: 'Official' }); assert.equal(response.status, 201); return (await response.json()).state; };
    const complete = (state, index = 1) => post(index, '/complete', { state, code: 'fixture-code', workspaceId: 'wrong-workspace', phoneNumberId: '123456789', businessAccountId: '987654321' });
    assert.equal((await post(0, '/start', { workspaceId: 'workspace', label: 'Official' }, { ...headers, 'x-csrf-token': 'wrong' })).status, 403);
    assert.equal((await post(0, '/start', { workspaceId: 'unknown', label: 'Official' })).status, 404);

    const revoked = await start();
    await db.pool.query("UPDATE workspace_members SET role='viewer' WHERE workspace_id='workspace'");
    assert.equal((await complete(revoked)).status, 404);
    assert.equal((await post(0, '/start', { workspaceId: 'workspace', label: 'Official' })).status, 404);
    assert.equal(providerCalls, 0);
    await db.pool.query("UPDATE workspace_members SET role='owner' WHERE workspace_id='workspace'");
    assert.equal((await complete(revoked)).status, 409);

    const inactive = await start(); await db.pool.query("UPDATE users SET active=false WHERE id='owner'");
    assert.equal((await complete(inactive)).status, 404); assert.equal(providerCalls, 0);
    await db.pool.query("UPDATE users SET active=true WHERE id='owner'");

    const midflight = await start(); revokeDuringExchange = true;
    assert.equal((await complete(midflight)).status, 404);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM provider_connections')).rows[0].n, 0);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, 0);
    revokeDuringExchange = false;
    await db.pool.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES('restored','workspace','owner','owner')");
    assert.equal((await complete(midflight)).status, 409);

    const expired = await start(); await db.pool.query("UPDATE meta_signup_states SET expires_at=now()-interval '1 second'");
    assert.equal((await complete(expired)).status, 409);
    const state = await start();
    const stored = (await db.pool.query('SELECT state_hash,session_hash FROM meta_signup_states WHERE expires_at>now()')).rows[0];
    assert.match(stored.state_hash, /^[0-9a-f]{64}$/); assert.match(stored.session_hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(stored).includes(state), false);
    assert.equal(await new MetaSignupStateRepository(db.pool).consume({ state, sessionId: 'wrong', actorId: 'owner' }), null);
    const replies = await Promise.all([complete(state, 0), complete(state, 1)]);
    assert.deepEqual(replies.map(res => res.status).sort(), [201, 409]);
    assert.equal(providerCalls, 2); // One rejected midflight exchange plus one successful exchange.
    const payloads = await Promise.all(replies.map(res => res.json()));
    assert.doesNotMatch(JSON.stringify(payloads), /fixture-not-real-meta-access-token/);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM provider_connections WHERE status='connecting'")).rows[0].n, 1);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM whatsapp_numbers WHERE automation_enabled=false')).rows[0].n, 1);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed'")).rows[0].n, 1);
    assert.equal((await complete(state)).status, 409);
  } finally {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    for (const store of sessionStores) store.close();
    await db.close();
  }
});

test('Meta and runtime legacy creation share transactional last-slot, billing and workspace guards', { skip: !connectionString, timeout: 60000 }, async () => {
  const PostgresRepository = require('../src/db/postgresRepository');
  const PostgresStore = require('../src/db/postgresStore');
  const { MetaConnectionRepository } = require('../src/messaging/metaConnectionRepository');
  const { NumberCreationPolicy } = require('../src/db/numberCreationPolicy');
  const db = await databaseFixture('limits');
  const store = () => new PostgresStore(process.cwd(), { repository: new PostgresRepository({ pool: db.pool, connectionString }) });
  let sequence = 200000000;
  const meta = new MetaConnectionRepository(db.pool, { encrypt() { return { ciphertext: Buffer.from('fixture'), keyId: 'fixture' }; } });
  const createMeta = (workspaceId, actorId = 'owner') => {
    const id = String(++sequence);
    return meta.install({ workspaceId, actorId, label: 'Official', phoneNumberId: id, businessAccountId: '987654321', phone: `+92${id}`, accessToken: 'fixture-not-a-real-provider-secret' });
  };
  const createLegacy = workspaceId => store().createAccount({ workspaceId, ownerId: 'owner', label: 'Legacy', phone: `+92${++sequence}` });
  try {
    for (const [workspace, creators] of [['mixed', [createMeta, createLegacy]], ['metas', [createMeta, createMeta]], ['legacies', [createLegacy, createLegacy]]]) {
      await db.workspace(workspace);
      const results = await Promise.allSettled(creators.map(create => create(workspace)));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, workspace);
      const error = results.find(result => result.status === 'rejected').reason;
      assert.ok(error.code === 'NUMBER_LIMIT_REACHED' || /Plan limit reached/.test(error.message));
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM whatsapp_numbers WHERE workspace_id=$1', [workspace])).rows[0].n, 1);
      const connections = (await db.pool.query('SELECT count(*)::int AS n FROM provider_connections WHERE workspace_id=$1', [workspace])).rows[0].n;
      const audit = (await db.pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed' AND details->>'workspaceId'=$1", [workspace])).rows[0].n;
      assert.equal(connections, audit); assert.ok(connections <= 1);
    }
    await db.workspace('blocked');
    for (const status of ['pending', 'past_due', 'canceled', 'unpaid']) {
      await db.pool.query('UPDATE workspaces SET billing_status=$1 WHERE id=$2', [status, 'blocked']);
      await assert.rejects(createMeta('blocked'), error => error.code === 'BILLING_RESOURCE_BLOCKED');
      await assert.rejects(createLegacy('blocked'), /Billing status/);
    }
    await db.pool.query("UPDATE workspaces SET billing_status='manual',status='suspended' WHERE id='blocked'");
    await assert.rejects(createMeta('blocked'), error => error.code === 'WORKSPACE_INACTIVE');
    await assert.rejects(createLegacy('blocked'), error => error.code === 'WORKSPACE_INACTIVE');
    await db.pool.query("UPDATE workspaces SET status='active' WHERE id='blocked'");
    const policy = new NumberCreationPolicy(db.pool);
    await db.pool.query("DELETE FROM workspace_members WHERE workspace_id='blocked'");
    assert.equal(await policy.canManageWorkspace({ id: 'owner', role: 'admin' }, 'blocked'), false);
    await assert.rejects(createMeta('blocked'), error => error.code === 'WORKSPACE_NOT_FOUND');
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM provider_connections WHERE workspace_id='blocked'")).rows[0].n, 0);
    await db.pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('platform-admin','Admin','admin@test.local','unused','admin')");
    assert.equal(await policy.canManageWorkspace({ id: 'platform-admin' }, 'blocked'), true);
    await createMeta('blocked', 'platform-admin');
  } finally { await db.close(); }
});
