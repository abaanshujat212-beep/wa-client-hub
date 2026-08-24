process.env.MOCK_BROWSER = "1";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-local-tests";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const Store = require(path.join("..", "src", "store"));
const BrowserLauncher = require(path.join("..", "src", "launcher"));

function tempRoot(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

test("store keeps client accounts separated", async () => {
  const root = tempRoot("wa-hub-");
  const store = new Store(root);
  await store.init({ adminEmail: "admin@test.com", adminPassword: "LongPassword123!" });
  const one = await store.createClient({ name: "Client One", email: "one@test.com", password: "LongPassword123!" });
  const two = await store.createClient({ name: "Client Two", email: "two@test.com", password: "LongPassword123!" });
  store.createAccount({ ownerId: one.id, label: "Sales", phone: "+923001111111" });
  store.createAccount({ ownerId: two.id, label: "Support", phone: "+923002222222" });
  assert.equal(store.listAccounts(store.findUser(one.id)).length, 1);
  assert.equal(store.listAccounts(store.findUser(two.id))[0].label, "Support");
  assert.equal(store.listAccounts(store.data.users.find((user) => user.role === "admin")).length, 2);
});

test("launcher creates an isolated mocked instance", () => {
  const root = tempRoot("wa-launch-");
  const launcher = new BrowserLauncher(root);
  const account = { id: "account-a", ownerId: "owner-a" };
  assert.equal(launcher.status(account).running, false);
  launcher.launch(account);
  assert.equal(launcher.status(account).running, true);
});

test("password change requires the current password", async () => {
  const root = tempRoot("wa-pass-");
  const store = new Store(root);
  await store.init({ adminEmail: "admin@test.com", adminPassword: "AdminPassword123!" });
  const client = await store.createClient({ name: "Client", email: "client@test.com", password: "OldPassword123!" });
  assert.equal(await store.changePassword(client.id, "wrong", "NewPassword123!"), false);
  assert.equal(await store.changePassword(client.id, "OldPassword123!", "NewPassword123!"), true);
  assert.equal(await store.changePassword(client.id, "OldPassword123!", "AnotherPassword123!"), false);
});

test("admin reset does not reset administrator password", async () => {
  const root = tempRoot("wa-reset-");
  const store = new Store(root);
  await store.init({ adminEmail: "admin@test.com", adminPassword: "AdminPassword123!" });
  const admin = store.findUserByEmail("admin@test.com");
  const client = await store.createClient({ name: "Client", email: "client@test.com", password: "OldPassword123!" });
  assert.equal(await store.resetPassword(admin.id, "BadIdea123!"), null);
  const updated = await store.resetPassword(client.id, "NewPassword123!");
  assert.equal(updated.id, client.id);
});

test("removing an account leaves other accounts intact", async () => {
  const root = tempRoot("wa-remove-");
  const store = new Store(root);
  await store.init({ adminEmail: "admin@test.com", adminPassword: "AdminPassword123!" });
  const one = await store.createClient({ name: "One", email: "one@test.com", password: "Password123!" });
  const two = await store.createClient({ name: "Two", email: "two@test.com", password: "Password123!" });
  const first = store.createAccount({ ownerId: one.id, label: "One WA", phone: "+923001111111" });
  const second = store.createAccount({ ownerId: two.id, label: "Two WA", phone: "+923002222222" });
  assert.equal(store.deleteAccount(first.id).id, first.id);
  assert.equal(store.findAccount(first.id), undefined);
  assert.equal(store.findAccount(second.id).id, second.id);
});

test("audit list is newest first and capped by limit", async () => {
  const root = tempRoot("wa-audit-");
  const store = new Store(root);
  await store.init({ adminEmail: "admin@test.com", adminPassword: "AdminPassword123!" });
  const admin = store.findUserByEmail("admin@test.com");
  store.addAudit(admin.id, "first");
  store.addAudit(admin.id, "second", { ok: true });
  const rows = store.listAudit(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "second");
  assert.equal(rows[0].userName, "Administrator");
});

// API ownership coverage is kept in server.test.js.
