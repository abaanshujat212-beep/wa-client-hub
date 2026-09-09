const crypto = require("node:crypto");
function digest(value, purpose) {
  return crypto.createHash("sha256").update(`${purpose}:${value}`).digest("hex");
}
function validState(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
function validIdentity(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
class MetaSignupStateRepository {
  constructor(pool) {
    if (typeof pool?.query !== "function") throw new TypeError("pool.query is required");
    this.pool = pool;
  }
  async create({ state, sessionId, actorId, workspaceId, label, ttlMs = 600000 }) {
    if (!validState(state) || ![sessionId, actorId, workspaceId].every(validIdentity) ||
        typeof label !== "string" || label.length < 2 || label.length > 200 ||
        !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 600000) {
      throw new TypeError("Invalid Meta signup state input");
    }
    const result = await this.pool.query(
      `INSERT INTO meta_signup_states (state_hash, session_hash, actor_id, workspace_id, label, expires_at)
       VALUES ($1,$2,$3,$4,$5,clock_timestamp() + ($6::integer * interval '1 millisecond'))
       RETURNING expires_at`,
      [digest(state, "meta-state"), digest(sessionId, "meta-session"), actorId, workspaceId, label, ttlMs],
    );
    return { expiresAt: new Date(result.rows[0].expires_at).toISOString() };
  }
  async cancel({ state, sessionId, actorId }) {
    if (!validState(state) || !validIdentity(sessionId) || !validIdentity(actorId)) return false;
    const result = await this.pool.query(
      `DELETE FROM meta_signup_states
       WHERE state_hash=$1 AND session_hash=$2 AND actor_id=$3`,
      [digest(state, "meta-state"), digest(sessionId, "meta-session"), actorId],
    );
    return result.rowCount === 1;
  }
  async consume({ state, sessionId, actorId }) {
    if (!validState(state) || !validIdentity(sessionId) || !validIdentity(actorId)) return null;
    // Autocommit DELETE is the claim. Never roll it back with provider/install work.
    const result = await this.pool.query(
      `DELETE FROM meta_signup_states
       WHERE state_hash=$1 AND session_hash=$2 AND actor_id=$3
         AND expires_at > clock_timestamp()
       RETURNING workspace_id, label`,
      [digest(state, "meta-state"), digest(sessionId, "meta-session"), actorId],
    );
    const row = result.rows[0];
    return row ? { workspaceId: row.workspace_id, label: row.label } : null;
  }
}
module.exports = { MetaSignupStateRepository, validState };
