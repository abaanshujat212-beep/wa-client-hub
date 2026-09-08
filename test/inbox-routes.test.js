const test = require("node:test");
const assert = require("node:assert/strict");
const { createInboxRouter } = require("../src/inbox/routes");
function fixture(overrides = {}) {
  const calls = [];
  const repository = { async listMessages(...args) { calls.push(args); return { messages: [] }; }, ...overrides.repository };
  const router = createInboxRouter({ store: { listWorkspaces: () => [{ id: "workspace-a" }], addAudit: async () => {} }, repository, events: { publish() {}, subscribe() { return () => {}; } }, requireAuth: (_req,_res,next) => next(), remoteDesktopConfig: () => ({ enabled: false, url: "", label: "" }), sendService: { async sendText() { return { message: { id: "message-a" }, duplicate: false }; } } });
  return { router, calls };
}
function routes(router) { return router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`); }
test("inbox router preserves the existing surface and adds canonical send", () => { const { router } = fixture(); assert.deepEqual(routes(router), ["GET /conversations","GET /conversations/:id/messages","POST /conversations/:id/messages","POST /conversations/:id/read","PATCH /conversations/:id/assignment","GET /conversations/:id/notes","POST /conversations/:id/notes","POST /conversations/:id/tags","DELETE /conversations/:id/tags/:tagId","POST /conversations/:id/manual-handoff","GET /events"]); });
test("existing thread route keeps the positional repository contract", async () => { const { router, calls } = fixture(); const layer = router.stack.find((item) => item.route?.path === "/conversations/:id/messages" && item.route.methods.get); const req = { user: { id: "user-a" }, params: { id: "conversation-a" }, query: { limit: "20" } }; const res = { body: null, statusCode: 200, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } }; await layer.route.stack[0].handle(req,res); assert.deepEqual(calls[0], [["workspace-a"],"conversation-a",{limit:"20"}]); assert.deepEqual(res.body,{messages:[]}); });
