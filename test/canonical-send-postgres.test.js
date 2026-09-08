const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const PostgresRepository = require("../src/db/postgresRepository");
const PostgresStore = require("../src/db/postgresStore");
const { OpenWaRepository } = require("../src/openwa/repository");
const { MessagingRepository } = require("../src/messaging/repository");
const { CanonicalSendService } = require("../src/messaging/canonicalSendService");
const connectionString = process.env.TEST_DATABASE_URL;
test("PostgreSQL canonical send reserves concurrent idempotency keys before dispatch", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString }); const postgres = new PostgresRepository({ pool, connectionString }); const store = new PostgresStore(process.cwd(), { repository: postgres }); const suffix = crypto.randomUUID();
  try {
    await postgres.init(); await store.init({ adminEmail: "admin@test.local", adminPassword: "AdminPassword123!" });
    const user = await store.createClient({ name: "Canonical Sender", email: `canonical-${suffix}@test.local`, password: "RuntimePassword123!" });
    const workspace = await store.createWorkspace({ ownerId: user.id, name: `Canonical ${suffix}`, planId: "team" });
    const number = await store.createAccount({ ownerId: user.id, workspaceId: workspace.id, label: "Canonical WA", phone: "+923002222222" });
    const openwa = new OpenWaRepository(pool); const connection = await openwa.enable({ workspaceId: workspace.id, numberId: number.id, sessionId: `session-${suffix}`, label: number.label, riskAcknowledgedBy: user.id }); await openwa.setStatus(connection.id, "active");
    const contactId = `contact-${suffix}`; const conversationId = `conversation-${suffix}`;
    await pool.query("INSERT INTO contacts (id,workspace_id,display_name,phone_e164) VALUES ($1,$2,$3,$4)", [contactId, workspace.id, "Concurrent Recipient", "+923003333333"]);
    await pool.query("INSERT INTO conversations (id,workspace_id,whatsapp_number_id,contact_id) VALUES ($1,$2,$3,$4)", [conversationId, workspace.id, number.id, contactId]);
    let providerCalls = 0;
    const service = new CanonicalSendService({ repository: new MessagingRepository(pool), adapters: { openwa: { async sendText() { providerCalls += 1; await new Promise((resolve) => setTimeout(resolve, 75)); return { externalMessageId: `external-${suffix}`, rawStatus: "queued" }; } } } });
    const input = { actorId: user.id, workspaceIds: [workspace.id], conversationId, text: "Exactly once", idempotencyKey: `parallel-${suffix}` };
    const results = await Promise.all([service.sendText(input), service.sendText(input)]);
    assert.equal(providerCalls, 1); assert.equal(results.filter((result) => result.duplicate).length, 1); assert.equal(results.filter((result) => !result.duplicate).length, 1);
    const messages = await pool.query("SELECT id FROM messages WHERE workspace_id=$1 AND client_idempotency_key=$2", [workspace.id, input.idempotencyKey]); assert.equal(messages.rowCount, 1);
    const attempts = await pool.query("SELECT status,message_id FROM message_send_attempts WHERE workspace_id=$1 AND client_idempotency_key=$2", [workspace.id, input.idempotencyKey]); assert.equal(attempts.rowCount, 1); assert.equal(attempts.rows[0].status, "accepted"); assert.equal(attempts.rows[0].message_id, messages.rows[0].id);
    await assert.rejects(service.sendText({ ...input, workspaceIds: ["other-workspace"], idempotencyKey: `unauthorized-${suffix}` }), (error) => error.code === "CONVERSATION_NOT_FOUND" && error.status === 404);
  } finally { await pool.end(); }
});
