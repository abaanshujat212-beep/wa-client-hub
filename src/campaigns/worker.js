const { inQuietHours, renderTemplate } = require('./policy');

class CampaignWorker {
  constructor({ repository, canonicalSendService = null, messagingRepository = null, redis, events, workspaceLimit = 20, numberLimit = 10, pollMs = 1000 }) {
    this.repository = repository;
    this.canonicalSendService = canonicalSendService;
    this.messagingRepository = messagingRepository;
    this.redis = redis;
    this.events = events;
    this.workspaceLimit = workspaceLimit;
    this.numberLimit = numberLimit;
    this.pollMs = pollMs;
    this.timer = null;
    this.running = false;
    if (!this.canonicalSendService && repository?.pool) {
      const { createMessagingRuntime } = require('../messaging/runtime');
      this.canonicalSendService = createMessagingRuntime({ pool: repository.pool });
    }
    if (!this.messagingRepository) this.messagingRepository = this.canonicalSendService?.repository || null;
  }

  start() { if (this.timer || !this.redis) return; this.timer = setInterval(() => this.tick().catch(() => {}), this.pollMs); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async throttle(recipient) { const minute = Math.floor(Date.now() / 60000); const workspaceKey = `campaign:rate:workspace:${recipient.workspace_id}:${minute}`; const numberKey = `campaign:rate:number:${recipient.whatsapp_number_id}:${minute}`; const result = await this.redis.multi().incr(workspaceKey).expire(workspaceKey, 120, 'NX').incr(numberKey).expire(numberKey, 120, 'NX').exec(); return Number(result[0]) <= this.workspaceLimit && Number(result[2]) <= this.numberLimit; }

  async tick() {
    if (this.running || !this.redis?.isReady) return false;
    this.running = true;
    try {
      const recipient = await this.repository.claim();
      if (!recipient) return false;
      const campaign = await this.repository.get([recipient.workspace_id], recipient.campaign_id);
      if (!campaign || campaign.status !== 'running') return this.repository.retry(recipient, 'campaign_paused', 1000);
      if (inQuietHours(new Date(), recipient.quiet_start, recipient.quiet_end)) return this.repository.retry(recipient, 'quiet_hours', 1000);
      const eligibility = await this.repository.eligibility(recipient);
      if (eligibility.suppressed) { await this.repository.transition(recipient, 'suppressed', 'suppression_match'); return true; }
      if (!eligibility.consented) { await this.repository.transition(recipient, 'unconsented', 'valid_consent_missing'); return true; }
      if (!(await this.throttle(recipient))) { await this.repository.retry(recipient, 'rate_limited', 1000); return true; }
      if (!this.messagingRepository || !this.canonicalSendService) { await this.repository.retry(recipient, 'canonical_messaging_unavailable'); return true; }
      const conversationId = await this.messagingRepository.resolveOrCreateConversation({ workspaceId: recipient.workspace_id, numberId: recipient.whatsapp_number_id, phone: recipient.phone_e164 });
      if (!conversationId) { await this.repository.retry(recipient, 'automation_not_available'); return true; }
      try {
        const common = { actorId: 'system', workspaceIds: [recipient.workspace_id], conversationId, idempotencyKey: `campaign:${recipient.id}`, origin: 'campaign' };
        const templateMode = campaign.message_mode === 'official_template';
        if (templateMode && typeof this.canonicalSendService.sendTemplate !== 'function') throw Object.assign(new Error('Template runtime unavailable'), { code: 'TEMPLATE_PROVIDER_UNAVAILABLE' });
        const parameters = (campaign.official_template_parameters || []).map(value => {
          if (value && typeof value === 'object') return { ...value, text: renderTemplate(value.text, { name: recipient.display_name || '', phone: recipient.phone_e164 }) };
          return renderTemplate(value, { name: recipient.display_name || '', phone: recipient.phone_e164 });
        });
        const result = templateMode
          ? await this.canonicalSendService.sendTemplate({ ...common, template: { name: campaign.official_template_name, language: campaign.official_template_language, parameters } })
          : await this.canonicalSendService.sendText({ ...common, text: recipient.personalized_body });
        const message = result.message || {};
        if (!message.id) throw Object.assign(new Error('Canonical send is not yet persisted'), { code: 'IDEMPOTENT_SEND_PENDING' });
        await this.repository.transition(recipient, 'sent', null, { externalMessageId: String(message.external_message_id || message.externalMessageId || ''), messageId: message.id });
        this.events?.publish(recipient.workspace_id, 'campaign.recipient.sent', { campaignId: recipient.campaign_id, recipientId: recipient.id, messageMode: campaign.message_mode });
        return true;
      } catch (error) {
        if (error.code === 'CONTACT_SUPPRESSED') await this.repository.transition(recipient, 'suppressed', 'suppression_match');
        else if (error.code === 'CONSENT_REQUIRED') await this.repository.transition(recipient, 'unconsented', 'valid_consent_missing');
        else if (['SESSION_TEMPLATE_REQUIRED', 'APPROVED_TEMPLATE_REQUIRED', 'TEMPLATE_PROVIDER_UNAVAILABLE', 'TEMPLATE_PARAMETERS_MISMATCH'].includes(error.code)) await this.repository.transition(recipient, 'failed', 'approved_template_required');
        else await this.repository.retry(recipient, error.code || 'canonical_send_failed');
        return true;
      }
    } finally { this.running = false; }
  }
}

module.exports = { CampaignWorker };
