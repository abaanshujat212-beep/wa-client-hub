require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const PostgresRepository = require('../src/db/postgresRepository');

async function main() {
  const sourceArg = process.argv.find((value) => value.startsWith('--source='));
  const source = path.resolve(sourceArg ? sourceArg.slice('--source='.length) : path.join(__dirname, '..', 'data', 'store.json'));
  const allowReplace = process.argv.includes('--replace');
  if (!fs.existsSync(source)) throw new Error(`JSON store not found: ${source}`);
  const data = JSON.parse(fs.readFileSync(source, 'utf8'));
  const repository = new PostgresRepository();
  try {
    await repository.init();
    await repository.replaceLegacyState(data, { requireEmpty: !allowReplace });
    const imported = await repository.loadLegacyState();
    console.log(`Imported ${imported.users.length} users, ${imported.workspaces.length} workspaces, ${imported.accounts.length} WhatsApp numbers, and ${imported.audit.length} audit events`);
  } finally { await repository.close(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { main };
