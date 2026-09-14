const express = require('express');
const { verifyGhl, GHL_ED25519_PUBLIC_KEY } = require('./signatures');

function enabled(env = process.env) { return env.GHL_CALLING_ENABLED === 'true'; }

function normalizeCallEvent(body = {}) {
  const locationId = String(body.locationId || body.location_id || '').trim();
  const installationId = String(body.installationId || body.installation_id || body.appId || '').trim();
  const callId = String(body.callId || body.call_id || body.id || '').trim();
  const eventId = String(body.eventId || body.event_id || body.webhookId || callId).trim();
  const direction = String(body.direction || 'incoming').toLowerCase();
  const state = String(body.status || body.state || body.event || 'unknown').toLowerCase();
  if (!locationId || !installationId || !callId || !eventId) throw new Error('GHL call event requires installationId, locationId, callId, and eventId');
  if (!['incoming', 'outgoing'].includes(direction)) throw new Error('GHL call direction is invalid');
  return {
    locationId,
    installationId,
    callId,
    eventId,
    direction,
    state: ['started', 'answered', 'missed', 'ended'].includes(state) ? state : 'unknown',
    mediaKind: String(body.mediaKind || body.media_kind || 'voice').toLowerCase() === 'video' ? 'video' : 'voice',
    phone: String(body.phone || body.from || body.to || '').replace(/\D/g, '').slice(0, 32) || null,
    durationSeconds: Number.isFinite(Number(body.duration || body.durationSeconds)) ? Number(body.duration || body.durationSeconds) : null,
    recordingUrl: body.recordingUrl || body.recording_url || null,
    raw: body,
  };
}

function createGhlCallRouter({ enabled: isEnabled = false, pool, publicKey = GHL_ED25519_PUBLIC_KEY } = {}) {
  const router = express.Router();
  if (!isEnabled) {
    router.use((_req, res) => res.status(404).json({ error: 'GHL Calling is not enabled' }));
    return router;
  }
  if (typeof pool?.query !== 'function') throw new TypeError('GHL Calling requires a PostgreSQL pool');
  router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!verifyGhl(raw, req.get('x-ghl-signature'), publicKey)) return res.status(401).json({ error: 'Invalid provider signature' });
      const payload = JSON.parse(raw.toString('utf8'));
      const call = normalizeCallEvent(payload);
      const mapping = await pool.query(`SELECT m.whatsapp_number_id,m.provider_connection_id,m.workspace_id,i.id AS installation_row_id,i.installation_id,i.location_id
        FROM ghl_number_mappings m JOIN ghl_installations i ON i.id=m.installation_id AND i.status='active'
        WHERE i.installation_id=$1 AND i.location_id=$2`, [call.installationId, call.locationId]);
      if (mapping.rowCount !== 1) return res.status(409).json({ error: 'Exact GHL location mapping is required', code: 'GHL_CALL_MAPPING_REQUIRED' });
      const row = mapping.rows[0];
      const inserted = await pool.query(`INSERT INTO call_events(id,workspace_id,whatsapp_number_id,provider_connection_id,external_call_id,external_event_id,direction,state,media_kind,occurred_at,details)
        VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9) ON CONFLICT DO NOTHING RETURNING id`,
      [row.workspace_id, row.whatsapp_number_id, row.provider_connection_id, call.callId, call.eventId, call.direction, call.state, call.mediaKind, { source: 'ghl', locationId: call.locationId, phone: call.phone, durationSeconds: call.durationSeconds, recordingUrl: call.recordingUrl, raw: call.raw }]);
      return res.status(inserted.rowCount ? 202 : 200).json({ accepted: true, duplicate: !inserted.rowCount, callId: call.callId });
    } catch (error) {
      return res.status(400).json({ error: error.message === 'GHL call event requires installationId, locationId, callId, and eventId' ? error.message : 'Invalid GHL call event' });
    }
  });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { enabled, normalizeCallEvent, createGhlCallRouter };
