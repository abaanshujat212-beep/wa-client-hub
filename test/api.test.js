process.env.MOCK_BROWSER = "1";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-local-tests";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const serverModule = require(path.join("..", "src", "server"));
const app = serverModule.app;
const store = serverModule.store;

function listen() {
  return new Promise(function(resolve) {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", function(){ resolve(server); });
  });
}

function close(server) {
  return new Promise(function(resolve){ server.close(resolve); });
}

function cookieFrom(response) {
  return response.headers.getSetCookie ? response.headers.getSetCookie().join("; ") : response.headers.get("set-cookie");
}

async function request(base, pathName, options) {
  const response = await fetch(base + pathName, options || {});
  const body = await response.json().catch(function(){ return { parseFailed: true, status: response.status }; });
  return { response, body, cookie: cookieFrom(response) };
}

async function fixture() {
  store.persist = function(){};
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const disabledId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  store.data = {
    users: [
      { id: adminId, name: "Administrator", email: "admin@test.com", passwordHash: await bcrypt.hash("AdminPassword123!", 4), role: "admin", active: true, createdAt: new Date().toISOString() },
      { id: clientId, name: "Client", email: "client@test.com", passwordHash: await bcrypt.hash("ClientPassword123!", 4), role: "client", active: true, createdAt: new Date().toISOString() },
      { id: disabledId, name: "Disabled", email: "disabled@test.com", passwordHash: await bcrypt.hash("DisabledPassword123!", 4), role: "client", active: false, createdAt: new Date().toISOString() }
    ],
    plans: [
      { id: "starter", name: "Starter", workspaceLimit: 1, numberLimit: 1, userLimit: 1 },
      { id: "team", name: "Team", workspaceLimit: 1, numberLimit: 3, userLimit: 3 },
      { id: "business", name: "Business", workspaceLimit: 3, numberLimit: 10, userLimit: 10 },
      { id: "dedicated", name: "Dedicated", workspaceLimit: 999, numberLimit: 999, userLimit: 999, custom: true }
    ],
    workspaces: [
      { id: workspaceId, ownerId: clientId, name: "Client workspace", planId: "team", status: "active", createdAt: new Date().toISOString() }
    ],
    workspaceMembers: [
      { id: crypto.randomUUID(), workspaceId, userId: clientId, role: "owner", createdAt: new Date().toISOString() }
    ],
    accounts: [],
    audit: []
  };
  return { adminId, clientId, disabledId, workspaceId };
}

async function login(base, session, email, password) {
  return request(base, "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.cookie || "", "x-csrf-token": session.body.csrfToken },
    body: JSON.stringify({ email, password })
  });
}

test("api rejects mutating requests without csrf", async () => {
  await fixture();
  const server = await listen();
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const session = await request(base, "/api/session");
    const res = await request(base, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: session.cookie || "" },
      body: JSON.stringify({ email: "admin@test.com", password: "AdminPassword123!" })
    });
    assert.equal(res.response.status, 403);
  } finally { await close(server); }
});

test("api blocks disabled client login", async () => {
  await fixture();
  const server = await listen();
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const session = await request(base, "/api/session");
    const res = await login(base, session, "disabled@test.com", "DisabledPassword123!");
    assert.equal(res.response.status, 401);
  } finally { await close(server); }
});

test("api can create and delete an account as admin", async () => {
  const ids = await fixture();
  const server = await listen();
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const session = await request(base, "/api/session");
    const loginRes = await login(base, session, "admin@test.com", "AdminPassword123!");
    assert.equal(loginRes.response.status, 200);
    const authCookie = loginRes.cookie || session.cookie || "";
    const created = await request(base, "/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie, "x-csrf-token": loginRes.body.csrfToken },
      body: JSON.stringify({ ownerId: ids.clientId, workspaceId: ids.workspaceId, label: "Sales", phone: "+923001111111" })
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.account.workspaceId, ids.workspaceId);
    const removed = await request(base, "/api/accounts/" + created.body.account.id, {
      method: "DELETE",
      headers: { cookie: authCookie, "x-csrf-token": loginRes.body.csrfToken }
    });
    assert.equal(removed.response.status, 200);
    assert.equal(store.data.accounts.length, 0);
  } finally { await close(server); }
});

test("api enforces workspace number plan limits", async () => {
  const ids = await fixture();
  store.updateWorkspace(ids.workspaceId, { planId: "starter" });
  const server = await listen();
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const session = await request(base, "/api/session");
    const loginRes = await login(base, session, "admin@test.com", "AdminPassword123!");
    const authCookie = loginRes.cookie || session.cookie || "";
    const first = await request(base, "/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie, "x-csrf-token": loginRes.body.csrfToken },
      body: JSON.stringify({ ownerId: ids.clientId, workspaceId: ids.workspaceId, label: "Primary", phone: "+923001111111" })
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    const second = await request(base, "/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie, "x-csrf-token": loginRes.body.csrfToken },
      body: JSON.stringify({ ownerId: ids.clientId, workspaceId: ids.workspaceId, label: "Second", phone: "+923002222222" })
    });
    assert.equal(second.response.status, 400);
    assert.match(second.body.error, /Plan limit reached/);
  } finally { await close(server); }
});
