const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Windows Docker startup synchronizes the existing role without volume deletion or secret logging', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  const startup = read('scripts/start-stack-windows.ps1');
  const daily = read('scripts/run-windows.ps1');
  assert.match(helper, /docker exec -i --user postgres/);
  assert.match(helper, /ALTER ROLE/);
  assert.match(helper, /Expected the local deployment role\/database to be wa_hub/);
  assert.doesNotMatch(helper, /Write-Host.*(?:\$password|\$escapedPassword|POSTGRES_PASSWORD)/i);
  assert.doesNotMatch(`${startup}\n${daily}`, /down\s+(-v|--volumes)|down\s+--volumes/i);
  const postgresStart = startup.indexOf("'postgres', 'redis', '--wait'");
  const passwordSync = startup.indexOf("Sync-PostgresPassword 'compose.yml'");
  const migration = startup.indexOf("'migrate', '--wait'");
  assert.ok(postgresStart >= 0 && passwordSync > postgresStart && migration > passwordSync);
});
