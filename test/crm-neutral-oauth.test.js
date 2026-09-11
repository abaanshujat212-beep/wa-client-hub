const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('runtime mounts the neutral CRM callback and keeps only a deprecated alias', () => {
  const main = read('src/main.js');
  assert.match(main, /app\.use\('\/oauth\/crm',\s*ghl\.oauthRouter\)/);
  assert.match(main, /app\.use\('\/oauth\/highlevel',\s*ghl\.oauthRouter\)/);
  assert.match(main, /GHL_REDIRECT_URI.*oauth\/crm\/callback/);
});

test('CRM readiness is redacted and exposes exact mapping state', () => {
  const main = read('src/main.js');
  for (const field of ['companyId', 'locationId', 'workspaceId', 'providerConnectionId', 'conversationProviderId', 'mappingReady', 'unsupportedScopes']) assert.match(main, new RegExp(field));
  assert.doesNotMatch(main, /accessToken\s*:/);
  assert.doesNotMatch(main, /clientSecret\s*:/);
});

test('frontend reconnect uses neutral route and calling remains gated', () => {
  const readiness = read('public/crm-readiness.js');
  assert.match(readiness, /oauth\/crm\/start/);
  assert.match(readiness, /Calling — POC \/ provider approval required/);
  assert.doesNotMatch(readiness, /oauth\/highlevel\//);
});

test('OAuth state and server-side token exchange remain in the hardened provider runtime', () => {
  const runtime = read('src/providers/ghlPrivatePilotHardened.js');
  assert.match(runtime, /claimState/);
  assert.match(runtime, /exchangeCode/);
  assert.match(runtime, /upsertInstallation/);
  assert.match(runtime, /GHL_SCOPES_INSUFFICIENT/);
});
