require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const PostgresRepository = require('../src/db/postgresRepository');

async function main() {
  const outputArg = process.argv.find((value) => value.startsWith('--output='));
  const output = path.resolve(outputArg ? outputArg.slice('--output='.length) : path.join(__dirname, '..', 'data', `store-postgres-export-${Date.now()}.json`));
  if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
  const repository = new PostgresRepository();
  try {
    await repository.init();
    const data = await repository.snapshotLegacyState();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
    console.log(`Exported PostgreSQL store to ${output}`);
  } finally { await repository.close(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { main };
