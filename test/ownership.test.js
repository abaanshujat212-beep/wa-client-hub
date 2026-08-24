process.env.MOCK_BROWSER = "1";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-local-tests";
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { app, store } = require(require("node:path").resolve("src/server"));
let server, originalData, admin, one, two, first, second, workspaceOne, workspaceTwo;
function cookieFrom(response) { const value = response.headers.get("set-cookie"); return value ? value.split(";")[0] : ""; }
async function request(base, path, options = {}) { const response = await fetch(base + path, options); const body = await response.json().catch(() => ({})); return { response, body }; }
async function login(base, email, password) { const session = await request(base, "/api/session"); const cookie = cookieFrom(session.response); const result = await request(base, "/api/login", { method: "POST", headers: { "content-type": "application/json", cookie, "x-csrf-token": session.body.csrfToken }, body: JSON.stringify({ email, password }) }); assert.equal(result.response.status, 200); return { cookie: cookieFrom(result.response) || cookie, csrf: result.body.csrfToken }; }
async function api(base, auth, path, options = {}) { return request(base, path, { ...options, headers: { "content-type": "application/json", cookie: auth.cookie, "x-csrf-token": auth.csrf, ...(options.headers || {}) } }); }

test.before(async () => {
  originalData = store.data;
  admin = { id: "admin-owner-test", name: "Administrator", email: "owner-admin@test.local", passwordHash: await bcrypt.hash("AdminPassword123!", 4), role: "admin", active: true, createdAt: new Date().toISOString() };
  one = { id: "client-owner-one", name: "Client One", email: "owner-one@test.local", passwordHash: await bcrypt.hash("ClientPassword123!", 4), role: "client", active: true, createdAt: new Date().toISOString() };
  two = { id: "client-owner-two", name: "Client Two", email: "owner-two@test.local", passwordHash: await bcrypt.hash("ClientPassword123!", 4), role: "client", active: true, createdAt: new Date().toISOString() };
  workspaceOne = { id: "workspace-owner-one", ownerId: one.id, name: "One workspace", planId: "team", status: "active", createdAt: new Date().toISOString() };
  workspaceTwo = { id: "workspace-owner-two", ownerId: two.id, name: "Two workspace", planId: "team", status: "active", createdAt: new Date().toISOString() };
  first = { id: "account-owner-one", ownerId: one.id, workspaceId: workspaceOne.id, label: "One number", phone: "+923001111111", createdAt: new Date().toISOString(), lastLaunchedAt: null };
  second = { id: "account-owner-two", ownerId: two.id, workspaceId: workspaceTwo.id, label: "Two number", phone: "+923002222222", createdAt: new Date().toISOString(), lastLaunchedAt: null };
  store.data = {
    users: [admin, one, two],
    plans: [
      { id: "starter", name: "Starter", workspaceLimit: 1, numberLimit: 1, userLimit: 1 },
      { id: "team", name: "Team", workspaceLimit: 1, numberLimit: 3, userLimit: 3 },
      { id: "business", name: "Business", workspaceLimit: 3, numberLimit: 10, userLimit: 10 },
      { id: "dedicated", name: "Dedicated", workspaceLimit: 999, numberLimit: 999, userLimit: 999, custom: true }
    ],
    workspaces: [workspaceOne, workspaceTwo],
    workspaceMembers: [
      { id: crypto.randomUUID(), workspaceId: workspaceOne.id, userId: one.id, role: "owner", createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), workspaceId: workspaceTwo.id, userId: two.id, role: "owner", createdAt: new Date().toISOString() }
    ],
    accounts: [first, second],
    audit: []
  };
  server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
});

test.after(async () => { store.data = originalData; await new Promise(resolve => server.close(resolve)); });

test("client can only list its own workspaces and numbers", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, one.email, "ClientPassword123!");
  const workspaces = await api(base, auth, "/api/workspaces");
  assert.equal(workspaces.response.status, 200);
  assert.deepEqual(workspaces.body.workspaces.map(workspace => workspace.id), [workspaceOne.id]);
  const result = await api(base, auth, "/api/accounts");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.accounts.map(account => account.id), [first.id]);
});

test("client cannot launch or delete another client workspace number", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, one.email, "ClientPassword123!");
  const launch = await api(base, auth, "/api/accounts/" + second.id + "/launch", { method: "POST" });
  const remove = await api(base, auth, "/api/accounts/" + second.id, { method: "DELETE" });
  assert.equal(launch.response.status, 404);
  assert.equal(remove.response.status, 404);
  assert.ok(store.findAccount(second.id));
});

test("admin can see and remove any client workspace number", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, admin.email, "AdminPassword123!");
  const list = await api(base, auth, "/api/accounts");
  assert.equal(list.response.status, 200);
  assert.deepEqual(list.body.accounts.map(account => account.id).sort(), [first.id, second.id].sort());
  const remove = await api(base, auth, "/api/accounts/" + second.id, { method: "DELETE" });
  assert.equal(remove.response.status, 200);
  assert.equal(store.findAccount(second.id), undefined);
});

test("workspace owner can add a member within plan limit", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const auth = await login(base, one.email, "ClientPassword123!");
  const added = await api(base, auth, "/api/workspaces/" + workspaceOne.id + "/members", { method: "POST", body: JSON.stringify({ userId: two.id, role: "agent" }) });
  assert.equal(added.response.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.member.role, "agent");
});
