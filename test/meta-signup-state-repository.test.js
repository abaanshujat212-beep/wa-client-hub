const test = require("node:test");
const assert = require("node:assert/strict");
const { MetaSignupStateRepository } = require("../src/messaging/metaSignupStateRepository");
test("state repository hashes credentials and uses a scoped atomic claim", async () => {
  const calls = [];
  const repo = new MetaSignupStateRepository({ async query(sql, params) {
    calls.push({ sql, params });
    return { rows: sql.includes("INSERT INTO") ? [{ expires_at: new Date(601000) }] : [{ workspace_id: "workspace-a", label: "Official" }] };
  } });
  const input = { state: "x".repeat(43), sessionId: "session-a", actorId: "owner-a", workspaceId: "workspace-a", label: "Official" };
  assert.equal((await repo.create(input)).expiresAt, new Date(601000).toISOString());
  assert.deepEqual(await repo.consume(input), { workspaceId: "workspace-a", label: "Official" });
  assert.equal(JSON.stringify(calls).includes(input.state), false);
  assert.equal(JSON.stringify(calls).includes(input.sessionId), false);
  assert.match(calls[0].params[0], /^[0-9a-f]{64}$/); assert.match(calls[0].params[1], /^[0-9a-f]{64}$/);
  assert.match(calls[1].sql, /DELETE FROM meta_signup_states/);
  assert.match(calls[1].sql, /state_hash=\$1 AND session_hash=\$2 AND actor_id=\$3/);
  assert.match(calls[1].sql, /expires_at > clock_timestamp\(\)/);
});
test("malformed claims and invalid TTL fail closed", async () => {
  let queries = 0; const repo = new MetaSignupStateRepository({ async query() { queries++; return { rows: [] }; } });
  assert.equal(await repo.consume({ state: "short", sessionId: "s", actorId: "u" }), null); assert.equal(queries, 0);
  await assert.rejects(repo.create({ state: "x".repeat(43), sessionId: "s", actorId: "u", workspaceId: "w", label: "WA", ttlMs: 600001 }), /Invalid/);
  assert.equal(queries, 0);
  assert.equal(await repo.consume({ state: "x".repeat(43), sessionId: "s", actorId: "u" }), null);
});
