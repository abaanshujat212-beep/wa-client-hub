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
  assert.match(index, /session-bootstrap\.js.*app\.js/);
  assert.match(bootstrap, /SESSION_TIMEOUT_MS = 10000/);
  assert.match(bootstrap, /XMLHttpRequest/);
  assert.match(bootstrap, /request\.timeout = SESSION_TIMEOUT_MS/);
  assert.match(bootstrap, /api.*bootstrap/);
  assert.match(bootstrap, /SessionTimeoutError/);
  assert.match(bootstrap, /DOMContentLoaded/);
  assert.match(bootstrap, /SESSION_ATTEMPTS = 2/);
  assert.match(bootstrap, /_session_retry/);
  assert.match(read('public/app.js'), /window\.fetchSession/);
  assert.match(read('src/server.js'), /app\.get\("\/api\/bootstrap"/);
  assert.match(read('src/server.js'), /createLoginCsrfToken/);
  assert.match(read('src/server.js'), /validLoginCsrfToken/);
  assert.match(read('src/server.js'), /app\.get\(\["\/", "\/index\.html"\], serveIndex\)/);
  assert.match(read('src/server.js'), /req\.session\.save/);
  assert.match(index, /SESSION_BOOTSTRAP/);
  assert.match(bootstrap, /window\.__SESSION_BOOTSTRAP__/);
  assert.doesNotMatch(bootstrap, /window\.stop/);

  assert.match(read('src/server.js'), /window\.__SESSION_BOOTSTRAP__/);
  assert.match(read('src/server.js'), /"Content-Length": String\(body\.length\)/);
});
