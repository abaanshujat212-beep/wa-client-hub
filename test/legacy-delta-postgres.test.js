const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const connectionString = process.env.TEST_DATABASE_URL;

test('runtime delta writes preserve direct Meta records, canonical children, audit history and other writers', { skip: !connectionString }, async () => {
  const { Pool } = require('pg');
  const PostgresRepository = require('../src/db/postgresRepository');
  const PostgresStore = require('../src/db/postgresStore');
  const { MetaConnectionRepository } = require('../src/messaging/metaConnectionRepository');
  const { applyLegacyDelta } = require('../src/db/legacyDelta');
  const schema = `delta_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const repository = new PostgresRepository({ pool, connectionString });
  const secondRepository = new PostgresRepository({ pool, connectionString });
  const store = new PostgresStore(process.cwd(), { repository });
  const second = new PostgresStore(process.cwd(), { repository: secondRepository });
  const initOptions = { adminEmail: 'delta-admin@test.local', adminPassword: 'TestOnlyPassword123!' };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await store.init(initOptions);
    const user = await store.createClient({ name: 'Owner', email: 'delta-owner@test.local', password: 'TestOnlyPassword123!' });
    const workspace = await store.createWorkspace({ ownerId: user.id, name: 'Workspace A', planId: 'business' });
    const otherWorkspace = await store.createWorkspace({ ownerId: user.id, name: 'Workspace B', planId: 'business' });
    const legacy = await store.createAccount({ workspaceId: workspace.id, ownerId: user.id, label: 'Legacy', phone: '+923009999999' });
    await second.init(initOptions); // Both caches predate Meta installation.
    const meta = new MetaConnectionRepository(pool, { encrypt() { return { ciphertext: Buffer.from('fixture-ciphertext'), keyId: 'test-only' }; } });
    const install = (workspaceId, phoneNumberId, phone) => meta.install({ workspaceId, actorId: user.id, label: 'Official', phoneNumberId, phone, businessAccountId: '987654321', accessToken: 'fixture-meta-token-not-a-live-secret' });
    const installed = await install(workspace.id, '123456789', '+923001112222');
    const other = await install(otherWorkspace.id, '123456790', '+923001112223');
    await pool.query("INSERT INTO contacts(id,workspace_id,phone_e164) VALUES('delta-contact',$1,'+923004444444')", [workspace.id]);
    await pool.query("INSERT INTO conversations(id,workspace_id,whatsapp_number_id,contact_id) VALUES('delta-thread',$1,$2,'delta-contact')", [workspace.id, installed.number.id]);
    await pool.query("INSERT INTO messages(id,workspace_id,conversation_id,direction,origin,type,body,occurred_at) VALUES('delta-message',$1,'delta-thread','inbound','contact','text','preserve me',now())", [workspace.id]);
    await pool.query("INSERT INTO message_status_events(id,workspace_id,message_id,status,occurred_at) VALUES('delta-status',$1,'delta-message','received',now())", [workspace.id]);
    await pool.query("INSERT INTO message_attachments(id,workspace_id,message_id,media_type) VALUES('delta-attachment',$1,'delta-message','image')", [workspace.id]);
    await pool.query("INSERT INTO audit_logs(id,action,details) SELECT 'delta-history-' || n,'fixture.history','{}'::jsonb FROM generate_series(1,510) n");
    const beforeAudit = (await pool.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n;
    await store.addAudit(user.id, 'delta.normal-mutation');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, beforeAudit + 1);
    assert.equal(store.data.audit.length, 500); // UI cap only, not durable deletion.
    await second.updateWorkspace(workspace.id, { name: 'Renamed safely' });
    await store.touchAccount(installed.number.id);
    await assert.rejects(store.createAccount({ workspaceId: workspace.id, label: 'Duplicate', phone: '+923001112222' }), /already added/);
    await Promise.all([store.addAudit(user.id, 'delta.writer-a'), second.addAudit(user.id, 'delta.writer-b')]);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action IN ('delta.writer-a','delta.writer-b')")).rows[0].n, 2);

    // Installation between snapshot load and mutation commit must also survive.
    const originalLoad = repository.loadLegacyState.bind(repository);
    let late;
    repository.loadLegacyState = async () => {
      const snapshot = await originalLoad();
      repository.loadLegacyState = originalLoad;
      late = await install(workspace.id, '123456791', '+923001112224');
      return snapshot;
    };
    await store.addAudit(user.id, 'delta.racing-insert');
    assert.ok((await pool.query('SELECT id FROM whatsapp_numbers WHERE id=$1', [late.number.id])).rowCount);

    // Existing scoped delete remains functional, without deleting other numbers.
    await second.deleteAccount(legacy.id);
    assert.equal((await pool.query('SELECT id FROM whatsapp_numbers WHERE id=$1', [legacy.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT id FROM whatsapp_numbers WHERE id=ANY($1::text[])', [[installed.number.id, other.number.id, late.number.id]])).rowCount, 3);
    const mapping = (await pool.query('SELECT provider_connection_id,external_session_id,automation_enabled FROM whatsapp_numbers WHERE id=$1', [installed.number.id])).rows[0];
    assert.deepEqual(mapping, { provider_connection_id: installed.connection.id, external_session_id: '123456789', automation_enabled: false });
    assert.equal((await pool.query("SELECT body FROM messages WHERE id='delta-message'")).rows[0].body, 'preserve me');
    assert.equal((await pool.query("SELECT id FROM message_status_events WHERE id='delta-status'")).rowCount, 1);
    assert.equal((await pool.query("SELECT id FROM message_attachments WHERE id='delta-attachment'")).rowCount, 1);

    // A stale same-field update is rejected, not applied over another writer.
    const stale = await repository.loadLegacyState();
    await second.updateWorkspace(workspace.id, { name: 'Concurrent winner' });
    const attempted = structuredClone(stale); attempted.workspaces.find(row => row.id === workspace.id).name = 'Stale loser';
    await assert.rejects(applyLegacyDelta(pool, stale, attempted), error => error.code === 'LEGACY_WRITE_CONFLICT');
    assert.equal((await pool.query('SELECT name FROM workspaces WHERE id=$1', [workspace.id])).rows[0].name, 'Concurrent winner');

    // Rollback all changes when a later insert violates a DB constraint.
    const beforeFailure = await repository.loadLegacyState(); const invalid = structuredClone(beforeFailure);
    invalid.workspaces.find(row => row.id === workspace.id).name = 'Must roll back';
    invalid.audit.unshift({ id: 'invalid-audit', action: null, details: {}, createdAt: new Date().toISOString() });
    await assert.rejects(applyLegacyDelta(pool, beforeFailure, invalid));
    assert.equal((await pool.query('SELECT name FROM workspaces WHERE id=$1', [workspace.id])).rows[0].name, 'Concurrent winner');

    // Nested invite mutations and subsequent restart still use the established contract.
    const invite = await store.createInvite({ workspaceId: workspace.id, email: 'delta-agent@test.local', name: 'Agent', role: 'agent', createdBy: user.id });
    const agent = await store.acceptInvite({ token: invite.token, password: 'TestOnlyPassword123!' });
    assert.equal((await pool.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspace.id, agent.id])).rows[0].role, 'agent');
    const restarted = new PostgresStore(process.cwd(), { repository }); await restarted.init(initOptions);
    assert.ok(restarted.findAccount(installed.number.id)); assert.ok(restarted.findAccount(other.number.id)); assert.ok(restarted.findAccount(late.number.id));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='meta.connection.installed'")).rows[0].n, 3);
    assert.equal((await pool.query("SELECT id FROM messages WHERE id='delta-message'")).rowCount, 1);
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
