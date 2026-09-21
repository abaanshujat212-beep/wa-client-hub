const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanonicalSendHandler } = require("../src/messaging/http");
function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function request(overrides = {}) { return { user: { id: "agent-a" }, params: { id: "conversation-a" }, body: { text: "Hello" }, get(name) { return name === "idempotency-key" ? "mobile-1" : undefined; }, ...overrides }; }

test("invalid Meta credentials return an actionable conflict without leaking provider details", async () => {
  let calls = 0;
  const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() {
    calls++;
    throw Object.assign(new Error("private provider response"), { code: "META_ERROR_190", status: 502 });
  } } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "META_ERROR_190");
  assert.match(res.body.error, /reconnect/);
  assert.ok(!res.body.error.includes("private provider response"));
  assert.equal(calls, 1);
});
test("canonical endpoint forwards authenticated conversation context", async () => { let input; const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText(value) { input = value; return { message: { id: "message-a" }, duplicate: false }; } } }); const res = response(); await handler(request(), res); assert.equal(res.statusCode, 202); assert.equal(input.actorId, "agent-a"); assert.deepEqual(input.workspaceIds, ["workspace-a"]); });
test("canonical endpoint returns 200 for an idempotent replay", async () => { const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() { return { message: { id: "existing", status: "accepted" }, duplicate: true }; } } }); const res = response(); await handler(request(), res); assert.equal(res.statusCode, 200); });
test("canonical endpoint returns 202 while an idempotent attempt is unresolved", async () => { const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() { return { message: { id: null, attemptId: "attempt-a", status: "provider_accepted" }, duplicate: true }; } } }); const res = response(); await handler(request(), res); assert.equal(res.statusCode, 202); });
test("canonical endpoint preserves safe service error status and code", async () => { const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() { const error = new Error("Conversation not found"); error.status = 404; error.code = "CONVERSATION_NOT_FOUND"; throw error; } } }); const res = response(); await handler(request(), res); assert.equal(res.statusCode, 404); assert.deepEqual(res.body, { error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" }); });
