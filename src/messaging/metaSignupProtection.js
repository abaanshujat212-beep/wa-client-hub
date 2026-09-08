const crypto = require('node:crypto');
const ACTION_LIMITS = Object.freeze({ start: 5, complete: 10 });
class MetaSignupProtection {
  constructor(pool, { windowMs = 600000, limits = ACTION_LIMITS } = {}) {
    if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required');
    if (!Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 3600000 ||
        !['start', 'complete'].every(action => Number.isInteger(limits[action]) && limits[action] > 0 && limits[action] <= 1000)) throw new TypeError('Invalid signup rate policy');
    this.pool = pool; this.windowMs = windowMs; this.limits = { ...limits };
  }
  async consume(actorId, action) {
    if (typeof actorId !== 'string' || !actorId || actorId.length > 256 || !Object.hasOwn(ACTION_LIMITS, action)) throw new TypeError('Invalid rate subject');
    const key = crypto.createHash('sha256').update(JSON.stringify(['meta-signup', action, actorId])).digest('hex');
    const limit = this.limits[action];
    // Shared per actor/action, independent of session, process, workspace and IP.
    // Blocked requests never extend the fixed window. Failures propagate closed.
    const result = await this.pool.query(
      `INSERT INTO meta_signup_rate_limits AS bucket (bucket_key,hits,expires_at)
       VALUES ($1,1,clock_timestamp()+($2::integer*interval '1 millisecond'))
       ON CONFLICT (bucket_key) DO UPDATE SET
         hits=CASE WHEN bucket.expires_at<=clock_timestamp() THEN 1 ELSE LEAST(bucket.hits+1,$3::integer+1) END,
         expires_at=CASE WHEN bucket.expires_at<=clock_timestamp() THEN EXCLUDED.expires_at ELSE bucket.expires_at END
       RETURNING hits, GREATEST(1,CEIL(EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))))::integer AS retry_after`,
      [key, this.windowMs, limit],
    );
    return { allowed: result.rows[0].hits <= limit, retryAfter: result.rows[0].retry_after };
  }
  async cleanup(batchSize = 500) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new TypeError('Invalid cleanup batch size');
    const states = await this.pool.query(
      `WITH expired AS (SELECT state_hash FROM meta_signup_states WHERE expires_at<=clock_timestamp()
       ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       DELETE FROM meta_signup_states s USING expired e WHERE s.state_hash=e.state_hash AND s.expires_at<=clock_timestamp()`, [batchSize],
    );
    const buckets = await this.pool.query(
      `WITH expired AS (SELECT bucket_key FROM meta_signup_rate_limits WHERE expires_at<=clock_timestamp()
       ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       DELETE FROM meta_signup_rate_limits r USING expired e WHERE r.bucket_key=e.bucket_key AND r.expires_at<=clock_timestamp()`, [batchSize],
    );
    return { states: states.rowCount, buckets: buckets.rowCount };
  }
}
module.exports = { MetaSignupProtection, ACTION_LIMITS };
