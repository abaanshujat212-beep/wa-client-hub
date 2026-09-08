const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const connectionString = process.env.TEST_DATABASE_URL;

test('protected signup routes enforce sessions, CSRF, origin, shared limits and bounded cleanup', { skip: !connectionString, timeout: 60000 }, async () => {
  const { Pool } = require('pg');
  const express = require('express');
  const session = require('express-session');
  const PgStore = require('connect-pg-simple')(session);
  const { runMigrations } = require('../src/db/migrate');
  const { createMetaSignupRouter } = require('../src/messaging/metaSignupRoutes');
  const { MetaSignupProtection } = require('../src/messaging/metaSignupProtection');
  const { MetaSignupStateRepository } = require('../src/messaging/metaSignupStateRepository');
  const schema = `routes_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pools = [0,1].map(() => new Pool({ connectionString, options: `-c search_path=${schema}`, statement_timeout: 15000 }));
  const servers = []; const sessionStores = [];
  const token = 'a'.repeat(48); const origin = 'https://hub.example.test'; let exchanges = 0;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await runMigrations(pools[0]); await runMigrations(pools[0]);
    await pools[0].query("INSERT INTO users(id,name,email,password_hash,role) VALUES('owner','Owner','owner@test.local','unused','client')");
    await pools[0].query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Plan',1,10,3)");
    await pools[0].query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w','owner','Workspace','plan')");
    await pools[0].query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES('m','w','owner','owner')");
    for (const pool of pools) {
      const app = express();
      const store = new PgStore({ pool, schemaName: schema, tableName: 'route_sessions', createTableIfMissing: true, pruneSessionInterval: false }); sessionStores.push(store);
      app.use(session({ store, secret: 'fixture-session-secret-not-for-production', resave: false, saveUninitialized: false }));
      app.post('/login', (req,res) => { req.session.userId = 'owner'; req.session.csrfToken = token; res.json({ ok: true }); });
      const options = { enabled: true, pool, origin,
        signupService: { async exchangeAndVerify() { exchanges++; return { accessToken: 'fixture-not-a-real-meta-credential', businessAccountId: '123', phoneNumberId: '456', displayPhoneNumber: '+923001112222' }; } },
        vault: { encrypt() { return { ciphertext: Buffer.from('fixture-ciphertext'), keyId: 'fixture' }; } },
      };
      app.use('/signup', createMetaSignupRouter(options));
      app.use('/disabled', createMetaSignupRouter());
      app.use('/unavailable', createMetaSignupRouter({ ...options, pool: { connect: pool.connect.bind(pool), async query() { throw new Error('password=secret-provider-token'); } } }));
      const server = app.listen(0,'127.0.0.1'); servers.push(server); await once(server,'listening');
    }
    const urls = servers.map(server => `http://127.0.0.1:${server.address().port}`);
    const login = async index => { const res = await fetch(`${urls[index]}/login`, { method: 'POST' }); await res.json(); return res.headers.get('set-cookie').split(';')[0]; };
    const cookies = [await login(0), await login(1)];
    const post = (index, path, body, changes = {}) => fetch(`${urls[index]}${path}`, { method: 'POST', headers: { cookie: cookies[index], origin, 'x-csrf-token': token, 'content-type': 'application/json', ...changes }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const input = { workspaceId: 'w', label: 'Official' };
    const reset = () => pools[0].query('DELETE FROM meta_signup_rate_limits');
    assert.equal((await post(0,'/disabled/start',input)).status,404);
    assert.equal((await post(0,'/signup/start',input,{ cookie: '' })).status,401);
    assert.equal((await post(0,'/signup/start',input,{ 'x-csrf-token': '' })).status,403);
    assert.equal((await post(0,'/signup/start',input,{ origin: 'https://attacker.test' })).status,403);
    assert.equal((await post(0,'/signup/start',input,{ origin: '' })).status,403);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM meta_signup_rate_limits')).rows[0].n,0);
    await pools[0].query("UPDATE users SET active=false WHERE id='owner'");
    assert.equal((await post(0,'/signup/start',input)).status,401);
    await pools[0].query("UPDATE users SET active=true WHERE id='owner'");
    assert.equal((await post(0,'/signup/start',input,{ 'content-type': 'text/plain' })).status,415);
    assert.equal((await post(0,'/signup/start','{bad-json')).status,400);
    assert.equal((await post(0,'/signup/start',{ ...input, actorId: 'admin' })).status,400);
    assert.equal((await post(0,'/signup/start',{ ...input, label: 'x'.repeat(20000) })).status,413);
    assert.equal(exchanges,0); await reset();

    const started = await post(0,'/signup/start',input); assert.equal(started.status,201); assert.equal(started.headers.get('cache-control'),'no-store');
    const { state } = await started.json();
    const completion = { state, code: 'fixture-code', businessAccountId: '123', phoneNumberId: '456' };
    // Same actor but different persisted session cannot steal a state.
    assert.equal((await post(1,'/signup/complete',completion)).status,409);
    const success = await post(0,'/signup/complete',completion); assert.equal(success.status,201);
    assert.doesNotMatch(JSON.stringify(await success.json()), /fixture-not-a-real|ciphertext/);
    assert.equal((await post(0,'/signup/complete',completion)).status,409); assert.equal(exchanges,1);
    await reset();
    const starts = await Promise.all(Array.from({ length: 8 },(_,i) => post(i%2,'/signup/start',input)));
    assert.equal(starts.filter(res => res.status===201).length,5);
    assert.equal(starts.filter(res => res.status===429).length,3);
    assert.ok(Number(starts.find(res => res.status===429).headers.get('retry-after')) > 0);
    const newCookie = await login(0); cookies[0] = newCookie;
    assert.equal((await post(0,'/signup/start',input)).status,429); // A fresh session does not reset actor quota.
    const callbacks = await Promise.all(Array.from({ length: 12 },(_,i) => post(i%2,'/signup/complete',{ ...completion, state: 'z'.repeat(43) })));
    assert.equal(callbacks.filter(res => res.status===409).length,10);
    assert.equal(callbacks.filter(res => res.status===429).length,2); assert.equal(exchanges,1);
    const failure = await post(0,'/unavailable/start',input); assert.equal(failure.status,503);
    assert.doesNotMatch(JSON.stringify(await failure.json()), /password|secret-provider-token/);

    // Window expiry resets admission; cleanup must not reset a live counter.
    await pools[0].query("UPDATE meta_signup_rate_limits SET expires_at=now()-interval '1 second'");
    const protection = new MetaSignupProtection(pools[1]);
    assert.equal((await protection.consume('owner','start')).allowed,true);
    await pools[0].query("UPDATE meta_signup_states SET expires_at=now()-interval '1 second'");
    await new MetaSignupStateRepository(pools[0]).create({ state: crypto.randomBytes(32).toString('base64url'), sessionId: 'fixture', actorId: 'owner', workspaceId: 'w', label: 'Live' });
    const before = (await pools[0].query('SELECT count(*)::int AS n FROM meta_signup_states')).rows[0].n;
    const removed = await protection.cleanup(2); assert.equal(removed.states,2);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM meta_signup_states')).rows[0].n,before-2);
    await Promise.all([protection.cleanup(1000), new MetaSignupProtection(pools[0]).cleanup(1000)]);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM meta_signup_states')).rows[0].n,1);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM meta_signup_rate_limits')).rows[0].n,1);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM whatsapp_numbers')).rows[0].n,1);
    assert.equal((await pools[0].query('SELECT count(*)::int AS n FROM provider_connections')).rows[0].n,1);
    assert.equal((await pools[0].query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed'")).rows[0].n,1);
  } finally {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    for (const store of sessionStores) store.close();
    for (const pool of pools) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
