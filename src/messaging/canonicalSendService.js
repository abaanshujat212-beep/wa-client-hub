class SendError extends Error {
  constructor(message, { code = "SEND_FAILED", status = 500 } = {}) {
    super(message);
    this.name = "SendError";
    this.code = code;
    this.status = status;
  }
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length > 200) {
    throw new SendError("A valid idempotency key is required", {
      code: "INVALID_IDEMPOTENCY_KEY",
      status: 400
    });
  }
  return key;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 4096) {
    throw new SendError("Message text must contain 1 to 4096 characters", {
      code: "INVALID_MESSAGE_TEXT",
      status: 400
    });
  }
  return text;
}

class CanonicalSendService {
  constructor({ repository, adapters, events = null, audit = null }) {
    if (!repository) throw new TypeError("repository is required");
    this.repository = repository;
    this.adapters = new Map(Object.entries(adapters || {}));
    this.events = events;
    this.audit = audit;
  }

  async sendText({ actorId, workspaceIds, conversationId, text, idempotencyKey }) {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const body = normalizeText(text);
    const dispatch = await this.repository.resolveConversationDispatch({
      workspaceIds,
      conversationId
    });

    if (!dispatch) {
      throw new SendError("Conversation not found", {
        code: "CONVERSATION_NOT_FOUND",
        status: 404
      });
    }

    const existing = await this.repository.outboundByIdempotencyKey(
      dispatch.workspaceId,
      key
    );
    if (existing) return { message: existing, duplicate: true };

    if (!dispatch.automationEnabled) {
      throw new SendError("Automation is not enabled for this WhatsApp number", {
        code: "AUTOMATION_DISABLED",
        status: 409
      });
    }

    const adapter = this.adapters.get(dispatch.provider);
    if (!adapter) {
      throw new SendError(`Messaging provider '${dispatch.provider}' is not available`, {
        code: "PROVIDER_UNAVAILABLE",
        status: 409
      });
    }

    let providerResult;
    try {
      providerResult = await adapter.sendText({
        connection: dispatch,
        to: dispatch.contactPhone,
        text: body,
        idempotencyKey: key
      });
    } catch (error) {
      throw new SendError("Provider rejected the message", {
        code: error.code || "PROVIDER_SEND_FAILED",
        status: 502
      });
    }

    const message = await this.repository.recordOutbound({
      dispatch,
      body,
      type: "text",
      origin: "api",
      externalMessageId: providerResult?.externalMessageId || null,
      idempotencyKey: key,
      rawProviderStatus: providerResult?.rawStatus || null
    });

    this.events?.publish(dispatch.workspaceId, "message.changed", {
      conversationId: dispatch.conversationId,
      messageId: message.id,
      provider: dispatch.provider,
      numberId: dispatch.numberId
    });

    if (this.audit) {
      await this.audit(actorId, "message.sent", {
        workspaceId: dispatch.workspaceId,
        conversationId: dispatch.conversationId,
        numberId: dispatch.numberId,
        providerConnectionId: dispatch.providerConnectionId,
        provider: dispatch.provider,
        messageId: message.id
      });
    }

    return { message, duplicate: false };
  }
}

module.exports = {
  CanonicalSendService,
  SendError,
  normalizeIdempotencyKey,
  normalizeText
};
