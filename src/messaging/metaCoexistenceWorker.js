// Sync endpoints are one-shot operations. Persist the attempt before the call,
// and do not replay it after a timeout or process restart.
class MetaCoexistenceWorker {
  constructor({ pool, vault, graphClient, logger = console }) {
    this.pool = pool; this.vault = vault; this.graph = graphClient; this.logger = logger;
    this.running = false; this.timer = null;
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.pool.query(`UPDATE meta_coexistence_jobs SET state='uncertain',error_code='INTERRUPTED_REQUEST',updated_at=now()
        WHERE state='sending' AND updated_at<now()-interval '5 minutes'`);
      await this.pool.query(`UPDATE meta_coexistence_jobs SET state='expired',error_code='SYNC_WINDOW_EXPIRED',updated_at=now()
        WHERE state='pending' AND created_at<now()-interval '24 hours'`);
      const jobs = await this.pool.query(`WITH picked AS (
        SELECT j.provider_connection_id,j.step FROM meta_coexistence_jobs j
        JOIN provider_connections p ON p.id=j.provider_connection_id
        JOIN meta_connection_assets a ON a.provider_connection_id=p.id
        WHERE j.state='pending' AND p.status IN ('connecting','active','degraded') AND a.disconnected_at IS NULL
        AND (j.step='subscribe' OR EXISTS(SELECT 1 FROM meta_coexistence_jobs s WHERE s.provider_connection_id=j.provider_connection_id AND s.step='subscribe' AND s.state='accepted'))
        AND (j.step<>'history' OR EXISTS(SELECT 1 FROM meta_coexistence_jobs s WHERE s.provider_connection_id=j.provider_connection_id AND s.step='smb_app_state_sync' AND s.state='accepted'))
        ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 5
      ) UPDATE meta_coexistence_jobs j SET state='sending',updated_at=now()
        FROM picked WHERE j.provider_connection_id=picked.provider_connection_id AND j.step=picked.step RETURNING j.*`);
      for (const job of jobs.rows) await this.process(job);
    } catch { this.logger.error?.('Meta coexistence worker failed'); }
    finally { this.running = false; }
  }
  async process(job) {
    try {
      const row = (await this.pool.query(`SELECT p.id,p.encrypted_credentials,p.encryption_key_id,a.waba_id,a.phone_number_id
        FROM provider_connections p JOIN meta_connection_assets a ON a.provider_connection_id=p.id
        WHERE p.id=$1 AND p.status IN ('connecting','active','degraded') AND a.disconnected_at IS NULL`, [job.provider_connection_id])).rows[0];
      if (!row) throw Object.assign(new Error(), { code: 'CONNECTION_UNAVAILABLE' });
      const { accessToken } = this.vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
      const result = await this.graph.request({ accessToken, method: 'POST',
        path: job.step === 'subscribe' ? [row.waba_id, 'subscribed_apps'] : [row.phone_number_id, 'smb_app_data'],
        body: job.step === 'subscribe' ? {} : { messaging_product: 'whatsapp', sync_type: job.step } });
      if (job.step === 'subscribe' ? result?.success !== true : !result?.request_id) {
        throw Object.assign(new Error(), { code: 'META_SYNC_RESPONSE_UNCERTAIN', retryable: true });
      }
      await this.pool.query(`UPDATE meta_coexistence_jobs SET state='accepted',request_id=$3,error_code=NULL,updated_at=now()
        WHERE provider_connection_id=$1 AND step=$2`, [row.id, job.step, result.request_id || null]);
    } catch (error) {
      const uncertain = error.retryable || !error.code || error.code === 'META_TIMEOUT' || error.code === 'META_NETWORK_ERROR';
      await this.pool.query(`UPDATE meta_coexistence_jobs SET state=$3,error_code=$4,updated_at=now() WHERE provider_connection_id=$1 AND step=$2`,
        [job.provider_connection_id, job.step, uncertain ? 'uncertain' : 'failed', String(error.code || 'SYNC_REQUEST_UNCERTAIN').slice(0,120)]);
    }
  }
  start() { if (!this.timer) { void this.tick(); this.timer = setInterval(() => void this.tick(), 2000); this.timer.unref?.(); } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
module.exports = { MetaCoexistenceWorker };
