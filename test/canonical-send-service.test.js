const test = require("node:test");
const assert = require("node:assert/strict");
const { CanonicalSendService, SendError, normalizeIdempotencyKey, normalizeText } = require("../src/messaging/canonicalSendService");
const { OpenWaMessagingAdapter } = require("../src/messaging/openWaAdapter");

function fixture(overrides = {}) {
  const calls = [];
  const dispatch = { workspaceId: "workspace-a", conversationId: "conversation-a", numberId: "number-a", providerConnectionId: "connection-a", provider: "openwa", automationEnabled: true, contactPhone: "+923001112222" };
  const repository = {
    async resolveConversationDispatch() { return dispatch; },
    async reserveOutbound() { return { created: true, attempt: { id: "attempt-a", status: "reserved" } }; },
    async failOutbound(input) { calls.push(["fail", input]); },
    async recordOutbound(input) { calls.push(["record", input]); return { id: "message-a", status: "accepted" }; },
    ...overrides.repository
  };
  const adapters = { openwa: { async sendText(input) { calls.push(["send", input]); return { externalMessageId: "provider-a", rawStatus: "queued" }; } }, ...overrides.adapters };
  const events = { publish(...args) { calls.push(["event", ...args]); } };
  const audit = async (...args) => calls.push(["audit", ...args]);
  return { calls, service: new CanonicalSendService({ repository, adapters, events, audit }) };
}

test("canonical send resolves and records the exact conversation provider", async () => {
  const { service, calls } = fixture();
  const result = await service.sendText({ actorId: "agent-a", workspaceIds: ["workspace-a"], conversationId: "conversation-a", text: " Hello ", idempotencyKey: "mobile-1" });
  assert.equal(result.duplicate, false);
  assert.equal(result.message.id, "message-a");
  assert.equal(calls[0][0], "send");
  assert.equal(calls[0][1].connection.numberId, "number-a");
  assert.equal(calls[0][1].to, "+923001112222");
  assert.equal(calls[1][0], "record");
  assert.equal(calls[1][1].attemptId, "attempt-a");
  assert.equal(calls[1][1].externalMessageId, "provider-a");
  assert.equal(calls[2][0], "event");
  assert.equal(calls[3][0], "audit");
});

test("canonical send returns an existing idempotent result without dispatch", async () => {
  const { service, calls } = fixture({ repository: { async reserveOutbound() { return { created: false, attempt: { id: "attempt-existing", status: "accepted", message_id: "existing", external_message_id: "provider-existing", message_status: "accepted" } }; } } });
  const result = await service.sendText({ actorId: "agent-a", workspaceIds: ["workspace-a"], conversationId: "conversation-a", text: "Hello", idempotencyKey: "mobile-1" });
  assert.equal(result.duplicate, true);
  assert.equal(result.message.id, "existing");
  assert.deepEqual(calls, []);
});

test("canonical send fails closed when a provider adapter is unavailable", async () => {
  const { service } = fixture({ adapters: { openwa: undefined } });
  service.adapters.delete("openwa");
  await assert.rejects(service.sendText({ actorId: "agent-a", workspaceIds: ["workspace-a"], conversationId: "conversation-a", text: "Hello", idempotencyKey: "mobile-1" }), (error) => error instanceof SendError && error.code === "PROVIDER_UNAVAILABLE" && error.status === 409);
});

test("canonical send marks a reserved attempt failed when dispatch fails", async () => {
  const { service, calls } = fixture({ adapters: { openwa: { async sendText() { const error = new Error("network down"); error.code = "TEMPORARY_PROVIDER_FAILURE"; throw error; } } } });
  await assert.rejects(service.sendText({ actorId: "agent-a", workspaceIds: ["workspace-a"], conversationId: "conversation-a", text: "Hello", idempotencyKey: "mobile-failure" }), (error) => error.code === "TEMPORARY_PROVIDER_FAILURE" && error.status === 502);
  assert.equal(calls[0][0], "fail");
  assert.equal(calls[0][1].attemptId, "attempt-a");
});

test("canonical send validates message and idempotency input", () => {
  assert.equal(normalizeText(" hello "), "hello");
  assert.equal(normalizeIdempotencyKey(" key "), "key");
  assert.throws(() => normalizeText(""), /1 to 4096/);
  assert.throws(() => normalizeIdempotencyKey(""), /idempotency key/);
});

test("OpenWA adapter converts E.164 recipients without exposing credentials", async () => {
  const sent = [];
  const adapter = new OpenWaMessagingAdapter({ async sendText(to, text) { sent.push({ to, text }); return "openwa-message"; } });
  const result = await adapter.sendText({ connection: { provider: "openwa" }, to: "+92 300 111-2222", text: "Hello" });
  assert.deepEqual(sent, [{ to: "923001112222@c.us", text: "Hello" }]);
  assert.equal(result.externalMessageId, "openwa-message");
});
