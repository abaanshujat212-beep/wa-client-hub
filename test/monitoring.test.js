const test = require("node:test");
const assert = require("node:assert/strict");
const { systemHealth } = require("../src/monitoring");

test("systemHealth returns counts and runtime details", () => {
  const store = {
    data: {
      users: [{ id: "u1" }, { id: "u2" }],
      workspaces: [{ id: "w1" }],
      accounts: [{ id: "a1" }, { id: "a2" }],
      invites: [{ id: "i1" }],
      audit: [{ id: "log1" }, { id: "log2" }]
    }
  };
  const launcher = { status: (account) => ({ running: account.id === "a2" }) };
  const health = systemHealth(store, launcher);
  assert.equal(health.ok, true);
  assert.equal(health.counts.users, 2);
  assert.equal(health.counts.workspaces, 1);
  assert.equal(health.counts.whatsappNumbers, 2);
  assert.equal(health.counts.runningWhatsappNumbers, 1);
  assert.equal(health.counts.invites, 1);
  assert.equal(health.counts.auditEvents, 2);
  assert.equal(typeof health.uptimeSeconds, "number");
  assert.ok(health.memory.rss > 0);
});
