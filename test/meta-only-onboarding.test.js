const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('authenticated dashboard loads one Meta signup implementation and the feature gate', () => {
  const index = read('public/index.html');
  const ui = read('public/meta-only-ui.js');
  assert.match(index, /<script src="\/meta-signup\.js\?v=[^"]+" defer><\/script>/);
  assert.match(index, /<script src="\/meta-only-ui\.js\?v=[^"]+" defer><\/script>/);
  assert.match(ui, /Connect WhatsApp with Meta/);
  assert.match(ui, /openwaEnabled !== true/);
  assert.doesNotMatch(ui, /FB\.login|WA_EMBEDDED_SIGNUP/);
});

test('Meta signup waits for the authenticated app view before requesting a session', () => {
  const signup = read('public/meta-signup.js');
  const server = read('src/server.js');
  assert.match(signup, /if \(!app\.classList\.contains\("hidden"\)\) void discover\(\)/);
  assert.doesNotMatch(signup, /\}\); void discover\(\);/);
  assert.match(server, /app\.get\("\/api\/session".*Cache-Control", "no-store"/);
  assert.match(server, /if \(!req\.path\.startsWith\("\/api\/"\)\) return next\(\)/);
});

test('OpenWA stays an explicit Compose profile and is disabled by default', () => {
  const env = read('.env.docker.example');
  const compose = read('compose.yml');
  const main = read('src/main.js');
  assert.match(env, /^OPENWA_ENABLED=false$/m);
  assert.match(compose, /profiles: \[openwa\]/);
  assert.match(compose, /OPENWA_ENABLED: \$\{OPENWA_ENABLED:-false\}/);
  assert.match(main, /openWaEnabled/);
});
