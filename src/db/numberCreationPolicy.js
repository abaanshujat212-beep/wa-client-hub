const { canAddPaidResource } = require('../billing');

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
const denied = () => policyError('WORKSPACE_NOT_FOUND', 'Workspace not found');

class NumberCreationPolicy {
  constructor(pool) { this.pool = pool; }

  // No cached role/active flag is trusted. Used before issuing state and before
  // exchange; installation checks again under locks after the external request.
  async canManageWorkspace(user, workspaceId) {
    if (!user?.id || !workspaceId) return false;
    const result = await this.pool.query(
      `SELECT 1 FROM users u JOIN workspaces w ON w.id=$2
       WHERE u.id=$1 AND u.active=true AND w.status='active'
       AND (u.role='admin' OR EXISTS (
         SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id
         AND m.user_id=u.id AND m.role IN ('owner','admin')))` ,
      [user.id, workspaceId],
    );
    return result.rowCount === 1;
  }
}

// Call only in the same transaction as the number INSERT, after acquiring the
// existing 90421032 advisory lock. Both runtime legacy and Meta paths comply.
async function assertNumberCreation(client, workspaceId, { actorId, requireManager = false, phone } = {}) {
  let actor;
  if (requireManager) {
    if (typeof actorId !== 'string' || !actorId) throw denied();
    const result = await client.query('SELECT id,role,active FROM users WHERE id=$1 FOR SHARE', [actorId]);
    actor = result.rows[0];
    if (!actor?.active) throw denied();
  }
  const result = await client.query(
    `SELECT w.id,w.owner_id,w.status,w.billing_status,p.number_limit
     FROM workspaces w JOIN plans p ON p.id=w.plan_id
     WHERE w.id=$1 FOR UPDATE OF w FOR SHARE OF p`, [workspaceId],
  );
  const workspace = result.rows[0];
  if (!workspace) throw denied();
  if (requireManager && actor.role !== 'admin') {
    const membership = await client.query(
      "SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role IN ('owner','admin') FOR SHARE",
      [workspaceId, actorId],
    );
    if (!membership.rowCount) throw denied();
  }
  if (workspace.status !== 'active') throw policyError('WORKSPACE_INACTIVE', 'Workspace is not active');
  if (!workspace.billing_status || !canAddPaidResource(workspace.billing_status)) {
    throw policyError('BILLING_RESOURCE_BLOCKED', 'Billing status blocks adding WhatsApp numbers');
  }
  const limit = Number(workspace.number_limit);
  if (!Number.isSafeInteger(limit) || limit < 0) throw policyError('NUMBER_LIMIT_INVALID', 'Workspace number limit is not configured');
  const counts = await client.query('SELECT count(*)::int AS total FROM whatsapp_numbers WHERE workspace_id=$1', [workspaceId]);
  if (counts.rows[0].total >= limit) throw policyError('NUMBER_LIMIT_REACHED', 'Workspace WhatsApp number limit reached');
  if (phone) {
    const duplicate = await client.query(
      "SELECT 1 FROM whatsapp_numbers WHERE workspace_id=$1 AND regexp_replace(phone,'[^0-9]','','g')=$2 LIMIT 1",
      [workspaceId, String(phone).replace(/\D/g, '')],
    );
    if (duplicate.rowCount) throw policyError('NUMBER_ALREADY_EXISTS', 'This WhatsApp number is already added to this workspace');
  }
  return workspace;
}

module.exports = { NumberCreationPolicy, assertNumberCreation };
