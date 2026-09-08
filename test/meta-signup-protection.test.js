const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaSignupProtection } = require('../src/messaging/metaSignupProtection');
const { validCsrf, validBody, validateOrigin } = require('../src/messaging/metaSignupRoutes');
test('CSRF requires the current 48-hex session token, not missing or body tokens', () => {
  const token = 'a'.repeat(48);
  assert.equal(validCsrf(token, token), true);
  for (const value of [undefined, '', [], token+'x', 'b'.repeat(48)]) assert.equal(validCsrf(token, value), false);
  assert.equal(validCsrf(undefined, undefined), false);
});
test('origin is an exact HTTPS origin without credentials, path or wildcard', () => {
  assert.equal(validateOrigin('https://hub.example.test'), true);
  for (const origin of ['http://hub.example.test','https://hub.example.test/','https://user@hub.example.test','*',undefined]) assert.equal(validateOrigin(origin), false);
});
test('strict body allowlist rejects actor/tenant overrides and oversized provider codes', () => {
  const start = { workspaceId: 'w', label: 'Official' };
  const complete = { state: 'a'.repeat(43), code: 'code', businessAccountId: '123', phoneNumberId: '456' };
  assert.equal(validBody('start', start), true); assert.equal(validBody('complete', complete), true);
  for (const body of [null, [], { ...start, actorId: 'admin' }, { ...start, label: 'x'.repeat(201) }]) assert.equal(validBody('start', body), false);
  for (const body of [{ ...complete, workspaceId: 'other' }, { ...complete, code: 'x'.repeat(4097) }, { ...complete, phoneNumberId: 456 }]) assert.equal(validBody('complete', body), false);
});
test('limiter persists only hashed actor/action keys and returns bounded retry metadata', async () => {
  const calls = [];
  const p = new MetaSignupProtection({ async query(sql, params) { calls.push({ sql, params }); return { rows: [{ hits: 6, retry_after: 599 }] }; } });
  assert.deepEqual(await p.consume('actor-sensitive', 'start'), { allowed: false, retryAfter: 599 });
  assert.match(calls[0].params[0], /^[a-f0-9]{64}$/); assert.doesNotMatch(JSON.stringify(calls), /actor-sensitive/);
  await p.consume('actor-sensitive', 'complete'); assert.notEqual(calls[0].params[0], calls[1].params[0]);
  assert.match(calls[0].sql, /ON CONFLICT/); assert.match(calls[0].sql, /clock_timestamp/);
});
test('database failures have no permissive memory fallback', async () => {
  const p = new MetaSignupProtection({ async query() { throw new Error('offline'); } });
  await assert.rejects(p.consume('u', 'start'), /offline/);
});
test('cleanup is bounded, skips locked rows, targets only expired states and counters', async () => {
  const calls = [];
  const p = new MetaSignupProtection({ async query(sql, values) { calls.push({ sql, values }); return { rowCount: 2 }; } });
  assert.deepEqual(await p.cleanup(10), { states: 2, buckets: 2 });
  for (const call of calls) { assert.match(call.sql, /LIMIT \$1 FOR UPDATE SKIP LOCKED/); assert.match(call.sql, /expires_at<=clock_timestamp/); assert.deepEqual(call.values,[10]); }
  assert.doesNotMatch(JSON.stringify(calls), /whatsapp_numbers|provider_connections|audit_logs/);
  await assert.rejects(p.cleanup(1001), /Invalid/);
});
test('invalid limits and subjects fail before database work', async () => {
  const pool = { async query() { throw new Error('must not run'); } };
  assert.throws(() => new MetaSignupProtection(pool,{ limits: { start: 0, complete: 10 } }), /Invalid/);
  assert.throws(() => new MetaSignupProtection(pool,{ windowMs: 0 }), /Invalid/);
  const p = new MetaSignupProtection(pool);
  await assert.rejects(p.consume('', 'start'), /Invalid/); await assert.rejects(p.consume('u', 'other'), /Invalid/);
});
