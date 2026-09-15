const crypto = require('node:crypto');

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(value || '').length % 4)) % 4);
  return Buffer.from(normalized, 'base64');
}
function parseSignedRequest(signedRequest, appSecret) {
  if (typeof signedRequest !== 'string' || signedRequest.length < 20 || signedRequest.length > 16384 || typeof appSecret !== 'string' || appSecret.length < 20) throw new Error('Invalid signed request');
  const parts = signedRequest.split('.');
  if (parts.length !== 2) throw new Error('Invalid signed request');
  const signature = base64UrlDecode(parts[0]);
  const expected = crypto.createHmac('sha256', appSecret).update(parts[1], 'utf8').digest();
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) throw new Error('Invalid signed request');
  let payload;
  try { payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8')); } catch { throw new Error('Invalid signed request'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid signed request');
  if (payload.algorithm && !['HMAC-SHA256', 'HS256'].includes(String(payload.algorithm))) throw new Error('Invalid signed request');
  return payload;
}
function validMetaUserId(value) { return typeof value === 'string' && /^\d{1,128}$/.test(value); }
function signedRequestFrom(req) { return req.body?.signed_request || req.query?.signed_request || ''; }
function createMetaLifecycleRouter({ pool, appSecret, publicOrigin, enabled = true } = {}) {
  const express = require('express');
  const router = express.Router();
  router.use(express.urlencoded({ extended: false, limit: '16kb' }));
  router.use(express.json({ limit: '16kb', strict: true }));
  async function verified(req, res) {
    if (enabled !== true || typeof pool?.connect !== 'function' || typeof pool?.query !== 'function' || !/^https:\/\//.test(String(publicOrigin || '')) || typeof appSecret !== 'string' || appSecret.length < 20) { res.status(503).json({ error: 'Meta lifecycle is not configured' }); return null; }
    try {
      const payload = parseSignedRequest(signedRequestFrom(req), appSecret);
      if (!validMetaUserId(String(payload.user_id || ''))) throw new Error('Invalid signed request');
      return payload;
    } catch { res.status(400).json({ error: 'Invalid signed request' }); return null; }
  }
  async function revoke(metaUserId, action) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const affected = await client.query(`SELECT p.id,p.workspace_id FROM provider_connections p JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id WHERE p.provider='whatsapp_cloud' AND a.meta_user_id=$1 FOR UPDATE`, [metaUserId]);
      const ids = affected.rows.map(row => row.id);
      if (ids.length) {
        await client.query(`UPDATE provider_connections SET status='offline',encrypted_credentials=NULL,encryption_key_id=NULL,updated_at=clock_timestamp() WHERE id=ANY($1::text[])`, [ids]);
        await client.query(`UPDATE meta_connection_assets SET token_status='revoked',disconnected_at=COALESCE(disconnected_at,clock_timestamp()),updated_at=clock_timestamp() WHERE provider_connection_id=ANY($1::text[])`, [ids]);
        await client.query(`UPDATE whatsapp_numbers SET automation_enabled=false WHERE provider_connection_id=ANY($1::text[])`, [ids]);
      }
      await client.query(`INSERT INTO audit_logs(id,user_id,action,details) VALUES($1,NULL,$2,$3)`, [crypto.randomUUID(), action, { connectionCount: ids.length }]);
      await client.query('COMMIT');
      return ids.length;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function recordDeletion(metaUserId, confirmationCode) {
    await pool.query(`INSERT INTO meta_lifecycle_requests(id,kind,meta_user_id,confirmation_code,status) VALUES($1,'data_deletion',$2,$3,'received')`, [crypto.randomUUID(), metaUserId, confirmationCode]);
  }
  router.post('/deauthorize', async (req, res) => {
    const payload = await verified(req, res); if (!payload) return;
    try { await revoke(String(payload.user_id), 'meta.connection.deauthorized'); res.json({ success: true }); }
    catch { res.status(503).json({ error: 'Meta deauthorization could not be processed' }); }
  });
  router.post('/data-deletion', async (req, res) => {
    const payload = await verified(req, res); if (!payload) return;
    const confirmationCode = crypto.randomBytes(12).toString('hex');
    try {
      await revoke(String(payload.user_id), 'meta.data_deletion.revoke');
      await recordDeletion(String(payload.user_id), confirmationCode);
      const url = `${String(publicOrigin).replace(/\/$/, '')}/data-deletion.html?request=${encodeURIComponent(confirmationCode)}`;
      res.json({ url, confirmation_code: confirmationCode });
    } catch { res.status(503).json({ error: 'Data deletion request could not be processed' }); }
  });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}
module.exports = { base64UrlDecode, parseSignedRequest, validMetaUserId, signedRequestFrom, createMetaLifecycleRouter };
