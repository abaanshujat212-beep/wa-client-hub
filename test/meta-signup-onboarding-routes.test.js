const test = require('node:test');
const assert = require('node:assert/strict');
const { validBody, validPublicConfig } = require('../src/messaging/metaSignupRoutes');
test('onboarding config and cancellation bodies are narrowly allowlisted', () => {
  assert.equal(validPublicConfig({ appId: '123', configId: '456', graphVersion: 'v23.0' }), true);
  assert.equal(validPublicConfig({ appId: 'x', configId: '456', graphVersion: 'v23.0' }), false);
  assert.equal(validBody('cancel', { state: 'x'.repeat(43) }), true);
  assert.equal(validBody('cancel', { state: 'x'.repeat(43), workspaceId: 'other' }), false);
});
