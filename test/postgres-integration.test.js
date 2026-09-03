const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const PostgresRepository = require('../src/db/postgresRepository');
const PostgresStore = require('../src/db/postgresStore');
const { DEFAULT_PLANS } = require('../src/store');

const connectionString = process.env.TEST_DATABASE_URL;

test('PostgreSQL migration and legacy JSON round trip', { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString });
  const repository = new PostgresRepository({ pool, connectionString });
  const suffix = crypto.randomUUID();
  const userId = `user-${suffix}`;
  const workspaceId = `workspace-${suffix}`;
  const numberId = `number-${suffix}`;
  const now = new Date().toISOString();
  try {
    await repository.init();
    await repository.init();
    await repository.replaceLegacyState({
      plans: DEFAULT_PLANS,
      users: [{ id: userId, name: 'Postgres Client', email: `${suffix}@test.local`, passwordHash: 'hash', role: 'client', active: true, createdAt: now }],
      workspaces: [{ id: workspaceId, ownerId: userId, name: 'Postgres Workspace', planId: 'team', status: 'active', billingProvider: 'manual', billingStatus: 'manual', createdAt: now }],
      workspaceMembers: [{ id: `member-${suffix}`, workspaceId, userId, role: 'owner', createdAt: now }],
      accounts: [{ id: numberId, ownerId: userId, workspaceId, label: 'Support', phone: '+923001111111', createdAt: now, lastLaunchedAt: null }],
      invites: [],
      audit: [{ id: `audit-${suffix}`, userId, action: 'import.test', details: { ok: true }, createdAt: now }]
    }, { requireEmpty: false, destructiveReplace: true });
    const data = await repository.loadLegacyState();
    assert.equal(data.users[0].email, `${suffix}@test.local`);
    assert.equal(data.workspaces[0].id, workspaceId);
    assert.equal(data.accounts[0].workspaceId, workspaceId);
    assert.deepEqual(data.audit[0].details, { ok: true });

    const runtimeStore = new PostgresStore(process.cwd(), { repository });
    await runtimeStore.init({ adminEmail: 'admin@test.local', adminPassword: 'AdminPassword123!' });
    const second = await runtimeStore.createClient({ name: 'Runtime Client', email: `runtime-${suffix}@test.local`, password: 'RuntimePassword123!' });
    const secondWorkspace = await runtimeStore.createWorkspace({ ownerId: second.id, name: 'Runtime Workspace', planId: 'team' });
    const secondNumber = await runtimeStore.createAccount({ ownerId: second.id, workspaceId: secondWorkspace.id, label: 'Runtime WA', phone: '+923002222222' });
    const contactId = `contact-${suffix}`;
    const conversationId = `conversation-${suffix}`;
    const messageId = `message-${suffix}`;
    await pool.query('INSERT INTO contacts (id,workspace_id,display_name,phone_e164) VALUES ($1,$2,$3,$4)', [contactId, secondWorkspace.id, 'Customer', '+923003333333']);
    await pool.query('INSERT INTO conversations (id,workspace_id,whatsapp_number_id,contact_id) VALUES ($1,$2,$3,$4)', [conversationId, secondWorkspace.id, secondNumber.id, contactId]);
    await pool.query("INSERT INTO messages (id,workspace_id,conversation_id,direction,origin,type,body,occurred_at) VALUES ($1,$2,$3,'inbound','contact','text','preserve me',now())", [messageId, secondWorkspace.id, conversationId]);
    await runtimeStore.addAudit(second.id, 'runtime.persisted', { accountId: secondNumber.id });
    const persisted = await repository.loadLegacyState();
    assert.ok(persisted.users.some((row) => row.id === second.id));
    assert.ok(persisted.workspaces.some((row) => row.id === secondWorkspace.id));
    assert.ok(persisted.accounts.some((row) => row.id === secondNumber.id));
    assert.ok(persisted.audit.some((row) => row.action === 'runtime.persisted'));
    const canonicalMessage = await pool.query('SELECT body FROM messages WHERE id = $1', [messageId]);
    assert.equal(canonicalMessage.rows[0].body, 'preserve me');
  } finally {
    await pool.end();
  }
});
