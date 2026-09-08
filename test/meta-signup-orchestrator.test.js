const test = require("node:test");
const assert = require("node:assert/strict");
const { createMetaSignupHandlers } = require("../src/messaging/metaSignupOrchestrator");

function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}
function fixture() {
  const calls = [];
  const claims = new Map();
  let allowed = true;
  let clock = 1000;
  const store = {
    canManageWorkspace: () => allowed,
    addAudit() { throw new Error("Legacy snapshot audit must not be called"); },
  };
  const stateRepository = {
    async create(input) {
      claims.set(input.state, { ...input, expiresAt: clock + input.ttlMs });
      return { expiresAt: new Date(clock + input.ttlMs).toISOString() };
    },
    async consume({ state, sessionId, actorId }) {
      const row = claims.get(state);
      if (!row || row.sessionId !== sessionId || row.actorId !== actorId || row.expiresAt <= clock) return null;
      claims.delete(state);
      return { workspaceId: row.workspaceId, label: row.label };
    },
  };
  const signupService = {
    async exchangeAndVerify(input) {
      calls.push(["exchange", input]);
      return { accessToken: "fixture-token-not-a-real-credential", businessAccountId: "987", phoneNumberId: "123", displayPhoneNumber: "+923001112222" };
    },
  };
  const connectionRepository = {
    async install(input) {
      calls.push(["install", input]);
      return { connection: { id: "connection-a", status: "connecting", accessToken: input.accessToken, encrypted_credentials: "must-not-leak" }, number: { id: "number-a", phone: input.phone } };
    },
  };
  const dependencies = { authorization: store, stateRepository, signupService, connectionRepository };
  const handlers = createMetaSignupHandlers(dependencies);
  const request = (body = {}) => ({ user: { id: "owner-a", active: true }, sessionID: "session-a", session: {}, body });
  async function start() {
    const res = response();
    await handlers.start(request({ workspaceId: "workspace-a", label: "Official WA" }), res);
    assert.equal(res.statusCode, 201);
    return res.body.state;
  }
  return { calls, claims, handlers, dependencies, request, start, setAllowed(value) { allowed = value; }, expire() { clock = 700000; } };
}

test("signup uses durable workspace/label, verified assets, authenticated actor and safe projection", async () => {
  const f = fixture(); const state = await f.start(); const res = response();
  await f.handlers.complete(f.request({ state, code: "one-time", workspaceId: "workspace-b", label: "tampered", accessToken: "attacker-token", businessAccountId: "987", phoneNumberId: "123" }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(f.calls[1][1].workspaceId, "workspace-a");
  assert.equal(f.calls[1][1].label, "Official WA");
  assert.equal(f.calls[1][1].actorId, "owner-a");
  assert.equal(f.calls[1][1].accessToken, "fixture-token-not-a-real-credential");
  assert.equal(res.body.connection.status, "connecting");
  assert.equal(res.body.number.automationEnabled, false);
  assert.doesNotMatch(JSON.stringify(res.body), /fixture-token|must-not-leak|encrypted_credentials|phoneNumberId|businessAccountId/i);
});

test("independent handler/session copies allow exactly one exchange and install", async () => {
  const f = fixture(); const state = await f.start();
  const other = createMetaSignupHandlers(f.dependencies);
  const a = response(); const b = response();
  await Promise.all([f.handlers.complete(f.request({ state }), a), other.complete(f.request({ state }), b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]);
  assert.equal(f.calls.filter(([name]) => name === "exchange").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "install").length, 1);
  const replay = response(); await other.complete(f.request({ state }), replay);
  assert.equal(replay.statusCode, 409);
});

for (const scenario of ["missing", "tampered", "expired", "wrong-session", "wrong-actor", "revoked", "unauthenticated"]) {
  test(`signup rejects ${scenario} before provider exchange`, async () => {
    const f = fixture(); const state = await f.start(); const req = f.request({ state });
    if (scenario === "missing") delete req.body.state;
    if (scenario === "tampered") req.body.state = "x".repeat(43);
    if (scenario === "expired") f.expire();
    if (scenario === "wrong-session") req.sessionID = "session-b";
    if (scenario === "wrong-actor") req.user.id = "owner-b";
    if (scenario === "revoked") f.setAllowed(false);
    if (scenario === "unauthenticated") delete req.user;
    const res = response(); await f.handlers.complete(req, res);
    assert.equal(res.statusCode, scenario === "revoked" ? 404 : scenario === "unauthenticated" ? 401 : 409);
    assert.equal(f.calls.length, 0);
  });
}

test("start rejects unauthorized and malformed requests without issuing claims", async () => {
  const f = fixture(); f.setAllowed(false);
  const denied = response(); await f.handlers.start(f.request({ workspaceId: "workspace-a", label: "Official" }), denied);
  assert.equal(denied.statusCode, 404);
  const malformed = response(); await f.handlers.start(f.request(), malformed);
  assert.equal(malformed.statusCode, 400);
  const anonymous = response(); await f.handlers.start({ body: {} }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(f.claims.size, 0);
});

for (const stage of ["claim", "provider", "install"]) {
  test(`${stage} errors are redacted and never automatically redispatched`, async () => {
    const f = fixture(); const state = await f.start();
    const secretError = Object.assign(new Error("password=hidden client_secret=hidden"), { code: "SECRET_PROVIDER_CODE", status: 200 });
    if (stage === "claim") f.dependencies.stateRepository.consume = async () => { throw secretError; };
    if (stage === "provider") f.dependencies.signupService.exchangeAndVerify = async () => { throw secretError; };
    if (stage === "install") f.dependencies.connectionRepository.install = async () => { throw secretError; };
    const res = response(); await f.handlers.complete(f.request({ state }), res);
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, "META_SIGNUP_FAILED");
    assert.doesNotMatch(JSON.stringify(res.body), /hidden|SECRET_PROVIDER_CODE|client_secret/);
    if (stage === "claim") assert.equal(f.calls.length, 0);
    else {
      const replay = response(); await f.handlers.complete(f.request({ state }), replay);
      assert.equal(replay.statusCode, 409);
    }
  });
}

test("known provider failures use fixed messages, never provider text/status", async () => {
  const f = fixture(); const state = await f.start();
  f.dependencies.signupService.exchangeAndVerify = async () => { throw Object.assign(new Error("secret"), { code: "META_CODE_EXCHANGE_FAILED", status: 200 }); };
  const res = response(); await f.handlers.complete(f.request({ state }), res);
  assert.deepEqual(res.body, { error: "Meta code exchange failed", code: "META_CODE_EXCHANGE_FAILED" });
  assert.equal(res.statusCode, 502);
});

test("missing display phone does not install and burns the claim", async () => {
  const f = fixture(); const state = await f.start();
  f.dependencies.signupService.exchangeAndVerify = async () => ({});
  const res = response(); await f.handlers.complete(f.request({ state }), res);
  assert.equal(res.body.code, "META_DISPLAY_PHONE_MISSING"); assert.equal(f.calls.length, 0);
  const replay = response(); await f.handlers.complete(f.request({ state }), replay);
  assert.equal(replay.statusCode, 409);
});

test("state storage failure at start is redacted", async () => {
  const f = fixture();
  f.dependencies.stateRepository.create = async () => { throw new Error("database password=hidden"); };
  const res = response(); await f.handlers.start(f.request({ workspaceId: "workspace-a", label: "Official" }), res);
  assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.body), /hidden/);
});

test("orchestrator requires durable state storage instead of a memory-only fallback", () => {
  const f = fixture(); delete f.dependencies.stateRepository;
  assert.throws(() => createMetaSignupHandlers(f.dependencies), /durable state storage/);
});
