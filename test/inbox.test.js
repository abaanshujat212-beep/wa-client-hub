const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeCursor, decodeCursor } = require("../src/inbox/repository");
const { InboxEvents } = require("../src/inbox/events");

test("inbox cursors round trip and reject invalid input", () => {
  assert.equal(decodeCursor(encodeCursor(42)), 42);
  assert.equal(decodeCursor(""), 0);
  assert.throws(() => decodeCursor(Buffer.from("-1").toString("base64url")), /Invalid pagination cursor/);
  assert.throws(() => decodeCursor(Buffer.from("oops").toString("base64url")), /Invalid pagination cursor/);
});

test("inbox events are isolated by workspace and unsubscribe", () => {
  const events = new InboxEvents(); const received = [];
  const unsubscribe = events.subscribe(["workspace-a"], (event) => received.push(event));
  events.publish("workspace-b", "message.changed"); events.publish("workspace-a", "message.changed", { id: "m1" });
  unsubscribe(); events.publish("workspace-a", "message.changed", { id: "m2" });
  assert.equal(received.length, 1); assert.equal(received[0].workspaceId, "workspace-a"); assert.deepEqual(received[0].data, { id: "m1" });
});
