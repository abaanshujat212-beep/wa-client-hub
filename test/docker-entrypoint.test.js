const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('production container starts the composed Meta and CRM runtime', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /CMD \["node", "scripts\/start-runtime\.js"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["node", "src\/server\.js"\]/);
});

test('runtime entrypoint verifies PostgreSQL and Redis before loading the app', () => {
  const entrypoint = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'start-runtime.js'), 'utf8');
  assert.match(entrypoint, /await checkPostgres\(env\)/);
  assert.match(entrypoint, /await checkRedis\(env\)/);
  assert.match(entrypoint, /require\('\.\.\/src\/main'\)\.runMain\(\)/);
  assert.match(entrypoint, /while \(true\)/);
});
