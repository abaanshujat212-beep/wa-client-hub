const test = require("node:test");
const assert = require("node:assert/strict");
const { OpenWaClient } = require("../src/openwa/client");
const { safeSecretEqual } = require("../src/openwa/routes");
const { normalizePhone, messageType, messageStatus } = require("../src/openwa/repository");

test("OpenWA client keeps credentials in internal request headers", async () => {
  let captured;
  const client = new OpenWaClient({ baseUrl: "http://openwa:8080", apiKey: "private-key", fetch: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ success: true, data: "message-1" }) }; } });
  assert.equal(await client.sendText("923001234567@c.us", "Hello"), "message-1");
  assert.equal(captured.url, "http://openwa:8080/api/sendText");
  assert.equal(captured.options.headers["x-api-key"], "private-key");
  assert.deepEqual(JSON.parse(captured.options.body).args, { to: "923001234567@c.us", content: "Hello" });
});

test("OpenWA normalization and constant-time secret validation", () => {
  assert.equal(normalizePhone("923001234567@c.us"), "+923001234567");
  assert.equal(messageType("chat"), "text");
  assert.equal(messageType("ptt"), "other");
  assert.equal(messageStatus(3), "read");
  assert.equal(messageStatus({ ack: 2 }), "delivered");
  assert.equal(safeSecretEqual("secret", "secret"), true);
  assert.equal(safeSecretEqual("wrong", "secret"), false);
});
