const test = require("node:test");
const assert = require("node:assert/strict");
const { MessagingRepository } = require("../src/messaging/repository");

test("dispatch resolution is scoped to authorized workspaces and maps provider provenance", async () => {
  const calls = [];
  const repository = new MessagingRepository({ async query(sql, params) { calls.push({ sql, params }); return { rows: [{ conversation_id: "conversation-a", workspace_id: "workspace-a", whatsapp_number_id: "number-a", phone_e164: "+923001112222", automation_enabled: true, external_session_id: "session-a", provider_connection_id: "connection-a", provider: "openwa", provider_status: "active" }] }; } });
  const dispatch = await repository.resolveConversationDispatch({ workspaceIds: ["workspace-a"], conversationId: "conversation-a" });
  assert.equal(dispatch.workspaceId, "workspace-a");
  assert.equal(dispatch.numberId, "number-a");
  assert.equal(dispatch.provider, "openwa");
  assert.deepEqual(calls[0].params, ["conversation-a", ["workspace-a"]]);
  assert.match(calls[0].sql, /c\.workspace_id=ANY/);
});

test("idempotency reservation returns an existing attempt after a conflict", async () => {
  let count = 0;
  const repository = new MessagingRepository({ async query() { count += 1; if (count === 1) return { rowCount: 0, rows: [] }; return { rowCount: 1, rows: [{ id: "attempt-a", status: "accepted", message_id: "message-a", message_status: "accepted" }] }; } });
  const result = await repository.reserveOutbound({ dispatch: { workspaceId: "workspace-a", conversationId: "conversation-a", numberId: "number-a", providerConnectionId: "connection-a" }, idempotencyKey: "mobile-1" });
  assert.equal(result.created, false);
  assert.equal(result.attempt.message_id, "message-a");
});
