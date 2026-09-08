const test = require('node:test');
const assert = require('node:assert/strict');
const { NumberCreationPolicy, assertNumberCreation } = require('../src/db/numberCreationPolicy');
function fixture({ active = true, member = true, status = 'active', billing = 'manual', limit = 3, total = 0, duplicate = false, role = 'client' } = {}) {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id,role,active')) return { rows: [{ active, role }] };
    if (sql.includes('FROM workspaces w')) return { rows: [{ id: 'w', owner_id: 'u', status, billing_status: billing, number_limit: limit }] };
    if (sql.startsWith('SELECT role')) return { rowCount: member ? 1 : 0, rows: [] };
    if (sql.startsWith('SELECT count')) return { rows: [{ total }] };
    if (sql.includes('regexp_replace')) return { rowCount: duplicate ? 1 : 0 };
    throw new Error('Unexpected query');
  } };
  return { client, calls };
}
const options = { requireManager: true, actorId: 'u', phone: '+923001112222' };
test('fresh authorization uses only the actor ID, not supplied role or cached active state', async () => {
  let query;
  const policy = new NumberCreationPolicy({ async query(sql, params) { query = { sql, params }; return { rowCount: 0 }; } });
  assert.equal(await policy.canManageWorkspace({ id: 'u', role: 'admin', active: true }, 'w'), false);
  assert.deepEqual(query.params, ['u', 'w']);
  assert.match(query.sql, /u.active=true/); assert.match(query.sql, /workspace_members/);
});
test('creation locks actor, workspace, plan and membership before checking the current count', async () => {
  const f = fixture(); await assertNumberCreation(f.client, 'w', options);
  assert.match(f.calls[0].sql, /FOR SHARE/);
  assert.match(f.calls[1].sql, /FOR UPDATE OF w FOR SHARE OF p/);
  assert.match(f.calls[2].sql, /FOR SHARE/);
  assert.equal(f.calls[3].sql.startsWith('SELECT count'), true);
});
for (const [name, config, code] of [
  ['inactive actor', { active: false }, 'WORKSPACE_NOT_FOUND'],
  ['revoked membership', { member: false }, 'WORKSPACE_NOT_FOUND'],
  ['inactive workspace', { status: 'suspended' }, 'WORKSPACE_INACTIVE'],
  ['pending billing', { billing: 'pending' }, 'BILLING_RESOURCE_BLOCKED'],
  ['past due billing', { billing: 'past_due' }, 'BILLING_RESOURCE_BLOCKED'],
  ['canceled billing', { billing: 'canceled' }, 'BILLING_RESOURCE_BLOCKED'],
  ['unpaid billing', { billing: 'unpaid' }, 'BILLING_RESOURCE_BLOCKED'],
  ['unknown billing', { billing: 'unknown' }, 'BILLING_RESOURCE_BLOCKED'],
  ['missing billing', { billing: null }, 'BILLING_RESOURCE_BLOCKED'],
  ['last slot taken', { total: 3 }, 'NUMBER_LIMIT_REACHED'],
  ['zero limit', { limit: 0 }, 'NUMBER_LIMIT_REACHED'],
  ['invalid limit', { limit: -1 }, 'NUMBER_LIMIT_INVALID'],
  ['duplicate phone', { duplicate: true }, 'NUMBER_ALREADY_EXISTS'],
]) test(`rejects ${name}`, async () => {
  const f = fixture(config); await assert.rejects(assertNumberCreation(f.client, 'w', options), error => error.code === code);
});
test('platform admin is read from the DB and need not be a workspace member', async () => {
  const f = fixture({ role: 'admin', member: false }); await assertNumberCreation(f.client, 'w', options);
  assert.equal(f.calls.some(call => call.sql.startsWith('SELECT role')), false);
});
test('missing actor is never an installation authorization bypass', async () => {
  const f = fixture(); await assert.rejects(assertNumberCreation(f.client, 'w', { requireManager: true }), error => error.code === 'WORKSPACE_NOT_FOUND');
  assert.equal(f.calls.length, 0);
});
