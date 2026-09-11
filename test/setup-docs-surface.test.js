const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('setup docs expose the permanent neutral CRM OAuth and webhook endpoints', () => {
  const page = read('public/setup-docs.js');
  assert.match(page, /const publicOrigin = 'https:\\/\\/wa\\.10xcollab\\.com'/);
  for (const value of ['/oauth/crm/callback', '/webhooks/ghl/events', '/webhooks/ghl/messages', '/webhooks/meta/whatsapp', '/webhooks/ycloud/whatsapp']) assert.match(page, new RegExp(value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  assert.doesNotMatch(page, /https:\\/\\/wa\\.10xcollab\\.com\\/oauth\\/highlevel\\/callback/);
  assert.match(page, /GHL_REQUIRED_SCOPES=conversations\.write/);
  assert.match(page, /conversationProviderId/);
  assert.match(read('public/index.html'), /crm-readiness\\.js/);
});

test('example environment uses the neutral callback without secrets', () => {
  const env = read('.env.example');
  assert.match(env, /^APP_ORIGIN=https:\\/\\/wa\\.10xcollab\\.com$/m);
  assert.match(env, /^GHL_REDIRECT_URI=https:\\/\\/wa\\.10xcollab\\.com\\/oauth\\/crm\\/callback$/m);
  assert.match(env, /^GHL_CLIENT_ID=$/m);
  assert.match(env, /^GHL_CLIENT_SECRET=$/m);
});
