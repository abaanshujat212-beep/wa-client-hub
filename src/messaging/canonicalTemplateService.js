const crypto = require('node:crypto');
const { normalizeTemplate, validateApprovedTemplate } = require('./templateCatalog');
const { normalizeIdempotencyKey, normalizeOrigin, SendError } = require('./canonicalSendService');

class CanonicalTemplateService {
  constructor({ repository, catalog, policy, adapters, events = null, audit = null }) {
    this.repository = repository;
    this.catalog = catalog;
    this.policy = policy;
    this.adapters = adapters;
    this.events = events;
    this.audit = audit;
  }

  async sendTemplate({ actorId, workspaceIds, conversationId, template, idempotencyKey, origin = 'api' }) {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const messageOrigin = normalizeOrigin(origin);
    const value = normalizeTemplate(template);
    const dispatch = await this.repository.resolveConversationDispatch({ workspaceIds, conversationId });
    if (!dispatch) throw new SendError('Conversation not found', { code: 'CONVERSATION_NOT_FOUND', status: 404 });
    if (!dispatch.automationEnabled) throw new SendError('Automation is not enabled for this WhatsApp number', { code: 'AUTOMATION_DISABLED', status: 409 });
    if (dispatch.providerStatus !== 'active') throw new SendError('Messaging provider connection is not active', { code: 'PROVIDER_CONNECTION_INACTIVE', status: 409 });
    if (!['whatsapp_cloud', 'ycloud'].includes(dispatch.provider)) throw new SendError('Approved templates require an official provider', { code: 'TEMPLATE_PROVIDER_UNAVAILABLE', status: 409 });
    const adapter = this.adapters.get(dispatch.provider);
    if (typeof adapter?.sendTemplate !== 'function') throw new SendError('Template provider is unavailable', { code: 'TEMPLATE_PROVIDER_UNAVAILABLE', status: 409 });

    const policy = await this.policy.evaluateText({ dispatch });
    if (policy.suppressed) throw new SendError('Contact is suppressed', { code: 'CONTACT_SUPPRESSED', status: 409 });
    if (!policy.consented) throw new SendError('Valid WhatsApp consent is required', { code: 'CONSENT_REQUIRED', status: 409 });

    const approved = await this.catalog.resolveApproved({
      workspaceId: dispatch.workspaceId,
      providerConnectionId: dispatch.providerConnectionId,
      numberId: dispatch.numberId,
      name: value.name,
      language: value.language
    });
    if (!approved) throw new SendError('Approved template was not found for this connection and number', { code: 'APPROVED_TEMPLATE_REQUIRED', status: 409 });
    try {
      validateApprovedTemplate(value, approved);
    } catch (error) {
      throw new SendError(error.message, { code: error.code || 'TEMPLATE_PARAMETERS_INVALID', status: error.status || 409 });
    }

    const body = `[template:${value.name}:${value.language}]`;
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ conversationId: dispatch.conversationId, type: 'template', template: value, origin: messageOrigin })).digest('hex');
    const reservation = await this.repository.reserveOutbound({ dispatch, idempotencyKey: key, requestHash });
    if (!reservation.created && reservation.attempt.request_hash !== requestHash) {
      throw new SendError('Idempotency key was already used for a different request', { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
    }
    if (!reservation.created) {
      const attempt = reservation.attempt;
      if (attempt.status === 'failed') {
        throw new SendError('The previous send attempt failed; use a new idempotency key after review', { code: 'IDEMPOTENT_SEND_FAILED', status: 409 });
      }
      if (attempt.status === 'provider_accepted' && !attempt.message_id) {
        const recovered = await this.repository.recordOutbound({
          attemptId: attempt.id,
          dispatch,
          body,
          type: 'text',
          origin: messageOrigin,
          externalMessageId: attempt.external_message_id || null,
          idempotencyKey: key,
          rawProviderStatus: attempt.raw_provider_status || null
        });
        this.events?.publish(dispatch.workspaceId, 'message.changed', { conversationId: dispatch.conversationId, messageId: recovered.id, provider: dispatch.provider, numberId: dispatch.numberId });
        if (this.audit) await this.audit(actorId, 'template.send_recovered', { workspaceId: dispatch.workspaceId, conversationId: dispatch.conversationId, numberId: dispatch.numberId, providerConnectionId: dispatch.providerConnectionId, template: value.name, language: value.language, messageId: recovered.id, attemptId: attempt.id, origin: messageOrigin });
        return { message: recovered, duplicate: true, recovered: true, template: { name: value.name, language: value.language } };
      }
      return {
        message: attempt.message_id ? { id: attempt.message_id, externalMessageId: attempt.external_message_id, status: attempt.message_status || attempt.status } : { id: null, attemptId: attempt.id, status: attempt.status },
        duplicate: true,
        template: { name: value.name, language: value.language }
      };
    }

    const attemptId = reservation.attempt.id;
    await this.repository.markDispatching({ attemptId, workspaceId: dispatch.workspaceId });
    let providerResult;
    try {
      providerResult = await adapter.sendTemplate({ connection: dispatch, to: dispatch.contactPhone, template: value, idempotencyKey: key });
    } catch (error) {
      await this.repository.failOutbound({ attemptId, workspaceId: dispatch.workspaceId, error });
      throw new SendError('Provider rejected the template', { code: error.code || 'PROVIDER_SEND_FAILED', status: 502 });
    }
    await this.repository.markProviderAccepted({ attemptId, workspaceId: dispatch.workspaceId, externalMessageId: providerResult.externalMessageId, rawProviderStatus: providerResult.rawStatus });
    const message = await this.repository.recordOutbound({ attemptId, dispatch, body, type: 'text', origin: messageOrigin, externalMessageId: providerResult.externalMessageId, idempotencyKey: key, rawProviderStatus: providerResult.rawStatus });
    this.events?.publish(dispatch.workspaceId, 'message.changed', { conversationId: dispatch.conversationId, messageId: message.id, provider: dispatch.provider, numberId: dispatch.numberId });
    if (this.audit) await this.audit(actorId, 'template.sent', { workspaceId: dispatch.workspaceId, conversationId: dispatch.conversationId, numberId: dispatch.numberId, providerConnectionId: dispatch.providerConnectionId, template: value.name, language: value.language, messageId: message.id, origin: messageOrigin });
    return { message, duplicate: false, template: { name: value.name, language: value.language } };
  }
}

module.exports = { CanonicalTemplateService };
