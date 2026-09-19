const crypto = require('node:crypto');
const express = require('express');
const { verifyGhl } = require('./signatures');
const { config } = require('./ghlPrivatePilot');

function marketplaceError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function normalizeMarketplaceInstallEvent(payload = {}) {
  const type = String(payload.type || '').trim().toUpperCase();
  const appId = String(payload.appId || '').trim();
  const companyId = String(payload.companyId || '').trim();
  const locationId = String(payload.locationId || '').trim();
  const userId = String(payload.userId || '').trim();
  const webhookId = String(payload.webhookId || '').trim();
  if (type !== 'INSTALL' || !appId || !companyId || !locationId || !userId || !webhookId) {
    throw marketplaceError('GHL_MARKETPLACE_INSTALL_INVALID', 'A signed HighLevel location install event with app, company, location, user, and webhook IDs is required', 400);
  }
  const parsedTimestamp = payload.timestamp ? new Date(payload.timestamp) : null;
  return {
    type,
    appId,
    versionId: String(payload.versionId || '').trim() || null,
    installType: String(payload.installType || '').trim() || null,
    companyId,
    locationId,
    userId,
    webhookId,
    eventTimestamp: parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : null,
  };
}

class GhlMarketplaceInstallService {
  constructor({ pool, env = process.env, now = () => new Date() } = {}) {
    if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('HighLevel Marketplace install correlation requires PostgreSQL');
    this.pool = pool;
    this.env = env;
    this.now = now;
  }

  async record(payload) {
    const event = normalizeMarketplaceInstallEvent(payload);
    const configuredAppId = String(this.env.GHL_APP_ID || '').trim();
    if (configuredAppId && configuredAppId !== event.appId) throw marketplaceError('GHL_MARKETPLACE_APP_MISMATCH', 'HighLevel install event belongs to a different Marketplace app', 403);
    await this.pool.query(`INSERT INTO ghl_marketplace_install_events
      (id,webhook_id,app_id,version_id,install_type,event_type,company_id,location_id,user_id,event_timestamp)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(webhook_id) DO NOTHING`, [
      crypto.randomUUID(), event.webhookId, event.appId, event.versionId, event.installType, event.type,
      event.companyId, event.locationId, event.userId, event.eventTimestamp,
    ]);
    return event;
  }

  async claim(identity, { waitMs = 5000, pollMs = 250, maxAgeMs = 15 * 60 * 1000 } = {}) {
    const configuredAppId = String(this.env.GHL_APP_ID || '').trim();
    if (!configuredAppId) throw marketplaceError('GHL_MARKETPLACE_APP_ID_REQUIRED', 'GHL_APP_ID must be configured before accepting a first Marketplace install', 503);
    const companyId = String(identity?.companyId || '').trim();
    const locationId = String(identity?.locationId || '').trim();
    const userId = String(identity?.ghlUserId || '').trim();
    if (!companyId || !locationId || !userId) return null;
    const deadline = Date.now() + Math.max(0, waitMs);
    do {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`SELECT * FROM ghl_marketplace_install_events
          WHERE app_id=$1 AND company_id=$2 AND location_id=$3 AND user_id=$4
            AND consumed_at IS NULL AND received_at >= $5
          ORDER BY received_at DESC LIMIT 1 FOR UPDATE SKIP LOCKED`, [
          configuredAppId, companyId, locationId, userId, new Date(this.now().getTime() - maxAgeMs),
        ]);
        const row = result.rows[0];
        if (row) {
          await client.query('UPDATE ghl_marketplace_install_events SET consumed_at=now() WHERE id=$1', [row.id]);
          await client.query('COMMIT');
          return row;
        }
        await client.query('ROLLBACK');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
    } while (true);
    return null;
  }
}

function createGhlMarketplaceInstallRouter({ service, env = process.env, onInstall } = {}) {
  if (!service) throw new TypeError('HighLevel Marketplace install router requires a correlation service');
  const router = express.Router();
  router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const publicKey = config(env).publicKey;
    if (!verifyGhl(raw, req.get('x-ghl-signature'), publicKey)) return res.status(401).json({ error: 'Invalid provider signature' });
    try {
      const payload = JSON.parse(raw.toString('utf8'));
      const event = await service.record(payload);
      if (onInstall) await onInstall(event);
      return res.status(202).json({ accepted: true, event: event.type, webhookId: event.webhookId });
    } catch (error) {
      return res.status(error.status || 503).json({ error: error.message, code: error.code || 'GHL_MARKETPLACE_INSTALL_FAILED' });
    }
  });
  return router;
}

module.exports = { GhlMarketplaceInstallService, normalizeMarketplaceInstallEvent, createGhlMarketplaceInstallRouter };
