const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const PostgresRepository = require('../src/db/postgresRepository');
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
    }, { requireEmpty: false });
    const data = await repository.loadLegacyState();
    assert.equal(data.users[0].email, `${suffix}@test.local`);
    assert.equal(data.workspaces[0].id, workspaceId);
    assert.equal(data.accounts[0].workspaceId, workspaceId);
    assert.deepEqual(data.audit[0].details, { ok: true });
  } finally {
    await pool.end();
  }
});
