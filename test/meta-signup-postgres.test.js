const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const connectionString = process.env.TEST_DATABASE_URL;

// Isolated schema; no live provider traffic. These routes exist only in the test harness.
test("PostgreSQL signup claims survive persisted session copies across two HTTP servers", { skip: !connectionString }, async () => {
  const { Pool } = require("pg");
  const express = require("express");
  const session = require("express-session");
  const PgStore = require("connect-pg-simple")(session);
  const { runMigrations } = require("../src/db/migrate");
  const { MetaSignupStateRepository } = require("../src/messaging/metaSignupStateRepository");
  const { MetaConnectionRepository } = require("../src/messaging/metaConnectionRepository");
  const { createMetaSignupHandlers } = require("../src/messaging/metaSignupOrchestrator");
  const schema = `signup_${crypto.randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString });
  const pools = [0, 1].map(() => new Pool({ connectionString, options: `-c search_path=${schema}` }));
  const servers = []; const sessionStores = [];
  let providerCalls = 0;
  let allowManagement = true;
  const actorId = "signup-owner"; const workspaceId = "signup-workspace";
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pools[0]);
    await runMigrations(pools[0]); // Migration checksums/idempotent rerun.
    await pools[0].query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Signup Owner','signup@test.local','unused','client')", [actorId]);
    await pools[0].query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('signup-plan','Test',1,3,3)");
    await pools[0].query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES($1,$2,'Signup Test','signup-plan')", [workspaceId, actorId]);
    for (const pool of pools) {
      const app = express(); app.use(express.json());
      const sessionStore = new PgStore({ pool, schemaName: schema, tableName: "user_sessions", createTableIfMissing: true, pruneSessionInterval: false });
      sessionStores.push(sessionStore);
      app.use(session({ store: sessionStore, secret: "integration-test-session-secret-not-for-production", resave: false, saveUninitialized: false, cookie: { secure: false } }));
      app.post("/fixture-login", (req, res) => { req.session.userId = actorId; req.session.csrf = "fixture-csrf"; res.json({ ok: true }); });
      app.use((req, res, next) => {
        if (!req.session.userId) return res.sendStatus(401);
        if (req.get("x-csrf-token") !== req.session.csrf) return res.sendStatus(403);
        req.user = { id: req.session.userId, active: true }; next();
      });
      const handlers = createMetaSignupHandlers({
        store: { canManageWorkspace: (_user, id) => allowManagement && id === workspaceId, addAudit() { throw new Error("Snapshot audit must not run"); } },
        stateRepository: new MetaSignupStateRepository(pool),
        signupService: { async exchangeAndVerify() {
          providerCalls++;
          await new Promise(resolve => setTimeout(resolve, 40));
          return { accessToken: "fixture-not-real-meta-access-token", businessAccountId: "987654321", phoneNumberId: "123456789", displayPhoneNumber: "+923001112222" };
        } },
        connectionRepository: new MetaConnectionRepository(pool, { encrypt() { return { ciphertext: Buffer.from("fixture-ciphertext"), keyId: "fixture" }; } }),
      });
      app.post("/start", handlers.start); app.post("/complete", handlers.complete);
      const server = app.listen(0, "127.0.0.1"); servers.push(server); await once(server, "listening");
    }
    const urls = servers.map(server => `http://127.0.0.1:${server.address().port}`);
    const login = await fetch(`${urls[0]}/fixture-login`, { method: "POST" });
    const cookie = login.headers.get("set-cookie").split(";")[0]; await login.json();
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": "fixture-csrf" };
    const post = (url, body, customHeaders = headers) => fetch(url, { method: "POST", headers: customHeaders, body: JSON.stringify(body) });
    const start = async () => {
      const res = await post(`${urls[0]}/start`, { workspaceId, label: "Official WA" });
      assert.equal(res.status, 201); return (await res.json()).state;
    };
    assert.equal((await post(`${urls[0]}/start`, { workspaceId, label: "Official WA" }, { ...headers, "x-csrf-token": "invalid" })).status, 403);
    const state = await start();
    const stored = (await pools[0].query("SELECT * FROM meta_signup_states")).rows[0];
    assert.match(stored.state_hash, /^[0-9a-f]{64}$/); assert.equal(JSON.stringify(stored).includes(state), false);
    const wrongSession = await new MetaSignupStateRepository(pools[1]).consume({ state, sessionId: "other-session", actorId });
    assert.equal(wrongSession, null);
    const body = { state, code: "fixture-code", businessAccountId: "987654321", phoneNumberId: "123456789", workspaceId: "attacker-workspace" };
    const replies = await Promise.all(urls.map(url => post(`${url}/complete`, body)));
    assert.deepEqual(replies.map(res => res.status).sort(), [201, 409]);
    const payloads = await Promise.all(replies.map(res => res.json()));
    assert.equal(providerCalls, 1);
    assert.doesNotMatch(JSON.stringify(payloads), /fixture-not-real-meta-access-token|fixture-ciphertext/);
    assert.equal((await pools[0].query("SELECT count(*)::int AS n FROM provider_connections WHERE workspace_id=$1 AND status='connecting'", [workspaceId])).rows[0].n, 1);
    assert.equal((await pools[0].query("SELECT count(*)::int AS n FROM whatsapp_numbers WHERE workspace_id=$1 AND automation_enabled=false", [workspaceId])).rows[0].n, 1);
    assert.equal((await pools[0].query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed'")).rows[0].n, 1);
    assert.equal((await post(`${urls[1]}/complete`, body)).status, 409);
    const expired = await start();
    await pools[0].query("UPDATE meta_signup_states SET expires_at=clock_timestamp()-interval '1 second'");
    assert.equal((await post(`${urls[1]}/complete`, { ...body, state: expired })).status, 409);
    const revoked = await start(); allowManagement = false;
    assert.equal((await post(`${urls[1]}/complete`, { ...body, state: revoked })).status, 404);
    allowManagement = true;
    assert.equal((await post(`${urls[1]}/complete`, { ...body, state: revoked })).status, 409);
    assert.equal(providerCalls, 1);
  } finally {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    for (const store of sessionStores) store.close();
    for (const pool of pools) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
