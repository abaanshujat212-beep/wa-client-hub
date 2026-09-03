const { Pool } = require('pg');
const { databaseConfig, assertDatabaseConfig } = require('./config');
const { runMigrations } = require('./migrate');
const { DEFAULT_PLANS } = require('../store');

function iso(value) { return value ? new Date(value).toISOString() : null; }
function camelWorkspace(row) {
  return { id: row.id, ownerId: row.owner_id, name: row.name, planId: row.plan_id, status: row.status, billingProvider: row.billing_provider, billingStatus: row.billing_status, billingCustomerId: row.billing_customer_id, billingSubscriptionId: row.billing_subscription_id, billingPlanId: row.billing_plan_id, currentPeriodEnd: iso(row.current_period_end), migratedDefault: row.migrated_default, createdAt: iso(row.created_at) };
}

class PostgresRepository {
  constructor(options = {}) {
    const config = assertDatabaseConfig({ ...databaseConfig(), driver: 'postgres', ...options });
    this.pool = options.pool || new Pool(config);
    this.ownsPool = !options.pool;
  }

  async init() { await runMigrations(this.pool); }
  async close() { if (this.ownsPool) await this.pool.end(); }

  async isEmpty() {
    const result = await this.pool.query('SELECT NOT EXISTS (SELECT 1 FROM users) AS empty');
    return result.rows[0].empty;
  }

  async loadLegacyState() {
    const [users, plans, workspaces, members, accounts, invites, audit] = await Promise.all([
      this.pool.query('SELECT * FROM users ORDER BY created_at'),
      this.pool.query('SELECT * FROM plans ORDER BY id'),
      this.pool.query('SELECT * FROM workspaces ORDER BY created_at'),
      this.pool.query('SELECT * FROM workspace_members ORDER BY created_at'),
      this.pool.query('SELECT * FROM whatsapp_numbers ORDER BY created_at'),
      this.pool.query('SELECT * FROM invites ORDER BY created_at'),
      this.pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC')
    ]);
    return {
      users: users.rows.map((row) => ({ id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role, active: row.active, createdAt: iso(row.created_at) })),
      plans: plans.rows.map((row) => ({ id: row.id, name: row.name, workspaceLimit: row.workspace_limit, numberLimit: row.number_limit, userLimit: row.user_limit, custom: row.custom })),
      workspaces: workspaces.rows.map(camelWorkspace),
      workspaceMembers: members.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, userId: row.user_id, role: row.role, createdAt: iso(row.created_at) })),
      accounts: accounts.rows.map((row) => ({ id: row.id, ownerId: row.owner_id, workspaceId: row.workspace_id, label: row.label, phone: row.phone, createdAt: iso(row.created_at), lastLaunchedAt: iso(row.last_launched_at) })),
      invites: invites.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, email: row.email, name: row.name, role: row.role, tokenHash: row.token_hash, status: row.status, createdBy: row.created_by, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at), acceptedAt: iso(row.accepted_at) })),
      audit: audit.rows.map((row) => ({ id: row.id, userId: row.user_id, action: row.action, details: row.details, createdAt: iso(row.created_at) }))
    };
  }

  async replaceLegacyState(data, { requireEmpty = true, destructiveReplace = false } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [90421032]);
      if (requireEmpty) {
        const existing = await client.query('SELECT EXISTS (SELECT 1 FROM users) AS populated');
        if (existing.rows[0].populated) throw new Error('PostgreSQL store is not empty; import refused');
      }
      if (destructiveReplace) await client.query('TRUNCATE audit_logs, invites, workspace_members, whatsapp_numbers, workspace_features, provider_connections, workspaces, plans, users CASCADE');
      for (const plan of data.plans?.length ? data.plans : DEFAULT_PLANS) await client.query('INSERT INTO plans (id,name,workspace_limit,number_limit,user_limit,custom) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, workspace_limit=EXCLUDED.workspace_limit, number_limit=EXCLUDED.number_limit, user_limit=EXCLUDED.user_limit, custom=EXCLUDED.custom', [plan.id, plan.name, plan.workspaceLimit, plan.numberLimit, plan.userLimit, Boolean(plan.custom)]);
      for (const user of data.users || []) await client.query('INSERT INTO users (id,name,email,password_hash,role,active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=EXCLUDED.active', [user.id, user.name, user.email, user.passwordHash, user.role, user.active !== false, user.createdAt]);
      for (const row of data.workspaces || []) await client.query(`INSERT INTO workspaces (id,owner_id,name,plan_id,status,billing_provider,billing_status,billing_customer_id,billing_subscription_id,billing_plan_id,current_period_end,migrated_default,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id, name=EXCLUDED.name, plan_id=EXCLUDED.plan_id, status=EXCLUDED.status, billing_provider=EXCLUDED.billing_provider, billing_status=EXCLUDED.billing_status, billing_customer_id=EXCLUDED.billing_customer_id, billing_subscription_id=EXCLUDED.billing_subscription_id, billing_plan_id=EXCLUDED.billing_plan_id, current_period_end=EXCLUDED.current_period_end, migrated_default=EXCLUDED.migrated_default`, [row.id,row.ownerId,row.name,row.planId,row.status || 'active',row.billingProvider || 'manual',row.billingStatus || 'manual',row.billingCustomerId || null,row.billingSubscriptionId || null,row.billingPlanId || null,row.currentPeriodEnd || null,Boolean(row.migratedDefault),row.createdAt]);
      for (const row of data.workspaceMembers || []) await client.query('INSERT INTO workspace_members (id,workspace_id,user_id,role,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id, user_id=EXCLUDED.user_id, role=EXCLUDED.role', [row.id,row.workspaceId,row.userId,row.role,row.createdAt]);
      for (const row of data.accounts || []) await client.query('INSERT INTO whatsapp_numbers (id,owner_id,workspace_id,label,phone,created_at,last_launched_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id, workspace_id=EXCLUDED.workspace_id, label=EXCLUDED.label, phone=EXCLUDED.phone, last_launched_at=EXCLUDED.last_launched_at', [row.id,row.ownerId,row.workspaceId,row.label,row.phone,row.createdAt,row.lastLaunchedAt || null]);
      for (const row of data.invites || []) await client.query('INSERT INTO invites (id,workspace_id,email,name,role,token_hash,status,created_by,created_at,expires_at,accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id, email=EXCLUDED.email, name=EXCLUDED.name, role=EXCLUDED.role, token_hash=EXCLUDED.token_hash, status=EXCLUDED.status, created_by=EXCLUDED.created_by, expires_at=EXCLUDED.expires_at, accepted_at=EXCLUDED.accepted_at', [row.id,row.workspaceId,row.email,row.name,row.role,row.tokenHash,row.status,row.createdBy || null,row.createdAt,row.expiresAt,row.acceptedAt || null]);
      for (const row of data.audit || []) await client.query('INSERT INTO audit_logs (id,user_id,action,details,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING', [row.id,row.userId || null,row.action,row.details || {},row.createdAt]);
      if (!destructiveReplace) {
        await client.query('DELETE FROM audit_logs WHERE NOT (id = ANY($1::text[]))', [(data.audit || []).map((row) => row.id)]);
        await client.query('DELETE FROM invites WHERE NOT (id = ANY($1::text[]))', [(data.invites || []).map((row) => row.id)]);
        await client.query('DELETE FROM workspace_members WHERE NOT (id = ANY($1::text[]))', [(data.workspaceMembers || []).map((row) => row.id)]);
        await client.query('DELETE FROM whatsapp_numbers WHERE NOT (id = ANY($1::text[]))', [(data.accounts || []).map((row) => row.id)]);
        await client.query('DELETE FROM workspaces WHERE NOT (id = ANY($1::text[]))', [(data.workspaces || []).map((row) => row.id)]);
        await client.query('DELETE FROM users WHERE NOT (id = ANY($1::text[]))', [(data.users || []).map((row) => row.id)]);
        await client.query('DELETE FROM plans WHERE NOT (id = ANY($1::text[]))', [(data.plans?.length ? data.plans : DEFAULT_PLANS).map((row) => row.id)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async snapshotLegacyState() {
    return this.loadLegacyState();
  }
}

module.exports = PostgresRepository;
