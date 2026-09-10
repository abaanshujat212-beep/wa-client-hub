const crypto = require('node:crypto');
const { extractMetaEvents } = require('./metaWebhookNormalizer');
class MetaWebhookRepository {
  constructor(pool) { if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required'); this.pool = pool; }
  async resolveAsset(event) {
    const result = await this.pool.query(`SELECT a.workspace_id,p.id AS provider_connection_id,n.id AS number_id
      FROM meta_connection_assets a JOIN provider_connections p ON p.id=a.provider_connection_id AND p.workspace_id=a.workspace_id
      JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=p.workspace_id
      WHERE a.waba_id=$1 AND a.phone_number_id=$2 AND a.disconnected_at IS NULL
      AND p.provider='whatsapp_cloud' AND p.status IN ('active','degraded')`, [event.wabaId, event.phoneNumberId]);
    return result.rowCount === 1 ? result.rows[0] : null;
  }
  async admit(payload) {
    const summary = { accepted: 0, duplicates: 0, unknown: 0, invalid: 0 };
    const events = extractMetaEvents(payload); if (!events.length) { summary.invalid = 1; return summary; }
    for (const event of events) {
      const asset = await this.resolveAsset(event); if (!asset) { summary.unknown++; continue; }
      const receipt = { kind: event.kind, providerMessageId: event.providerMessageId, status: event.status || null, direction: event.direction || null, echo: Boolean(event.echo), numberId: asset.number_id, value: event.payload };
      const inserted = await this.pool.query(`INSERT INTO webhook_receipts(id,workspace_id,source,provider_connection_id,external_event_id,signature_valid,payload,status,attempt_count,next_attempt_at)
        VALUES($1,$2,'meta_whatsapp',$3,$4,true,$5,'received',0,clock_timestamp())
        ON CONFLICT(source,provider_connection_id,external_event_id) DO NOTHING RETURNING id`, [crypto.randomUUID(), asset.workspace_id, asset.provider_connection_id, event.externalEventId, receipt]);
      if (inserted.rowCount) summary.accepted++; else summary.duplicates++;
    }
    return summary;
  }
}
module.exports = { MetaWebhookRepository };
