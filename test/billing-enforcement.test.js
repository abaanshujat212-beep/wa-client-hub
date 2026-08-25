const test = require("node:test");
const assert = require("node:assert/strict");
const Store = require("../src/store");

test("workspace billing status blocks adding users and numbers", () => {
  const store = new Store(process.cwd());
  store.persist = function(){};
  store.data = {
    users: [
      { id: "owner", role: "client", active: true, name: "Owner", email: "owner@test", passwordHash: "x" },
      { id: "agent", role: "client", active: true, name: "Agent", email: "agent@test", passwordHash: "x" }
    ],
    plans: [{ id: "team", name: "Team", workspaceLimit: 1, numberLimit: 3, userLimit: 3 }],
    workspaces: [{ id: "w1", ownerId: "owner", name: "Workspace", planId: "team", billingProvider: "swich", billingStatus: "past_due" }],
    workspaceMembers: [{ id: "m1", workspaceId: "w1", userId: "owner", role: "owner" }],
    accounts: [],
    invites: [],
    audit: []
  };
  assert.throws(() => store.createAccount({ workspaceId: "w1", label: "WA", phone: "+923001111111" }), /Billing status/);
  assert.throws(() => store.addWorkspaceMember({ workspaceId: "w1", userId: "agent" }), /Billing status/);
  store.updateWorkspace("w1", { billingStatus: "active" });
  assert.doesNotThrow(() => store.createAccount({ workspaceId: "w1", label: "WA", phone: "+923001111111" }));
});
