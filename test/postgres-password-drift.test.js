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

test('container discovery retries an initially empty Compose lookup', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  assert.match(helper, /function Find-PostgresContainer/);
  assert.match(helper, /while \(\(Get-Date\) -lt \$deadline\)/);
  assert.match(helper, /Get-ComposeContainerIds/);
  assert.match(helper, /Start-Sleep -Milliseconds \$RetryMilliseconds/);
  assert.match(helper, /AddSeconds\(\$TimeoutSeconds\)/);
});

test('container discovery uses the required label fallback', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  assert.match(helper, /docker compose --env-file \$EnvFile -f \$ComposeFile ps -q postgres/);
  assert.match(helper, /label=com\.docker\.compose\.project=wa-client-hub/);
  assert.match(helper, /label=com\.docker\.compose\.service=postgres/);
  assert.match(helper, /if \(\$ids\.Count -eq 0\) \{ \$ids = @\(Get-LabeledContainerIds\) \}/);
});

test('container discovery fails clearly for zero or multiple matches', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  assert.match(helper, /container not discovered after retry timeout/);
  assert.match(helper, /Multiple matching PostgreSQL containers were found/);
  assert.match(helper, /\$ids = @\(\$ids \| .*Sort-Object -Unique\)/);
  assert.match(helper, /container discovered but PostgreSQL check failed/);
});

test('container discovery accepts only a running healthy container', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  assert.match(helper, /docker inspect --format/);
  assert.match(helper, /State\.Running/);
  assert.match(helper, /State\.Health/);
  assert.match(helper, /-ieq 'true'/);
  assert.match(helper, /-ieq 'healthy'/);
  assert.doesNotMatch(helper, /wa-client-hub-postgres-1/);
});

test('password helper remains PowerShell 5.1 compatible and preserves SQL quoting', () => {
  const helper = read('scripts/sync-postgres-role-password.ps1');
  assert.doesNotMatch(helper, /\?\?|\?\.|ForEach-Object\s+-Parallel|\s&&\s|\s\|\|\s/);
  assert.match(helper, /\$escapedPassword = \$password\.Replace\("'", "''"\)/);
  assert.match(helper, /ALTER ROLE \\\"\$role\\\" PASSWORD/);
  assert.match(helper, /docker exec -i --user postgres/);
});
