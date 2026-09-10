const OFFICIAL_PROVIDERS = new Set(['whatsapp_cloud', 'ycloud']);

class MessagePolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MessagePolicyError';
    this.code = code;
    this.status = 409;
  }
}

function assertOfficialTextPolicy(provider, policy) {
  if (!OFFICIAL_PROVIDERS.has(provider)) return;
  if (!policy) throw new MessagePolicyError('MESSAGE_POLICY_UNAVAILABLE', 'Official messaging policy is unavailable');
  if (policy.suppressed) throw new MessagePolicyError('CONTACT_SUPPRESSED', 'The contact is suppressed');
  if (!policy.consented) throw new MessagePolicyError('CONSENT_REQUIRED', 'Valid WhatsApp consent is required');
  if (!policy.sessionOpen) throw new MessagePolicyError('SESSION_TEMPLATE_REQUIRED', 'An approved template is required outside the customer-service window');
}

class MessagePolicyRepository {
  constructor(pool, { sessionHours = 24 } = {}) {
    if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required');
    this.pool = pool;
    this.sessionHours = Math.min(24, Math.max(1, Number(sessionHours) || 24));
  }

  async evaluateText({ dispatch }) {
    const result = await this.pool.query(`
      SELECT
        COALESCE((
          SELECT cr.status = 'granted'
            AND (cr.expires_at IS NULL OR cr.expires_at > clock_timestamp())
          FROM consent_records cr
          JOIN conversations cx
            ON cx.contact_id = cr.contact_id
           AND cx.workspace_id = cr.workspace_id
          WHERE cx.id = $1
            AND cr.workspace_id = $2
            AND cr.channel = 'whatsapp'
          ORDER BY cr.captured_at DESC, cr.created_at DESC, cr.id DESC
          LIMIT 1
        ), false) AS consented,
        EXISTS(
          SELECT 1
          FROM suppressions s
          JOIN conversations cx ON cx.id = $1 AND cx.workspace_id = $2
          JOIN contacts ct ON ct.id = cx.contact_id AND ct.workspace_id = cx.workspace_id
          WHERE s.phone_e164 = ct.phone_e164
            AND (s.scope = 'global' OR (s.scope = 'workspace' AND s.workspace_id = $2))
        ) AS suppressed,
        EXISTS(
          SELECT 1
          FROM messages m
          WHERE m.workspace_id = $2
            AND m.conversation_id = $1
            AND m.direction = 'inbound'
            AND m.occurred_at >= clock_timestamp() - ($3::text || ' hours')::interval
        ) AS session_open
    `, [dispatch.conversationId, dispatch.workspaceId, this.sessionHours]);
    const row = result.rows[0];
    return row ? {
      consented: Boolean(row.consented),
      suppressed: Boolean(row.suppressed),
      sessionOpen: Boolean(row.session_open)
    } : null;
  }
}

module.exports = { OFFICIAL_PROVIDERS, MessagePolicyError, MessagePolicyRepository, assertOfficialTextPolicy };
