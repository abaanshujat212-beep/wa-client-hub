const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaSignupStateRepository } = require('../src/messaging/metaSignupStateRepository');

test('state repository hashes credentials and separates claim, release, and finalization', async () => {
  const calls = [];
  const repo = new MetaSignupStateRepository({ async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO')) return { rowCount: 1, rows: [{ expires_at: new Date(601000) }] };
    if (sql.includes("SET status='processing'")) return { rowCount: 1, rows: [{ workspace_id: 'workspace-a', label: 'Official', completion_attempts: 1 }] };
    if (sql.includes("SET status='pending'")) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [{ state_hash: 'a'.repeat(64) }] };
  } });
  const input = { state: 'x'.repeat(43), sessionId: 'session-a', actorId: 'owner-a', workspaceId: 'workspace-a', label: 'Official' };
  assert.equal((await repo.create(input)).expiresAt, new Date(601000).toISOString());
  assert.deepEqual(await repo.claim(input), { workspaceId: 'workspace-a', label: 'Official', completionAttempts: 1 });
  assert.equal(await repo.release(input), true);
  assert.equal(await repo.complete(input), true);
  assert.equal(JSON.stringify(calls).includes(input.state), false);
  assert.equal(JSON.stringify(calls).includes(input.sessionId), false);
  assert.match(calls[0].params[0], /^[0-9a-f]{64}$/); assert.match(calls[0].params[1], /^[0-9a-f]{64}$/);
  assert.match(calls[1].sql, /UPDATE meta_signup_states SET status='processing'/);
  assert.match(calls[1].sql, /status='pending'/);
  assert.match(calls[3].sql, /DELETE FROM meta_signup_states/);
  assert.match(calls[3].sql, /status='processing'/);
});

test('malformed claims and invalid TTL fail closed', async () => {
  let queries = 0; const repo = new MetaSignupStateRepository({ async query() { queries++; return { rows: [] }; } });
  assert.equal(await repo.claim({ state: 'short', sessionId: 's', actorId: 'u' }), null); assert.equal(queries, 0);
  await assert.rejects(repo.create({ state: 'x'.repeat(43), sessionId: 's', actorId: 'u', workspaceId: 'w', label: 'WA', ttlMs: 600001 }), /Invalid/);
  assert.equal(queries, 0);
});
