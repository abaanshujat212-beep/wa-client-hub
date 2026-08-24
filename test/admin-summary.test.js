const test = require("node:test");
const assert = require("node:assert/strict");
const { adminSummary } = require("../src/adminSummary");

test("adminSummary returns per-client operations totals", () => {
  const store = { data: {
    users: [
      { id: "admin", role: "admin", name: "Admin", email: "a@test", active: true },
      { id: "c1", role: "client", name: "Client 1", email: "c1@test", active: true },
      { id: "c2", role: "client", name: "Client 2", email: "c2@test", active: false }
    ],
    workspaces: [
      { id: "w1", ownerId: "c1", planId: "team" },
      { id: "w2", ownerId: "c1", planId: "business" }
    ],
    accounts: [
      { id: "a1", workspaceId: "w1", lastLaunchedAt: "2026-01-01T00:00:00Z" },
      { id: "a2", workspaceId: "w2", lastLaunchedAt: "2026-01-02T00:00:00Z" }
    ]
  }};
  const launcher = { status: (account) => ({ running: account.id === "a2" }) };
  const result = adminSummary(store, launcher);
  assert.equal(result.clients.length, 2);
  assert.equal(result.clients[0].workspaces, 2);
  assert.equal(result.clients[0].whatsappNumbers, 2);
  assert.equal(result.clients[0].runningWhatsappNumbers, 1);
  assert.equal(result.clients[0].lastLaunchAt, "2026-01-02T00:00:00Z");
});
