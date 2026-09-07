const crypto = require("node:crypto");

class MessagingRepository {
  constructor(pool) {
    if (!pool) throw new TypeError("pool is required");
    this.pool = pool;
  }

  allowed(workspaceIds) {
    return workspaceIds?.length ? workspaceIds.map(String) : ["__no_authorized_workspace__"];
  }

  async resolveConversationDispatch({ workspaceIds, conversationId }) {
    const result = await this.pool.query(
      `SELECT c.id AS conversation_id,c.workspace_id,c.whatsapp_number_id,
        ct.phone_e164,wn.automation_enabled,wn.external_session_id,
        pc.id AS provider_connection_id,pc.provider,pc.status AS provider_status
       FROM conversations c
       JOIN contacts ct ON ct.id=c.contact_id AND ct.workspace_id=c.workspace_id
       JOIN whatsapp_numbers wn ON wn.id=c.whatsapp_number_id AND wn.workspace_id=c.workspace_id
       JOIN provider_connections pc ON pc.id=wn.provider_connection_id AND pc.workspace_id=c.workspace_id
       WHERE c.id=$1 AND c.workspace_id=ANY($2::text[])`,
      [conversationId, this.allowed(workspaceIds)]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      conversationId: row.conversation_id,
      workspaceId: row.workspace_id,
      numberId: row.whatsapp_number_id,
      contactPhone: row.phone_e164,
      automationEnabled: row.automation_enabled,
      externalSessionId: row.external_session_id,
      providerConnectionId: row.provider_connection_id,
      provider: row.provider,
      providerStatus: row.provider_status
    };
  }

  async reserveOutbound({ dispatch, idempotencyKey }) {
    const id = crypto.randomUUID();
    const inserted = await this.pool.query(
      `INSERT INTO message_send_attempts
        (id,workspace_id,conversation_id,whatsapp_number_id,provider_connection_id,client_idempotency_key,status)
       VALUES ($1,$2,$3,$4,$5,$6,'reserved')
       ON CONFLICT (workspace_id,client_idempotency_key) DO NOTHING
       RETURNING *`,
      [id, dispatch.workspaceId, dispatch.conversationId, dispatch.numberId, dispatch.providerConnectionId, idempotencyKey]
    );
    if (inserted.rowCount) return { created: true, attempt: inserted.rows[0] };

    const existing = await this.pool.query(
      `SELECT a.*,m.external_message_id,m.status AS message_status
       FROM message_send_attempts a
       LEFT JOIN messages m ON m.id=a.message_id AND m.workspace_id=a.workspace_id
       WHERE a.workspace_id=$1 AND a.client_idempotency_key=$2`,
      [dispatch.workspaceId, idempotencyKey]
    );
    return { created: false, attempt: existing.rows[0] };
  }

  async recordOutbound({ attemptId, dispatch, body, type, origin, externalMessageId, idempotencyKey, rawProviderStatus }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const id = crypto.randomUUID();
      const inserted = await client.query(
        `INSERT INTO messages
          (id,workspace_id,conversation_id,provider_connection_id,external_message_id,client_idempotency_key,direction,origin,type,body,status,occurred_at,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'outbound',$7,$8,$9,'accepted',now(),$10)
         RETURNING *`,
        [id, dispatch.workspaceId, dispatch.conversationId, dispatch.providerConnectionId, externalMessageId, idempotencyKey, origin, type, body, { rawProviderStatus }]
      );
      await client.query(
        "UPDATE conversations SET last_message_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2",
        [dispatch.conversationId, dispatch.workspaceId]
      );
      await client.query(
        `UPDATE message_send_attempts
         SET status='accepted',message_id=$1,external_message_id=$2,raw_provider_status=$3,updated_at=now()
         WHERE id=$4 AND workspace_id=$5`,
        [inserted.rows[0].id, externalMessageId, rawProviderStatus, attemptId, dispatch.workspaceId]
      );
      await client.query("COMMIT");
      return inserted.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async failOutbound({ attemptId, workspaceId, error }) {
    await this.pool.query(
      `UPDATE message_send_attempts
       SET status='failed',last_error=$1,updated_at=now()
       WHERE id=$2 AND workspace_id=$3`,
      [String(error?.message || error || "Provider send failed").slice(0, 2000), attemptId, workspaceId]
    );
  }
}

module.exports = { MessagingRepository };
