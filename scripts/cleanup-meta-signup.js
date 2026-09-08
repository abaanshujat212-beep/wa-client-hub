const { MetaSignupProtection } = require('../src/messaging/metaSignupProtection');

// One finite pass, never a server or an unbounded drain. Schedule externally.
async function main() {
  const { Pool } = require('pg');
  const { databaseConfig, assertDatabaseConfig } = require('../src/db/config');
  const pool = new Pool({ ...assertDatabaseConfig({ ...databaseConfig(), driver: 'postgres' }), statement_timeout: 15000 });
  try {
    const counts = await new MetaSignupProtection(pool).cleanup(500);
    console.log(JSON.stringify(counts)); // Counts only; no identifiers, state or credentials.
  } finally { await pool.end(); }
}
if (require.main === module) {
  require('dotenv').config();
  main().catch(() => { console.error('Meta signup cleanup failed'); process.exitCode = 1; });
}
module.exports = { main };
