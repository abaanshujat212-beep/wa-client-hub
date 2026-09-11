const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('setup docs expose the permanent Cloudflare OAuth and webhook endpoints', () => {
  const page = read('public/setup-docs.js');
  assert.match(page, /const publicOrigin = 'https:\/\/wa\.10xcollab\.com'/);
  const expected = [
    '/oauth/highlevel/callback', '/webhooks/ghl/events', '/webhooks/ghl/messages',
    '/webhooks/meta/whatsapp', '/webhooks/ycloud/whatsapp',
    '/api/openwa/webhook', '/api/billing/stripe/webhook',
    '/api/billing/swich/webhook', '/api/billing/whop/webhook'
  ];
  expected.forEach(value => assert.match(page, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(read('public/index.html'), /setup-docs\.js/);
});

test('example environment uses the exact public HighLevel callback without secrets', () => {
  const env = read('.env.example');
  assert.match(env, /^APP_ORIGIN=https:\/\/wa\.10xcollab\.com$/m);
  assert.match(env, /^GHL_REDIRECT_URI=https:\/\/wa\.10xcollab\.com\/oauth\/highlevel\/callback$/m);
  assert.match(env, /^GHL_CLIENT_ID=$/m);
  assert.match(env, /^GHL_CLIENT_SECRET=$/m);
});
