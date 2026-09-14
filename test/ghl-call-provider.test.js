const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCallEvent, enabled } = require('../src/providers/ghlCallProvider');

test('normalizes an audio GHL call event with exact provider binding', () => {
  const result = normalizeCallEvent({ installationId: 'install-1', locationId: 'loc-1', conversationProviderId: 'provider-1', callId: 'call-1', eventId: 'event-1', direction: 'outgoing', status: 'answered', phone: '+923001234567', duration: 12 });
  assert.equal(result.installationId, 'install-1');
  assert.equal(result.locationId, 'loc-1');
  assert.equal(result.conversationProviderId, 'provider-1');
  assert.equal(result.mediaKind, 'voice');
  assert.equal(result.state, 'answered');
  assert.equal(result.durationSeconds, 12);
});

test('rejects a GHL call without an exact provider ID', () => {
  assert.throws(() => normalizeCallEvent({ installationId: 'install-1', locationId: 'loc-1', callId: 'call-1', eventId: 'event-1' }), /conversationProviderId/);
});

test('rejects non-audio Calling events', () => {
  assert.throws(() => normalizeCallEvent({ installationId: 'install-1', locationId: 'loc-1', conversationProviderId: 'provider-1', callId: 'call-1', eventId: 'event-1', mediaKind: 'video' }), /Only audio/);
});

test('keeps the GHL route disabled by default', () => {
  assert.equal(enabled({}), false);
  assert.equal(enabled({ GHL_CALLING_ENABLED: 'true' }), true);
});
