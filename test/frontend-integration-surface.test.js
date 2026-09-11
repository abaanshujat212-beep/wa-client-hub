const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend exposes every operator-facing integration surface', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'integrations.js'), 'utf8');
  for (const endpoint of [
    '/api/campaigns/suppressions', '/api/generic/keys', '/api/connectors',
    '/api/providers/', '/api/meta/signup/status', '/api/meta/connections/',
    '/api/ghl/installations', '/api/ghl/mappings', '/api/ghl/revoke',
    '/api/openwa/numbers/'
  ]) assert.ok(source.includes(endpoint), `missing frontend surface for ${endpoint}`);
  for (const action of ['connector-settings', 'connector-rotate', 'connector-reconcile', 'connector-orders', 'order-trigger', 'meta-diagnostics', 'meta-activate', 'meta-templates', 'ghl-diagnostics', 'ghl-revoke']) assert.ok(source.includes(action), `missing action ${action}`);
});

test('SPA fallback does not consume API, OAuth, or webhook GET routes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.match(source, /\^\\\/\(api\|oauth\|webhooks\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8'), /Feature is not enabled/);
});
