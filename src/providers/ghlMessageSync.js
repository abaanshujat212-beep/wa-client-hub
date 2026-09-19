const { GhlMediaArchive } = require('./ghlMediaArchive');
const crypto = require('node:crypto');
const express = require('express');
const { MetaGraphClient } = require('../messaging/metaGraphClient');
const { MetaMediaService } = require('../messaging/metaMediaService');
const error = (code, uncertain = false) => Object.assign(new Error(code), { code, uncertain });

function importBody(message, mapping, contactId, attachments = []) {
  let body = message.body || '';
  const meta = message.metadata?.meta || {};
  if (!body && message.type === 'location' && meta.location) body = [meta.location.name, meta.location.address, `${meta.location.latitude}, ${meta.location.longitude}`].filter(Boolean).join('\n');
  if (!body && message.type === 'contact' && meta.contacts) body = JSON.stringify(meta.contacts);
  if (!body && message.type === 'reaction' && meta.reaction) body = `${meta.reaction.emoji || 'Reaction removed'} (reply to ${meta.reaction.message_id || ''})`;
  if (!body && !attachments.length) throw error('GHL_MESSAGE_CONTENT_UNAVAILABLE');
  return { type: 'SMS', contactId, conversationProviderId: mapping.conversation_provider_id, message: body,
    direction: message.direction, date: new Date(message.occurred_at).toISOString(),
    altId: `wa:${mapping.id}:${message.id}`, ...(attachments.length ? { attachments } : {}) };
}

class GhlMessageSync {
  constructor({ pool, runtime, env = process.env, fetchImpl = fetch, logger = console }) {
    Object.assign(this, { pool, runtime, env, fetchImpl, logger });
    this.running = false; this.timer = null; this.archive = new GhlMediaArchive(this);
  }
  async request(path, accessToken, body, importing = false) {
    let response;
    try {
      response = await this.fetchImpl(`${this.runtime.client.config.apiUrl}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, Version: '2023-02-21', Accept: 'application/json', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
        body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
    } catch { throw error('GHL_SYNC_NETWORK_ERROR', importing); }
    if (!response.ok) throw error(`GHL_SYNC_HTTP_${response.status}`, importing && response.status >= 500);
    try { return await response.json(); } catch { throw error('GHL_SYNC_RESPONSE_INVALID', importing); }
  }
  async contact(db, mapping, message, token) {
    const existing = (await db.query('SELECT * FROM ghl_conversation_links WHERE mapping_id=$1 AND conversation_id=$2', [mapping.id, message.conversation_id])).rows[0];
    if (existing?.ghl_contact_id) return existing.ghl_contact_id;
    if (!/^\+[1-9]\d{7,14}$/.test(message.phone_e164)) throw error('GHL_CONTACT_PHONE_INVALID');
    // Phone-only upsert avoids overwriting existing names, tags, ownership or DND.
    const result = await this.request('/contacts/upsert', token, { locationId: mapping.location_id, phone: message.phone_e164 });
    const contact = result.contact;
    if (!contact?.id || contact.locationId !== mapping.location_id) throw error('GHL_CONTACT_LOCATION_MISMATCH');
    await db.query(`INSERT INTO ghl_conversation_links(id,mapping_id,installation_id,location_id,workspace_id,ghl_conversation_id,ghl_contact_id,conversation_id,whatsapp_number_id,provider_connection_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,conversation_id) DO NOTHING`,
    [crypto.randomUUID(), mapping.id, mapping.installation_row_id, mapping.location_id, mapping.workspace_id, `contact:${contact.id}`, contact.id, message.conversation_id, mapping.whatsapp_number_id, mapping.provider_connection_id]);
    return contact.id;
  }
  async attachments(db, mapping, message, contactId, token) {
    const rows = (await db.query('SELECT * FROM message_attachments WHERE message_id=$1 AND workspace_id=$2', [message.id, mapping.workspace_id])).rows;
    const media = message.metadata?.meta?.[message.type];
    if (!rows.length && media?.id && ['image','audio','video','document','sticker'].includes(message.type)) rows.push({ provider_media_id: media.id, file_name: media.filename });
    if (!rows.length && ['image','audio','video','document'].includes(message.type)) throw error('GHL_MEDIA_UNAVAILABLE');
    const urls = [];
    for (const attachment of rows) {
      if (!attachment.provider_media_id) throw error('GHL_MEDIA_SOURCE_UNSUPPORTED');
      const provider = (await db.query("SELECT * FROM provider_connections WHERE id=$1 AND workspace_id=$2 AND provider='whatsapp_cloud'", [mapping.provider_connection_id, mapping.workspace_id])).rows[0];
      if (!provider) throw error('GHL_MEDIA_SOURCE_UNSUPPORTED');
      const credentials = this.runtime.repository.vault.decrypt(provider.encrypted_credentials, provider.id, provider.encryption_key_id);
      const service = new MetaMediaService({ graphClient: new MetaGraphClient({ graphVersion: this.env.META_GRAPH_VERSION, fetchImpl: this.fetchImpl }), fetchImpl: this.fetchImpl });
      const file = await service.download({ accessToken: credentials.accessToken, mediaId: attachment.provider_media_id });
      urls.push(await this.archive.upload(db, mapping, token, `${mapping.provider_connection_id}:${attachment.provider_media_id}`, file, attachment.file_name || `attachment.${file.contentType.split('/')[1]}`));
    }
    return urls;
  }
  async sync(messageId, mappingId) {
    const db = await this.pool.connect(); let lock = false; let started = false;
    try {
      // Serialize contact creation and message import across processes for this mapped conversation.
      const message = (await db.query(`SELECT m.*,c.whatsapp_number_id,ct.phone_e164 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id JOIN contacts ct ON ct.id=c.contact_id AND ct.workspace_id=c.workspace_id WHERE m.id=$1`, [messageId])).rows[0];
      if (!message) return;
      const key = `${mappingId}:${message.conversation_id}`;
      lock = (await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [key])).rows[0].locked;
      if (!lock) return;
      db.syncKey = key;
      const mapping = (await db.query(`SELECT m.*,i.id AS installation_row_id,i.installation_id,i.scopes FROM ghl_number_mappings m JOIN ghl_installations i ON i.id=m.installation_id AND i.workspace_id=m.workspace_id AND i.location_id=m.location_id AND i.status='active' JOIN whatsapp_numbers n ON n.id=m.whatsapp_number_id AND n.workspace_id=m.workspace_id AND n.provider_connection_id=m.provider_connection_id WHERE m.id=$1 AND m.workspace_id=$2 AND m.whatsapp_number_id=$3`, [mappingId, message.workspace_id, message.whatsapp_number_id])).rows[0];
      if (!mapping?.conversation_provider_id) return;
      const prior = (await db.query('SELECT * FROM ghl_message_sync WHERE mapping_id=$1 AND message_id=$2', [mappingId, messageId])).rows[0];
      if (prior && ['synced','existing','blocked','uncertain'].includes(prior.state)) return;
      if (prior?.state === 'importing') { await db.query("UPDATE ghl_message_sync SET state='uncertain',error_code='GHL_SYNC_INTERRUPTED' WHERE mapping_id=$1 AND message_id=$2", [mappingId,messageId]); return; }
      await db.query(`INSERT INTO ghl_message_sync(mapping_id,message_id,state,attempts) VALUES($1,$2,'preparing',1) ON CONFLICT(mapping_id,message_id) DO UPDATE SET state='preparing',attempts=ghl_message_sync.attempts+1,updated_at=now()`, [mappingId,messageId]); started = true;
      const recorded = (await db.query("SELECT 1 FROM ghl_message_correlations WHERE mapping_id=$1 AND canonical_message_id=$2 AND status IN ('sent','delivered','read')", [mappingId,messageId])).rowCount;
      if (message.origin === 'crm' || recorded) { await db.query("UPDATE ghl_message_sync SET state='existing',updated_at=now() WHERE mapping_id=$1 AND message_id=$2", [mappingId,messageId]); return; }
      if (!['contacts.write','conversations/message.write'].every(scope => mapping.scopes.includes(scope))) throw error('GHL_SYNC_SCOPES_MISSING');
      const access = await this.runtime.repository.getAccessToken({ installationId: mapping.installation_id, locationId: mapping.location_id, refresh: value => this.runtime.client.refreshToken(value) });
      const contactId = await this.contact(db, mapping, message, access.accessToken);
      const attachments = await this.attachments(db, mapping, message, contactId, access.accessToken);
      const body = importBody(message, mapping, contactId, attachments);
      // Commit intent before HTTP. An interrupted/ambiguous request is never blindly resent.
      await db.query("UPDATE ghl_message_sync SET state='importing',updated_at=now() WHERE mapping_id=$1 AND message_id=$2", [mappingId,messageId]);
      const result = await this.request('/conversations/messages/inbound', access.accessToken, body, true);
      if (!result.messageId || !result.conversationId) throw error('GHL_SYNC_RESPONSE_INVALID', true);
      await db.query("UPDATE ghl_message_sync SET state='synced',ghl_message_id=$3,error_code=NULL,updated_at=now() WHERE mapping_id=$1 AND message_id=$2", [mappingId,messageId,result.messageId]);
      await db.query('UPDATE ghl_conversation_links SET ghl_conversation_id=$3,updated_at=now() WHERE mapping_id=$1 AND conversation_id=$2', [mappingId,message.conversation_id,result.conversationId]);
    } catch (failure) {
      if (started) {
        const retryable = /NETWORK|HTTP_429|TOKEN|REFRESH|SCOPE_MISSING/.test(failure.code || '');
        await db.query('UPDATE ghl_message_sync SET state=$3,error_code=$4,retry_at=now()+interval \'5 minutes\',updated_at=now() WHERE mapping_id=$1 AND message_id=$2 AND state<>\'synced\'', [mappingId,messageId,failure.uncertain?'uncertain':retryable?'retry':'blocked',failure.code || 'GHL_SYNC_FAILED']);
      }
      this.logger.error?.('GHL message sync needs attention', { messageId, code: failure.code || 'GHL_SYNC_FAILED' });
    } finally { try { if (lock) await db.query('SELECT pg_advisory_unlock(hashtext($1))', [db.syncKey]); } finally { db.release(); } }
  }
  async tick() {
    if (this.running) return; this.running = true;
    try {
      await this.archive.cleanup();
      const batch = await this.pool.query(`SELECT m.id,g.id AS mapping_id FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id JOIN ghl_number_mappings g ON g.whatsapp_number_id=c.whatsapp_number_id AND g.workspace_id=c.workspace_id JOIN ghl_installations i ON i.id=g.installation_id AND i.status='active' LEFT JOIN ghl_message_sync s ON s.mapping_id=g.id AND s.message_id=m.id WHERE (m.direction='inbound' OR m.status IN ('sent','delivered','read','received')) AND (s.message_id IS NULL OR (s.state IN ('retry','preparing','importing') AND s.retry_at<=now())) ORDER BY m.occurred_at,m.id LIMIT 25`);
      for (const row of batch.rows) await this.sync(row.id,row.mapping_id);
    } catch { this.logger.error?.('GHL message sync poll failed'); } finally { this.running = false; }
  }
  start() { if (!this.timer) { void this.tick(); this.timer = setInterval(()=>void this.tick(),5000); this.timer.unref?.(); } }
  stop() { clearInterval(this.timer); this.timer = null; }
}

function createSyncRouter({ service, store }) {
  const router = express.Router();
  router.get('/', async(req,res)=>{
    const user = req.session?.userId && store.findUser(req.session.userId);
    const workspaceId = String(req.query.workspaceId || '');
    if (!user?.active || !store.canManageWorkspace(user,workspaceId)) return res.status(404).json({error:'Workspace not found'});
    try {
      const counts = await service.pool.query(`SELECT COALESCE(s.state,'pending') AS state,count(*)::int AS count FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN ghl_number_mappings g ON g.workspace_id=m.workspace_id AND g.whatsapp_number_id=c.whatsapp_number_id LEFT JOIN ghl_message_sync s ON s.mapping_id=g.id AND s.message_id=m.id WHERE m.workspace_id=$1 GROUP BY 1`,[workspaceId]);
      const failures = await service.pool.query(`SELECT s.error_code,count(*)::int AS count FROM ghl_message_sync s JOIN ghl_number_mappings g ON g.id=s.mapping_id WHERE g.workspace_id=$1 AND s.state IN ('blocked','uncertain','retry') GROUP BY s.error_code`,[workspaceId]);
      res.json({states:counts.rows,errors:failures.rows});
    } catch { res.status(503).json({error:'Sync status unavailable'}); }
  });
  return router;
}
module.exports = { GhlMessageSync, createSyncRouter, importBody };
