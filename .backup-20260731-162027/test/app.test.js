process.env.MOCK_BROWSER = "1";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-local-tests";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Store = require("../src/store");
const BrowserLauncher = require("../src/launcher");

test("store keeps client accounts separated", async () => {
  const root = path.join(require("node:os").tmpdir(), `wa-hub-${Date.now()}`);
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
  const root = path.join(require("node:os").tmpdir(), `wa-launch-${Date.now()}`);
  const launcher = new BrowserLauncher(root);
  const account = { id: "account-a", ownerId: "owner-a" };
  assert.equal(launcher.status(account).running, false);
  launcher.launch(account);
  assert.equal(launcher.status(account).running, true);
});
