const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const htmlPath = path.join(publicDir, 'client-hub.html');
const scriptPath = path.join(publicDir, 'client-hub.js');
const docsPath = path.join(__dirname, '..', 'docs', 'ghl-auto-provisioning-embedded-sso.md');

test('neutral Client Hub custom page is the documented Marketplace URL', () => {
  assert.equal(fs.existsSync(htmlPath), true);
  assert.equal(fs.existsSync(scriptPath), true);
  assert.equal(fs.existsSync(path.join(publicDir, 'ghl-embedded.html')), false);
  assert.equal(fs.existsSync(path.join(publicDir, 'ghl-embedded.js')), false);
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /<script src="\/client-hub\.js" defer><\/script>/);
  assert.doesNotMatch(html, /ghl-embedded/);
  assert.match(fs.readFileSync(docsPath, 'utf8'), /https:\/\/wa\.10xcollab\.com\/client-hub\.html/);
});
