const test = require("node:test");
const assert = require("node:assert/strict");
const { createMetaSignupHandlers } = require("../src/messaging/metaSignupOrchestrator");
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
function fixture() {
  const calls = []; const claims = new Map(); let allowed = true; let expired = false;
  const dependencies = {
    store: { canManageWorkspace: () => allowed, addAudit() { throw new Error("Snapshot audit must not run"); } },
    stateRepository: {
      async create(input) { claims.set(input.state, input); return { expiresAt: "2030-01-01T00:00:00.000Z" }; },
      async consume({ state, sessionId, actorId }) {
        const row = claims.get(state);
        if (!row || expired || row.sessionId !== sessionId || row.actorId !== actorId) return null;
        claims.delete(state); return row;
      },
    },
    signupService: { async exchangeAndVerify(input) { calls.push(["exchange", input]); return { accessToken: "fixture-token-not-real", businessAccountId: "987", phoneNumberId: "123", displayPhoneNumber: "+923001112222" }; } },
    connectionRepository: { async install(input) { calls.push(["install", input]); return { connection: { id: "connection-a", status: "connecting", accessToken: input.accessToken }, number: { id: "number-a", phone: input.phone } }; } },
  };
  const handlers = createMetaSignupHandlers(dependencies);
  const request = (body = {}) => ({ user: { id: "owner-a" }, sessionID: "session-a", session: {}, body });
  const start = async () => { const res = response(); await handlers.start(request({ workspaceId: "workspace-a", label: "Official" }), res); assert.equal(res.statusCode, 201); return res.body.state; };
  return { calls, claims, dependencies, handlers, request, start, deny() { allowed = false; }, expire() { expired = true; } };
}
test("verified installation uses durable scope and a public projection", async () => {
  const f = fixture(); const state = await f.start(); const res = response();
  await f.handlers.complete(f.request({ state, workspaceId: "wrong", label: "wrong", accessToken: "wrong" }), res);
  assert.equal(res.statusCode, 201); assert.equal(f.calls[1][1].workspaceId, "workspace-a");
  assert.equal(f.calls[1][1].label, "Official"); assert.equal(f.calls[1][1].actorId, "owner-a");
  assert.equal(f.calls[1][1].accessToken, "fixture-token-not-real");
  assert.equal(res.body.number.automationEnabled, false); assert.equal(res.body.connection.status, "connecting");
  assert.doesNotMatch(JSON.stringify(res.body), /fixture-token|accessToken|phoneNumberId|businessAccountId/);
});
test("independent handler and session copies exchange/install at most once", async () => {
  const f = fixture(); const state = await f.start(); const other = createMetaSignupHandlers(f.dependencies);
  const a = response(); const b = response();
  await Promise.all([f.handlers.complete(f.request({ state }), a), other.complete(f.request({ state }), b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]); assert.equal(f.calls.length, 2);
  const replay = response(); await other.complete(f.request({ state }), replay); assert.equal(replay.statusCode, 409);
});
for (const scenario of ["missing", "tampered", "expired", "session", "actor", "revoked", "anonymous"]) {
  test(`rejects ${scenario} before exchange`, async () => {
    const f = fixture(); const state = await f.start(); const req = f.request({ state });
    if (scenario === "missing") delete req.body.state;
    if (scenario === "tampered") req.body.state = "x".repeat(43);
    if (scenario === "expired") f.expire();
    if (scenario === "session") req.sessionID = "other-session";
    if (scenario === "actor") req.user.id = "other-user";
    if (scenario === "revoked") f.deny();
    if (scenario === "anonymous") delete req.user;
    const res = response(); await f.handlers.complete(req, res);
    assert.equal(res.statusCode, scenario === "revoked" ? 404 : scenario === "anonymous" ? 401 : 409);
    assert.equal(f.calls.length, 0);
  });
}
test("invalid or unauthorized starts create no claim", async () => {
  const f = fixture(); f.deny(); const res = response();
  await f.handlers.start(f.request({ workspaceId: "workspace-a", label: "Official" }), res); assert.equal(res.statusCode, 404);
  const bad = response(); await f.handlers.start(f.request(), bad); assert.equal(bad.statusCode, 400);
  assert.equal(f.claims.size, 0);
});
for (const stage of ["state", "provider", "install"]) {
  test(`${stage} errors are redacted; spent claims cannot retry`, async () => {
    const f = fixture(); const state = await f.start();
    const failure = async () => { throw Object.assign(new Error("client_secret=hidden"), { code: "SECRET_CODE", status: 200 }); };
    if (stage === "state") f.dependencies.stateRepository.consume = failure;
    if (stage === "provider") f.dependencies.signupService.exchangeAndVerify = failure;
    if (stage === "install") f.dependencies.connectionRepository.install = failure;
    const res = response(); await f.handlers.complete(f.request({ state }), res);
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, "META_SIGNUP_FAILED");
    assert.doesNotMatch(JSON.stringify(res.body), /hidden|SECRET_CODE|client_secret/);
    if (stage === "state") assert.equal(f.calls.length, 0);
    else { const replay = response(); await f.handlers.complete(f.request({ state }), replay); assert.equal(replay.statusCode, 409); }
  });
}
test("known provider codes still use fixed messages and status", async () => {
  const f = fixture(); const state = await f.start();
  f.dependencies.signupService.exchangeAndVerify = async () => { throw Object.assign(new Error("secret"), { code: "META_CODE_EXCHANGE_FAILED", status: 200 }); };
  const res = response(); await f.handlers.complete(f.request({ state }), res);
  assert.equal(res.statusCode, 502); assert.equal(res.body.error, "Meta code exchange failed");
});
test("missing display phone prevents installation", async () => {
  const f = fixture(); const state = await f.start(); f.dependencies.signupService.exchangeAndVerify = async () => ({});
  const res = response(); await f.handlers.complete(f.request({ state }), res);
  assert.equal(res.body.code, "META_DISPLAY_PHONE_MISSING"); assert.equal(f.calls.length, 0);
});
test("start storage errors are redacted and durable storage is mandatory", async () => {
  const f = fixture(); f.dependencies.stateRepository.create = async () => { throw new Error("password=hidden"); };
  const res = response(); await f.handlers.start(f.request({ workspaceId: "workspace-a", label: "Official" }), res);
  assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.body), /hidden/);
  delete f.dependencies.stateRepository; assert.throws(() => createMetaSignupHandlers(f.dependencies), /durable/);
});
