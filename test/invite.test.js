process.env.MOCK_BROWSER = "1";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-local-tests";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { app, store } = require(require("node:path").resolve("src/server"));

function cookieFrom(response) { const value = response.headers.get("set-cookie"); return value ? value.split(";")[0] : ""; }
async function request(base, path, options = {}) { const response = await fetch(base + path, options); const body = await response.json().catch(() => ({})); return { response, body }; }
async function login(base, email, password) { const session = await request(base, "/api/session"); const cookie = cookieFrom(session.response); const result = await request(base, "/api/login", { method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": session.body.csrfToken }, body: JSON.stringify({ email, password }) }); assert.equal(result.response.status, 200); return { cookie: cookieFrom(result.response) || cookie, csrf: result.body.csrfToken }; }
async function api(base, auth, path, options = {}) { return request(base, path, { ...options, headers: { "content-type": "application/json", cookie: auth.cookie, "x-csrf-token": auth.csrf, ...(options.headers || {}) } }); }

let server;
let originalData;
let admin;
let owner;
let workspace;

test.before(async () => {
  originalData = store.data;
  admin = { id: "admin-invite-test", name: "Administrator", email: "invite-admin@test.local", passwordHash: await bcrypt.hash("AdminPassword123!", 4), role: "admin", active: true, createdAt: new Date().toISOString() };
  owner = { id: "client-invite-owner", name: "Owner", email: "invite-owner@test.local", passwordHash: await bcrypt.hash("ClientPassword123!", 4), role: "client", active: true, createdAt: new Date().toISOString() };
  workspace = { id: "workspace-invite", ownerId: owner.id, name: "Invite workspace", planId: "team", status: "active", createdAt: new Date().toISOString() };
  store.data = {
    users: [admin, owner],
    plans: [
      { id: "starter", name: "Starter", workspaceLimit: 1, numberLimit: 1, userLimit: 1 },
      { id: "team", name: "Team", workspaceLimit: 1, numberLimit: 3, userLimit: 3 },
      { id: "business", name: "Business", workspaceLimit: 3, numberLimit: 10, userLimit: 10 },
      { id: "dedicated", name: "Dedicated", workspaceLimit: 999, numberLimit: 999, userLimit: 999, custom: true }
    ],
    workspaces: [workspace],
    workspaceMembers: [{ id: crypto.randomUUID(), workspaceId: workspace.id, userId: owner.id, role: "owner", createdAt: new Date().toISOString() }],
    accounts: [],
    invites: [],
    audit: []
  };
  store.persist = function(){};
  server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
});

test.after(async () => { store.data = originalData; await new Promise(resolve => server.close(resolve)); });

test("admin can create invite and token is not exposed in stored invite", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, admin.email, "AdminPassword123!");
  const created = await api(base, auth, "/api/workspaces/" + workspace.id + "/invites", { method: "POST", body: JSON.stringify({ name: "Agent User", email: "agent@test.local", role: "agent" }) });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.ok(created.body.token);
  assert.ok(created.body.acceptUrl.includes("/invite.html?token="));
  assert.equal(created.body.invite.tokenHash, undefined);
  assert.equal(store.data.invites.length, 1);
});

test("invite can be accepted once and creates workspace member", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, admin.email, "AdminPassword123!");
  const created = await api(base, auth, "/api/workspaces/" + workspace.id + "/invites", { method: "POST", body: JSON.stringify({ name: "Second Agent", email: "second-agent@test.local", role: "viewer" }) });
  const accepted = await request(base, "/api/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: created.body.token, name: "Second Agent", password: "AgentPassword123!" }) });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
  const user = store.findUserByEmail("second-agent@test.local");
  assert.ok(user);
  assert.ok(store.data.workspaceMembers.some((member) => member.workspaceId === workspace.id && member.userId === user.id && member.role === "viewer"));
  const acceptedAgain = await request(base, "/api/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: created.body.token, name: "Second Agent", password: "AgentPassword123!" }) });
  assert.equal(acceptedAgain.response.status, 400);
});
