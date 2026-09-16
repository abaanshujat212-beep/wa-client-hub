const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('PostgreSQL pools bound connection and query waits', () => {
  const config = read('src/db/config.js');
  assert.match(config, /connectionTimeoutMillis: boundedMillis\(env\.DATABASE_CONNECTION_TIMEOUT_MS, 5000\)/);
  assert.match(config, /query_timeout: boundedMillis\(env\.DATABASE_QUERY_TIMEOUT_MS, 10000\)/);
});

test('dashboard session bootstrap has a finite client timeout', () => {
  const index = read('public/index.html');
  const bootstrap = read('public/session-bootstrap.js');
  assert.match(index, /session-bootstrap\.js\?v=/);
  assert.match(index, /session-bootstrap\.js.*app\.js.*dashboard\.js/);
  assert.match(bootstrap, /SESSION_TIMEOUT_MS = 10000/);
  assert.match(bootstrap, /AbortController/);
  assert.match(bootstrap, /api.*session/);
  assert.match(bootstrap, /SessionTimeoutError/);
});
