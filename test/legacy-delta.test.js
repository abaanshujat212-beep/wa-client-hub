const test = require('node:test');
const assert = require('node:assert/strict');
const { applyLegacyDelta } = require('../src/db/legacyDelta');
const empty = () => ({ users: [], plans: [], workspaces: [], workspaceMembers: [], accounts: [], invites: [], audit: [] });
function fixture(rowCount = 1) {
  const calls = []; let released = false;
  const client = { async query(sql, values) { calls.push({ sql, values }); return { rowCount }; }, release() { released = true; } };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
}
const number = { id: 'number-a', workspaceId: 'workspace-a', ownerId: 'owner-a', label: 'WA', phone: '+923001112222', createdAt: '2026-09-01T00:00:00.000Z', lastLaunchedAt: null };

test('unchanged snapshots never write or delete existing rows', async () => {
  const f = fixture(); const before = { ...empty(), accounts: [number] };
  await applyLegacyDelta(f.pool, before, structuredClone(before));
  assert.deepEqual(f.calls.map(x => x.sql), ['BEGIN', 'SELECT pg_advisory_xact_lock($1)', 'COMMIT']);
  assert.equal(f.released(), true);
});

test('audit append and display trimming never delete durable history or unknown numbers', async () => {
  const f = fixture(); const oldAudit = { id: 'old', action: 'old', createdAt: '2026-09-01T00:00:00.000Z' };
  const before = { ...empty(), accounts: [number], audit: [oldAudit] };
  const after = { ...structuredClone(before), audit: [{ id: 'new', action: 'new', details: {}, createdAt: oldAudit.createdAt }] };
  await applyLegacyDelta(f.pool, before, after);
  const writes = f.calls.filter(x => /^(INSERT|UPDATE|DELETE)/.test(x.sql));
  assert.equal(writes.length, 1); assert.match(writes[0].sql, /^INSERT INTO audit_logs/);
  assert.doesNotMatch(JSON.stringify(f.calls), /WHERE NOT|TRUNCATE|whatsapp_numbers/);
});

test('number updates touch only changed legacy columns and guard old scope/value', async () => {
  const f = fixture(); const before = { ...empty(), accounts: [number] };
  const after = structuredClone(before); after.accounts[0].lastLaunchedAt = '2026-09-08T00:00:00.000Z';
  await applyLegacyDelta(f.pool, before, after);
  const update = f.calls.find(x => x.sql.startsWith('UPDATE'));
  assert.match(update.sql, /^UPDATE whatsapp_numbers SET last_launched_at=\$1 WHERE/);
  assert.match(update.sql, /workspace_id IS NOT DISTINCT FROM/);
  assert.match(update.sql, /owner_id IS NOT DISTINCT FROM/);
  assert.doesNotMatch(update.sql, /provider_connection_id|automation_enabled|external_session_id/);
  assert.ok(update.values.includes(number.workspaceId)); assert.ok(update.values.includes(number.id));
});

test('explicit deletion targets only a removed known ID and workspace', async () => {
  const f = fixture(); const before = { ...empty(), accounts: [number, { ...number, id: 'keep' }] };
  const after = { ...structuredClone(before), accounts: [before.accounts[1]] };
  await applyLegacyDelta(f.pool, before, after);
  const deletion = f.calls.find(x => x.sql.startsWith('DELETE'));
  assert.deepEqual(deletion.values, ['number-a', 'workspace-a', 'owner-a']);
  assert.doesNotMatch(deletion.sql, /WHERE NOT|ANY|TRUNCATE/);
});

test('same-field conflict rolls back instead of overwriting or resurrecting a row', async () => {
  const f = fixture(0); const before = { ...empty(), accounts: [number] };
  const after = structuredClone(before); after.accounts[0].label = 'Changed';
  await assert.rejects(applyLegacyDelta(f.pool, before, after), error => error.code === 'LEGACY_WRITE_CONFLICT');
  assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.equal(f.released(), true);
  assert.equal(f.calls.some(x => x.sql.startsWith('INSERT')), false);
});

test('inserts keep parent ordering and do not upsert stale existing rows', async () => {
  const f = fixture(); const after = { ...empty(), plans: [{ id: 'plan', name: 'Plan', workspaceLimit: 1, numberLimit: 2, userLimit: 3 }], users: [{ id: 'owner', name: 'Owner' }], workspaces: [{ id: 'workspace', ownerId: 'owner' }], accounts: [number] };
  await applyLegacyDelta(f.pool, empty(), after);
  assert.deepEqual(f.calls.filter(x => x.sql.startsWith('INSERT')).map(x => x.sql.split(' ')[2]), ['plans', 'users', 'workspaces', 'whatsapp_numbers']);
  assert.doesNotMatch(JSON.stringify(f.calls), /ON CONFLICT/);
});

test('invalid duplicate snapshot IDs are rejected before any database mutation', async () => {
  const f = fixture();
  await assert.rejects(applyLegacyDelta(f.pool, empty(), { ...empty(), accounts: [number, number] }), /unique IDs/);
  assert.equal(f.calls.length, 0);
});
