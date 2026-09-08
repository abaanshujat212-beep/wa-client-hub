const test = require("node:test");
const assert = require("node:assert/strict");
const { MetaConnectionRepository, normalizeInstall } = require("../src/messaging/metaConnectionRepository");
const input = { workspaceId: "workspace-a", actorId: "owner-a", label: "Official WA", phone: "+923001112222", phoneNumberId: "123456789", businessAccountId: "987654321", accessToken: "meta-test-access-token-123" };
function fixture(failAt) {
  const calls = []; let released = false;
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT owner_id")) return { rowCount: 1, rows: [{ owner_id: "owner-a" }] };
    if (failAt && sql.includes(failAt)) throw Object.assign(new Error("fixture failure"), { code: failAt === "provider_connections" ? "23505" : "XX000" });
    return { rowCount: 1, rows: [] };
  }, release() { released = true; } };
  const vault = { encrypt(value, context) { assert.equal(value.accessToken, input.accessToken); assert.match(context, /^[0-9a-f-]{36}$/); return { ciphertext: Buffer.from("ciphertext"), keyId: "v1" }; } };
  return { repo: new MetaConnectionRepository({ async connect() { return client; } }, vault), calls, released: () => released };
}
test("install encrypts, stays disabled and audits in the same transaction", async () => {
  const f = fixture(); const result = await f.repo.install(input);
  assert.equal(result.connection.status, "connecting"); assert.equal(result.number.automationEnabled, false);
  assert.equal(JSON.stringify(result).includes(input.accessToken), false);
  assert.equal(f.calls[0].sql, "BEGIN"); assert.equal(f.calls.at(-1).sql, "COMMIT"); assert.equal(f.released(), true);
  const audit = f.calls.find(({ sql }) => sql.includes("INSERT INTO audit_logs"));
  assert.equal(audit.params[1], input.actorId);
  assert.deepEqual(audit.params[2], { workspaceId: input.workspaceId, connectionId: result.connection.id, numberId: result.number.id });
  assert.equal(JSON.stringify(f.calls).includes(input.accessToken), false);
});
test("duplicate installation rolls back", async () => {
  const f = fixture("provider_connections"); await assert.rejects(f.repo.install(input), error => error.code === "META_PHONE_ALREADY_CONNECTED");
  assert.equal(f.calls.at(-1).sql, "ROLLBACK"); assert.equal(f.released(), true);
});
test("audit failure rolls back installation instead of partial success", async () => {
  const f = fixture("audit_logs"); await assert.rejects(f.repo.install(input), error => error.code === "XX000");
  assert.equal(f.calls.at(-1).sql, "ROLLBACK"); assert.equal(f.calls.some(({ sql }) => sql === "COMMIT"), false);
});
test("existing internal install without actor remains compatible", async () => {
  const f = fixture(); const { actorId, ...legacy } = input; await f.repo.install(legacy);
  assert.equal(f.calls.some(({ sql }) => sql.includes("INSERT INTO audit_logs")), false);
});
test("invalid install details are rejected", () => {
  assert.throws(() => normalizeInstall({ label: "x", phone: "123", phoneNumberId: "bad", accessToken: "short" }), error => error.code === "META_INSTALL_INVALID");
});
