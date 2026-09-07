const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanonicalSendHandler } = require("../src/messaging/http");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(overrides = {}) {
  return { user: { id: "agent-a" }, params: { id: "conversation-a" }, body: { text: "Hello" }, get(name) { return name === "idempotency-key" ? "mobile-1" : undefined; }, ...overrides };
}

test("canonical endpoint forwards authenticated conversation context", async () => {
  let input;
  const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText(value) { input = value; return { message: { id: "message-a" }, duplicate: false }; } } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 202);
  assert.equal(input.actorId, "agent-a");
  assert.deepEqual(input.workspaceIds, ["workspace-a"]);
  assert.equal(input.conversationId, "conversation-a");
  assert.equal(input.idempotencyKey, "mobile-1");
});

test("canonical endpoint returns 200 for an idempotent replay", async () => {
  const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() { return { message: { id: "existing" }, duplicate: true }; } } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, true);
});

test("canonical endpoint preserves safe service error status and code", async () => {
  const handler = createCanonicalSendHandler({ workspaceIds: () => ["workspace-a"], sendService: { async sendText() { const error = new Error("Conversation not found"); error.status = 404; error.code = "CONVERSATION_NOT_FOUND"; throw error; } } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
});
