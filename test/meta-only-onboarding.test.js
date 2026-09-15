const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('authenticated dashboard loads one Meta signup implementation and the feature gate', () => {
  const index = read('public/index.html');
  const ui = read('public/meta-only-ui.js');
  assert.match(index, /<script src="\/meta-signup\.js" defer><\/script>/);
  assert.match(index, /<script src="\/meta-only-ui\.js" defer><\/script>/);
  assert.match(ui, /Connect WhatsApp with Meta/);
  assert.match(ui, /openwaEnabled !== true/);
  assert.doesNotMatch(ui, /FB\.login|WA_EMBEDDED_SIGNUP/);
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
