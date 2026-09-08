const { isDeepStrictEqual } = require('node:util');
const { assertNumberCreation } = require('./numberCreationPolicy');

// Only legacy-owned columns may be written. Provider mappings and canonical data
// are deliberately absent: a legacy number edit cannot reset those columns.
const TABLES = [
  ['plans', 'plans', 'id name workspaceLimit:workspace_limit numberLimit:number_limit userLimit:user_limit custom'],
  ['users', 'users', 'id name email passwordHash:password_hash role active createdAt:created_at'],
  ['workspaces', 'workspaces', 'id ownerId:owner_id name planId:plan_id status billingProvider:billing_provider billingStatus:billing_status billingCustomerId:billing_customer_id billingSubscriptionId:billing_subscription_id billingPlanId:billing_plan_id currentPeriodEnd:current_period_end migratedDefault:migrated_default createdAt:created_at'],
  ['workspaceMembers', 'workspace_members', 'id workspaceId:workspace_id userId:user_id role createdAt:created_at'],
  ['accounts', 'whatsapp_numbers', 'id ownerId:owner_id workspaceId:workspace_id label phone createdAt:created_at lastLaunchedAt:last_launched_at'],
  ['invites', 'invites', 'id workspaceId:workspace_id email name role tokenHash:token_hash status createdBy:created_by createdAt:created_at expiresAt:expires_at acceptedAt:accepted_at'],
  ['audit', 'audit_logs', 'id userId:user_id action details createdAt:created_at'],
].map(([key, table, fields]) => ({ key, table, fields: fields.split(' ').map(field => { const [property, column = property] = field.split(':'); return [property, column]; }) }));

function rowValues(row, spec) {
  return Object.fromEntries(spec.fields.map(([property, column]) => {
    let value = row[property];
    if (property === 'custom' || property === 'migratedDefault') value = Boolean(value);
    if (property === 'active') value = value !== false;
    if (property === 'details') value = value || {};
    if (spec.key === 'workspaces') {
      if (property === 'status') value = value || 'active';
      if (property === 'billingProvider' || property === 'billingStatus') value = value || 'manual';
    }
    return [column, value === undefined ? null : value];
  }));
}
function indexRows(rows = []) {
  const index = new Map();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id || index.has(row.id)) throw new TypeError('Legacy rows require unique IDs');
    index.set(row.id, row);
  }
  return index;
}
function conflict() {
  const error = new Error('Record changed concurrently; refresh before retrying');
  error.code = 'LEGACY_WRITE_CONFLICT';
  return error;
}

async function applyLegacyDelta(pool, before, after) {
  const changes = TABLES.map(spec => ({ spec, old: indexRows(before[spec.key]), next: indexRows(after[spec.key]) }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializes legacy writers/imports. Direct-SQL providers need not take this
    // lock: unknown rows are never deleted and unchanged columns are never written.
    await client.query('SELECT pg_advisory_xact_lock($1)', [90421032]);
    for (const { spec, old, next } of changes) {
      for (const [id, row] of next) {
        const current = rowValues(row, spec);
        if (!old.has(id)) {
          if (spec.key === 'accounts') await assertNumberCreation(client, row.workspaceId, { phone: row.phone });
          const columns = Object.keys(current);
          await client.query(`INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(current));
          continue;
        }
        // Audit history is append-only; the JSON store's 500-item display cap
        // must not become a PostgreSQL deletion/retention policy.
        if (spec.key === 'audit') continue;
        const original = rowValues(old.get(id), spec);
        const columns = Object.keys(current).filter(column => column !== 'id' && !isDeepStrictEqual(current[column], original[column]));
        if (!columns.length) continue;
        const values = columns.map(column => current[column]);
        const guards = [...new Set(['id', 'workspace_id', 'owner_id', ...columns])].filter(column => column in original);
        const where = guards.map(column => { values.push(original[column]); return `${column} IS NOT DISTINCT FROM $${values.length}`; });
        const result = await client.query(`UPDATE ${spec.table} SET ${columns.map((column, i) => `${column}=$${i + 1}`).join(',')} WHERE ${where.join(' AND ')}`, values);
        if (result.rowCount !== 1) throw conflict();
      }
    }
    // Delete only IDs explicitly removed by this mutation, children first.
    // Absence from an old process snapshot NEVER authorizes a database deletion.
    for (const { spec, old, next } of [...changes].reverse()) {
      if (spec.key === 'audit') continue;
      for (const [id, row] of old) {
        if (next.has(id)) continue;
        const original = rowValues(row, spec);
        const guards = ['id', 'workspace_id', 'owner_id'].filter(column => column in original);
        const result = await client.query(`DELETE FROM ${spec.table} WHERE ${guards.map((column, i) => `${column} IS NOT DISTINCT FROM $${i + 1}`).join(' AND ')}`, guards.map(column => original[column]));
        if (result.rowCount !== 1) throw conflict();
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { applyLegacyDelta };
