const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('production start uses the composed main entry and keeps the legacy server non-main', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json')));
  assert.equal(pkg.main, 'src/main.js'); assert.equal(pkg.scripts.start, 'node src/main.js');
  const main = fs.readFileSync(path.resolve(__dirname, '..', 'src/main.js'), 'utf8');
  assert.match(main, /createMetaSignupRuntime/); assert.match(main, /\/api\/meta\/signup/);
  assert.match(main, /metaSignup\.start\(\)/); assert.match(main, /metaSignup\.stop\(\)/);
});
