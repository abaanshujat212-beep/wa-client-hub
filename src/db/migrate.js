const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { databaseConfig, assertDatabaseConfig } = require('./config');

const MIGRATIONS = [
  { id: '001_canonical_schema', file: path.resolve(__dirname, '..', '..', 'docs', 'schema.sql') },
  { id: '002_openwa_adapter', file: path.resolve(__dirname, '..', '..', 'docs', 'migrations', '002_openwa_adapter.sql') },
  { id: '003_unified_inbox', file: path.resolve(__dirname, '..', '..', 'docs', 'migrations', '003_unified_inbox.sql') },
  { id: '004_safe_campaigns', file: path.resolve(__dirname, '..', '..', 'docs', 'migrations', '004_safe_campaigns.sql') },
  { id: '005_connector_framework', file: path.resolve(__dirname, '..', '..', 'docs', 'migrations', '005_connector_framework.sql') },
  { id: '006_provider_connectors', file: path.resolve(__dirname, '..', '..', 'docs', 'migrations', '006_provider_connectors.sql') }
];

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function runMigrations(pool, migrations = MIGRATIONS) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [90421031]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const sql = fs.readFileSync(migration.file, 'utf8');
      const hash = checksum(sql);
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE id = $1', [migration.id]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== hash) throw new Error(`Applied migration ${migration.id} checksum has changed`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [migration.id, hash]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const config = assertDatabaseConfig({ ...databaseConfig(), driver: 'postgres' });
  const pool = new Pool(config);
  try {
    await runMigrations(pool);
    console.log(`Applied ${MIGRATIONS.length} PostgreSQL migration(s)`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { MIGRATIONS, checksum, runMigrations };
