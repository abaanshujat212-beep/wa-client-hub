const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const { CampaignRepository } = require('../src/campaigns/repository');
const { CampaignWorker } = require('../src/campaigns/worker');
const { MessagingRepository } = require('../src/messaging/repository');
const { MessagePolicyRepository } = require('../src/messaging/messagePolicy');
const { TemplateCatalog } = require('../src/messaging/templateCatalog');
const { CanonicalTemplateService } = require('../src/messaging/canonicalTemplateService');
const connectionString = process.env.TEST_DATABASE_URL;
const phase = process.env.TEMPLATE_TEST_PHASE || 'idempotency';
const placeholder = value => '{' + '{' + value + '}' + '}';
const approvedBody = `Hello ${placeholder(1)}`;
async function rejectBinding(pool, values) {
  await assert.rejects(pool.query(`INSERT INTO whatsapp_message_templates(id,workspace_id,provider_connection_id,whatsapp_number_id,provider,name,language,category,status,components) VALUES($1,$2,$3,$4,$5,'order_update','en','UTILITY','APPROVED',jsonb_build_array(jsonb_build_object('type','BODY','text',$6::text)))`, [...values, approvedBody]));
}
test(`official template PostgreSQL phase: ${phase}`, { skip: !connectionString, timeout: 60000 }, async () => {
  const schema = `official_template_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool);
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('u1','One','one@template.test','x','client'),('u2','Two','two@template.test','x','client')");
    if (phase === 'users') return;
    await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Plan',5,5,5)");
    if (phase === 'plans') return;
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w1','u1','One','plan'),('w2','u2','Two','plan')");
    if (phase === 'workspaces') return;
    await pool.query("INSERT INTO provider_connections(id,workspace_id,provider,label,status) VALUES('meta','w1','whatsapp_cloud','Sales','active'),('ycloud','w1','ycloud','Support','active'),('other-meta','w2','whatsapp_cloud','Other','active')");
    if (phase === 'connections') return;
    await pool.query("INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id,automation_enabled) VALUES('sales','u1','w1','Sales','+923001110000','meta',true),('support','u1','w1','Support','+923002220000','ycloud',true),('other','u2','w2','Other','+923003330000','other-meta',true)");
    if (phase === 'numbers') return;
    await pool.query(`INSERT INTO whatsapp_message_templates(id,workspace_id,provider_connection_id,whatsapp_number_id,provider,name,language,category,status,components) VALUES('valid','w1','meta','sales','whatsapp_cloud','order_update','en','UTILITY','APPROVED',jsonb_build_array(jsonb_build_object('type','BODY','text',$1::text)))`, [approvedBody]);
    if (phase === 'valid') return;
    await rejectBinding(pool, ['wrong-workspace', 'w2', 'meta', 'sales', 'whatsapp_cloud']);
    await rejectBinding(pool, ['wrong-provider', 'w1', 'meta', 'sales', 'ycloud']);
    await rejectBinding(pool, ['wrong-number', 'w1', 'meta', 'support', 'whatsapp_cloud']);
    const repository = new CampaignRepository(pool);
    const contact = { phone: '+923009990000', name: 'Ada', consentSource: 'form', policyVersion: 'v1', evidence: 'fixture', consentCapturedAt: new Date().toISOString() };
    await assert.rejects(() => repository.create({ workspaceId: 'w1', numberId: 'sales', name: 'Mismatch', template: '', officialTemplate: { name: 'order_update', language: 'en', parameters: [] }, createdBy: 'u1', contacts: [contact] }), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
    await assert.rejects(() => repository.create({ workspaceId: 'w1', numberId: 'support', name: 'No fallback', template: '', officialTemplate: { name: 'order_update', language: 'en', parameters: ['{{name}}'] }, createdBy: 'u1', contacts: [contact] }), error => error.code === 'APPROVED_TEMPLATE_REQUIRED');
    const campaign = await repository.create({ workspaceId: 'w1', numberId: 'sales', name: 'Exact template', template: '', officialTemplate: { name: 'order_update', language: 'en', parameters: ['{{name}}'] }, createdBy: 'u1', contacts: [contact] });
    assert.equal(campaign.messageMode, 'official_template');
    await repository.setStatus(['w1'], campaign.id, 'running');
    let sendInput;
    const multi = { incr() { return this; }, expire() { return this; }, async exec() { return [1, true, 1, true]; } };
    const worker = new CampaignWorker({ repository, redis: { isReady: true, multi: () => multi }, messagingRepository: { async resolveOrCreateConversation(input) { assert.deepEqual(input, { workspaceId: 'w1', numberId: 'sales', phone: '+923009990000' }); return 'exact-conversation'; } }, canonicalSendService: { async sendTemplate(input) { sendInput = input; return { message: { id: 'm1', externalMessageId: 'ext1' } }; } } });
    assert.equal(await worker.tick(), true);
    assert.deepEqual(sendInput.template.parameters, ['Ada']);
    assert.equal(sendInput.conversationId, 'exact-conversation');
    const claimedContact = await pool.query("SELECT id FROM contacts WHERE workspace_id='w1' AND phone_e164='+923009990000'");
    await pool.query("INSERT INTO conversations(id,workspace_id,whatsapp_number_id,contact_id) VALUES('sales-conversation','w1','sales',$1)", [claimedContact.rows[0].id]);
    const messagingRepository = new MessagingRepository(pool);
    let providerDispatches = 0;
    const service = new CanonicalTemplateService({ repository: messagingRepository, catalog: new TemplateCatalog(pool), policy: new MessagePolicyRepository(pool), adapters: new Map([['whatsapp_cloud', { async sendTemplate() { providerDispatches += 1; throw new Error('fixture rejection'); } }]]) });
    const request = { workspaceIds: ['w1'], conversationId: 'sales-conversation', template: { name: 'order_update', language: 'en', parameters: ['Ada'] }, idempotencyKey: 'failed-template-key', origin: 'campaign' };
    await assert.rejects(() => service.sendTemplate(request), error => error.code === 'PROVIDER_SEND_FAILED');
    await assert.rejects(() => service.sendTemplate(request), error => error.code === 'IDEMPOTENT_SEND_FAILED');
    assert.equal(providerDispatches, 1);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
