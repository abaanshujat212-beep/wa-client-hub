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
  } finally {
    await pool.end();
  }
});
