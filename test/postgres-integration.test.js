const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const PostgresRepository = require('../src/db/postgresRepository');
const PostgresStore = require('../src/db/postgresStore');
const { DEFAULT_PLANS } = require('../src/store');
const { OpenWaRepository } = require('../src/openwa/repository');
const { InboxRepository } = require('../src/inbox/repository');
const { CampaignRepository } = require('../src/campaigns/repository');
const { CredentialVault } = require('../src/connectors/vault');
const { ConnectorRepository } = require('../src/connectors/repository');
const { GenericApiRepository } = require('../src/generic-api/repository');
const { normalizeCommerce, normalizeGhl } = require('../src/providers/normalize');

const connectionString = process.env.TEST_DATABASE_URL;

test('PostgreSQL migration and legacy JSON round trip', { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString });
  const repository = new PostgresRepository({ pool, connectionString });
  const suffix = crypto.randomUUID();
  const userId = `user-${suffix}`;
  const workspaceId = `workspace-${suffix}`;
  const numberId = `number-${suffix}`;
  const now = new Date().toISOString();
  try {
    await repository.init();
    await repository.init();
    await repository.replaceLegacyState({
      plans: DEFAULT_PLANS,
      users: [{ id: userId, name: 'Postgres Client', email: `${suffix}@test.local`, passwordHash: 'hash', role: 'client', active: true, createdAt: now }],
      workspaces: [{ id: workspaceId, ownerId: userId, name: 'Postgres Workspace', planId: 'team', status: 'active', billingProvider: 'manual', billingStatus: 'manual', createdAt: now }],
      workspaceMembers: [{ id: `member-${suffix}`, workspaceId, userId, role: 'owner', createdAt: now }],
      accounts: [{ id: numberId, ownerId: userId, workspaceId, label: 'Support', phone: '+923001111111', createdAt: now, lastLaunchedAt: null }],
      invites: [],
      audit: [{ id: `audit-${suffix}`, userId, action: 'import.test', details: { ok: true }, createdAt: now }]
    }, { requireEmpty: false, destructiveReplace: true });
    const data = await repository.loadLegacyState();
    assert.equal(data.users[0].email, `${suffix}@test.local`);
    assert.equal(data.workspaces[0].id, workspaceId);
    assert.equal(data.accounts[0].workspaceId, workspaceId);
    assert.deepEqual(data.audit[0].details, { ok: true });

    const runtimeStore = new PostgresStore(process.cwd(), { repository });
    await runtimeStore.init({ adminEmail: 'admin@test.local', adminPassword: 'AdminPassword123!' });
    const second = await runtimeStore.createClient({ name: 'Runtime Client', email: `runtime-${suffix}@test.local`, password: 'RuntimePassword123!' });
    const secondWorkspace = await runtimeStore.createWorkspace({ ownerId: second.id, name: 'Runtime Workspace', planId: 'team' });
    const secondNumber = await runtimeStore.createAccount({ ownerId: second.id, workspaceId: secondWorkspace.id, label: 'Runtime WA', phone: '+923002222222' });
    const contactId = `contact-${suffix}`;
    const conversationId = `conversation-${suffix}`;
    const messageId = `message-${suffix}`;
    await pool.query('INSERT INTO contacts (id,workspace_id,display_name,phone_e164) VALUES ($1,$2,$3,$4)', [contactId, secondWorkspace.id, 'Customer', '+923003333333']);
    await pool.query('INSERT INTO conversations (id,workspace_id,whatsapp_number_id,contact_id) VALUES ($1,$2,$3,$4)', [conversationId, secondWorkspace.id, secondNumber.id, contactId]);
    await pool.query("INSERT INTO messages (id,workspace_id,conversation_id,direction,origin,type,body,occurred_at) VALUES ($1,$2,$3,'inbound','contact','text','preserve me',now())", [messageId, secondWorkspace.id, conversationId]);
    await runtimeStore.addAudit(second.id, 'runtime.persisted', { accountId: secondNumber.id });
    const persisted = await repository.loadLegacyState();
    assert.ok(persisted.users.some((row) => row.id === second.id));
    assert.ok(persisted.workspaces.some((row) => row.id === secondWorkspace.id));
    assert.ok(persisted.accounts.some((row) => row.id === secondNumber.id));
    assert.ok(persisted.audit.some((row) => row.action === 'runtime.persisted'));
    const canonicalMessage = await pool.query('SELECT body FROM messages WHERE id = $1', [messageId]);
    assert.equal(canonicalMessage.rows[0].body, 'preserve me');

    const openwa = new OpenWaRepository(pool);
    const connection = await openwa.enable({ workspaceId: secondWorkspace.id, numberId: secondNumber.id, sessionId: `session-${suffix}`, label: 'Runtime WA', riskAcknowledgedBy: second.id });
    assert.equal((await openwa.connectionForNumber(secondWorkspace.id, secondNumber.id)).id, connection.id);
    assert.equal(await openwa.connectionForNumber(workspaceId, secondNumber.id), null);
    const envelope = {
      webhookId: `webhook-${suffix}`,
      sessionId: `session-${suffix}`,
      event: 'message.received',
      timestamp: Date.now(),
      payload: { message: { id: `external-${suffix}`, from: '923004444444@c.us', to: '923002222222@c.us', body: 'OpenWA inbound', type: 'chat', timestamp: Math.floor(Date.now() / 1000), fromMe: false } }
    };
    const ingested = await openwa.ingest(envelope);
    assert.equal(ingested.duplicate, false);
    assert.match(ingested.receiptId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await openwa.ingest(envelope), { duplicate: true });
    const normalized = await pool.query("SELECT m.body,m.direction,c.phone_e164 FROM messages m JOIN conversations v ON v.id=m.conversation_id JOIN contacts c ON c.id=v.contact_id WHERE m.external_message_id=$1", [`external-${suffix}`]);
    assert.deepEqual(normalized.rows[0], { body: 'OpenWA inbound', direction: 'inbound', phone_e164: '+923004444444' });

    const inbox = new InboxRepository(pool);
    const ownInbox = await inbox.listConversations({ workspaceIds: [secondWorkspace.id], search: 'OpenWA', limit: 10 });
    assert.equal(ownInbox.conversations.length, 1);
    assert.equal(ownInbox.conversations[0].workspace_id, secondWorkspace.id);
    assert.equal((await inbox.listConversations({ workspaceIds: [workspaceId], search: 'OpenWA' })).conversations.length, 0);
    const inboxConversationId = ownInbox.conversations[0].id;
    const thread = await inbox.listMessages([secondWorkspace.id], inboxConversationId);
    assert.equal(thread.messages.at(-1).body, 'OpenWA inbound');
    assert.equal(await inbox.listMessages([workspaceId], inboxConversationId), null);
    assert.equal((await inbox.markRead([secondWorkspace.id], inboxConversationId)).unread_count, 0);
    assert.equal((await inbox.assign([secondWorkspace.id], inboxConversationId, second.id)).assigned_user_id, second.id);
    assert.equal((await inbox.addNote([secondWorkspace.id], inboxConversationId, second.id, 'Follow up')).body, 'Follow up');
    const tag = await inbox.addTag([secondWorkspace.id], inboxConversationId, 'VIP', '#25d366');
    assert.equal(tag.name, 'VIP');
    assert.equal(await inbox.removeTag([secondWorkspace.id], inboxConversationId, tag.id), true);

    const campaigns = new CampaignRepository(pool);
    await campaigns.suppress({ workspaceId: secondWorkspace.id, phone: '+923006666666', reason: 'existing opt-out' });
    const campaign = await campaigns.create({ workspaceId: secondWorkspace.id, numberId: secondNumber.id, name: 'Consent campaign', template: 'Hi {{name}}', createdBy: second.id, contacts: [
      { phone: '+923005555555', name: 'Eligible', consentSource: 'test-form', policyVersion: 'v1', consentCapturedAt: now, evidence: 'submission-1' },
      { phone: '+923006666666', name: 'Blocked', consentSource: 'test-form', policyVersion: 'v1', consentCapturedAt: now, evidence: 'submission-2' }
    ] });
    assert.equal(campaign.accepted, 1); assert.equal(campaign.rejected, 1);
    assert.equal((await campaigns.list([secondWorkspace.id]))[0].total, 2);
    assert.equal((await campaigns.list([workspaceId])).length, 0);
    await campaigns.setStatus([secondWorkspace.id], campaign.id, 'running');
    const claimed = await campaigns.claim();
    assert.equal(claimed.phone_e164, '+923005555555');
    assert.deepEqual(await campaigns.eligibility(claimed), { consented: true, suppressed: false });
    await campaigns.transition(claimed, 'sent', null, { externalMessageId: 'campaign-external' });
    assert.equal((await campaigns.syncDelivery(secondWorkspace.id, 'campaign-external', 'delivered')).status, 'delivered');

    const vault = new CredentialVault({ key: crypto.randomBytes(32), keyId: 'integration-v1' });
    const connectors = new ConnectorRepository(pool, vault);
    const installed = await connectors.install({ workspaceId: secondWorkspace.id, provider: 'generic', label: 'Reference CRM', credentials: { baseUrl: 'https://crm.test/hooks', token: 'secret-token', webhookSecret: 'secret-hook' }, scopes: ['contacts:read', 'contacts:write', 'orders:read', 'conversations:read'], fieldMapping: { fullName: 'display_name', phone: 'phone_e164', email: 'email' }, conflictPolicy: 'latest_wins' });
    assert.equal(installed.hasCredentials, true); assert.equal(installed.token, undefined);
    assert.equal((await connectors.list([workspaceId])).length, 0);
    assert.equal(await connectors.get([workspaceId], installed.id), null);
    const storedSecret = await pool.query('SELECT encrypted_credentials FROM connector_connections WHERE id=$1', [installed.id]);
    assert.equal(storedSecret.rows[0].encrypted_credentials.includes(Buffer.from('secret-token')), false);
    const connectorRow = await connectors.internal(installed.id);
    const newerEvent = { externalEventId: `crm-new-${suffix}`, type: 'contact.updated', subjectType: 'contact', subjectId: 'crm-contact-1', occurredAt: '2026-05-02T00:00:00Z', data: { fullName: 'CRM Person', phone: '+923007777777', email: 'crm@test.local' } };
    assert.equal((await connectors.receive(connectorRow, newerEvent)).status, 'processed');
    assert.equal((await connectors.receive(connectorRow, newerEvent)).duplicate, true);
    const refreshed = await connectors.internal(installed.id);
    const olderEvent = { ...newerEvent, externalEventId: `crm-old-${suffix}`, occurredAt: '2026-05-01T00:00:00Z', data: { ...newerEvent.data, fullName: 'Stale Name' } };
    assert.equal((await connectors.receive(refreshed, olderEvent)).status, 'ignored');
    assert.equal((await pool.query("SELECT display_name FROM contacts WHERE workspace_id=$1 AND phone_e164='+923007777777'", [secondWorkspace.id])).rows[0].display_name, 'CRM Person');
    await connectors.updateSettings([secondWorkspace.id], installed.id, { scopes: installed.scopes, fieldMapping: installed.fieldMapping, conflictPolicy: 'manual_review' });
    const manual = await connectors.internal(installed.id);
    assert.equal((await connectors.receive(manual, { ...olderEvent, externalEventId: `crm-conflict-${suffix}` })).reason, 'manual_review');
    assert.equal((await connectors.diagnostics([secondWorkspace.id], installed.id)).openConflicts, 1);
    const outgoing = { ...newerEvent, externalEventId: `out-${suffix}` };
    assert.ok(await connectors.enqueue({ workspaceId: secondWorkspace.id, connectionId: installed.id, event: outgoing }));
    assert.equal(await connectors.enqueue({ workspaceId: secondWorkspace.id, connectionId: installed.id, event: outgoing }), null);
    await pool.query("UPDATE outbox_events SET status='failed' WHERE connector_connection_id=$1", [installed.id]);
    const replayEvent = { ...newerEvent, externalEventId: `replay-${suffix}`, subjectId: 'crm-contact-2', data: { ...newerEvent.data, phone: '+923008888888' } };
    await pool.query("INSERT INTO connector_inbox_events(id,workspace_id,connector_connection_id,external_event_id,event_type,external_occurred_at,payload,status,attempt_count) VALUES($1,$2,$3,$4,$5,$6,$7,'failed',1)", [`inbox-replay-${suffix}`, secondWorkspace.id, installed.id, replayEvent.externalEventId, replayEvent.type, replayEvent.occurredAt, replayEvent]);
    const replayed = await connectors.replay([secondWorkspace.id], installed.id);
    assert.equal(replayed.inboxReplayed, 1); assert.equal(replayed.outboxRequeued, 1);
    assert.equal((await pool.query("SELECT count(*)::int count FROM contacts WHERE workspace_id=$1 AND phone_e164='+923008888888'", [secondWorkspace.id])).rows[0].count, 1);
    const orderEvent = normalizeCommerce('shopify', 'orders/create', { id: 'order-1', order_number: '1001', financial_status: 'paid', currency: 'USD', total_price: '49.50', phone: '+923007777777', updated_at: '2026-05-03T00:00:00Z' }, { deliveryId: `order-delivery-${suffix}` });
    assert.equal((await connectors.receive(await connectors.internal(installed.id), orderEvent)).status, 'processed');
    assert.equal((await pool.query("SELECT status FROM orders WHERE connector_connection_id=$1", [installed.id])).rows[0].status, 'paid');
    const syncedOrder = (await pool.query("SELECT id,contact_id FROM orders WHERE connector_connection_id=$1", [installed.id])).rows[0];
    await assert.rejects(() => campaigns.createApprovedTrigger({ workspaceId: secondWorkspace.id, numberId: secondNumber.id, contactId: syncedOrder.contact_id, name: 'Order follow-up', template: 'Thanks {{name}}', createdBy: second.id }), /Valid existing consent/);
    await pool.query("INSERT INTO consent_records(id,workspace_id,contact_id,purpose,status,source,policy_version,captured_at,evidence) VALUES($1,$2,$3,'order-follow-up','granted','shopify-checkout','v1',$4,$5)", [crypto.randomUUID(), secondWorkspace.id, syncedOrder.contact_id, now, { reference: 'checkout-opt-in' }]);
    const orderCampaign = await campaigns.createApprovedTrigger({ workspaceId: secondWorkspace.id, numberId: secondNumber.id, contactId: syncedOrder.contact_id, name: 'Order follow-up', template: 'Thanks {{name}}', createdBy: second.id });
    assert.equal(orderCampaign.status, 'running');
    const messageEvent = normalizeGhl({ type: 'InboundMessage', messageId: `ghl-message-${suffix}`, locationId: 'location-1', contactPhone: '+923007777777', message: 'CRM inbound', timestamp: '2026-05-04T00:00:00Z' });
    assert.equal((await connectors.receive(await connectors.internal(installed.id), messageEvent)).status, 'processed');
    assert.equal((await pool.query("SELECT count(*)::int count FROM messages WHERE workspace_id=$1 AND metadata->>'externalMessageId'=$2", [secondWorkspace.id, `ghl-message-${suffix}`])).rows[0].count, 1);
    const genericApi = new GenericApiRepository(pool, { perMinute: 3 });
    const apiKey = await genericApi.createKey(secondWorkspace.id, 'Integration', ['contacts:read']);
    assert.equal((await genericApi.authenticate(apiKey.key)).workspace_id, secondWorkspace.id);
    assert.equal(await genericApi.authenticate('wah_wrong'), null);
    await genericApi.saveIdempotency(apiKey.id, 'idem-1', { value: 1 }, { id: 'response-1' });
    assert.deepEqual(await genericApi.existingIdempotency(apiKey.id, 'idem-1', { value: 1 }), { id: 'response-1' });
    await assert.rejects(() => genericApi.existingIdempotency(apiKey.id, 'idem-1', { value: 2 }), /different request/);
    assert.equal(await genericApi.revoke([workspaceId], apiKey.id), false);
    assert.equal(await genericApi.revoke([secondWorkspace.id], apiKey.id), true);
    const limitedKey = await genericApi.createKey(secondWorkspace.id, 'Rate limit', ['contacts:read']);
    await genericApi.authenticate(limitedKey.key); await genericApi.authenticate(limitedKey.key); await genericApi.authenticate(limitedKey.key);
    await assert.rejects(() => genericApi.authenticate(limitedKey.key), (error) => error.status === 429);
    const rotated = await connectors.rotate([secondWorkspace.id], installed.id, { baseUrl: 'https://crm.test/hooks', token: 'rotated-token', webhookSecret: 'rotated-hook' });
    assert.equal(rotated.keyId, 'integration-v1'); assert.equal(rotated.token, undefined);
    const revoked = await connectors.revoke([secondWorkspace.id], installed.id);
    assert.equal(revoked.status, 'revoked'); assert.equal(revoked.hasCredentials, false);
    assert.equal((await pool.query('SELECT status FROM outbox_events WHERE connector_connection_id=$1', [installed.id])).rows[0].status, 'dead_letter');
  } finally {
    await pool.end();
  }
});
