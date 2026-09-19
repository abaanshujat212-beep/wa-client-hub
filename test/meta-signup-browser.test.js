const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMessage, createSignupCoordinator, FACEBOOK_ORIGINS } = require('../public/meta-signup');
const { signupErrorMessage } = require('../public/meta-signup');
test('start errors explain rate limits and recovery without exposing server details', () => {
  assert.match(signupErrorMessage({ status: 429, retryAfter: 121 }), /Wait 3 minute/);
  assert.match(signupErrorMessage({ status: 401 }), /Sign in again/);
  assert.match(signupErrorMessage({ status: 403 }), /Refresh this page/);
  assert.match(signupErrorMessage({ status: 400 }), /at least 2 characters/);
  assert.match(signupErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(signupErrorMessage({ code: 'META_SDK_LOAD_FAILED' }), /Facebook could not load/);
  assert.doesNotMatch(signupErrorMessage(new Error('private detail')), /private detail/);
});
function fixture() {
  const completed = []; const cancelled = []; const statuses = [];
  const coordinator = createSignupCoordinator({ complete: async body => { completed.push(body); }, cancel: async body => { cancelled.push(body); }, onStatus: status => statuses.push(status), closeGraceMs: 1, assetWaitMs: 20 });
  coordinator.start('state-1');
  return { coordinator, completed, cancelled, statuses };
}
test('browser accepts exact Meta origins, partial FINISH assets, CANCEL and ERROR payloads', () => {
  const data = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123', phone_number_id: '456' } };
  assert.deepEqual(parseMessage('https://www.facebook.com', data), { kind: 'finish', event: 'FINISH', businessAccountId: '123', phoneNumberId: '456', hasAssets: true });
  assert.deepEqual(parseMessage('https://www.facebook.com', { ...data, data: { waba_id: '123' } }), { kind: 'finish', event: 'FINISH', businessAccountId: '123', phoneNumberId: null, hasAssets: false });
  assert.equal(parseMessage('https://www.facebook.com.evil.test', data), null);
  assert.deepEqual(parseMessage('https://web.facebook.com', JSON.stringify({ ...data, event: 'CANCEL', data: { current_step: 'PHONE' } })), { kind: 'cancel', event: 'CANCEL', hasCurrentStep: true, hasError: false });
  assert.deepEqual(parseMessage('https://www.facebook.com', { ...data, event: 'ERROR', data: { error_code: 'E123', error_message: 'do not expose' } }), { kind: 'error', event: 'ERROR', reason: 'E123' });
  assert.equal(parseMessage('https://www.facebook.com', '{bad-json'), null);
  assert.equal(parseMessage('https://www.facebook.com', { type: 'OTHER', event: 'FINISH' }), null);
  assert.deepEqual(FACEBOOK_ORIGINS, ['https://www.facebook.com', 'https://web.facebook.com']);
});
test('code first then FINISH submits exactly once', async () => {
  const f = fixture(); await f.coordinator.receiveCode('secret-code'); assert.equal(f.completed.length, 0);
  await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' });
  assert.equal(f.completed.length, 1); assert.equal(f.completed[0].code, 'secret-code'); assert.equal(f.completed[0].state, 'state-1');
});
test('FINISH first then code submits exactly once', async () => {
  const f = fixture(); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' }); assert.equal(f.completed.length, 0);
  await f.coordinator.receiveCode('secret-code'); assert.equal(f.completed.length, 1);
});
test('duplicate FINISH messages cannot duplicate completion', async () => {
  const f = fixture(); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' }); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' }); await f.coordinator.receiveCode('secret-code'); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' });
  assert.equal(f.completed.length, 1);
});
test('intermediate CANCEL does not destroy state before later FINISH', async () => {
  const f = fixture(); await f.coordinator.receiveCancel(); assert.equal(f.cancelled.length, 0); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' }); await f.coordinator.receiveCode('secret-code'); assert.equal(f.completed.length, 1); assert.equal(f.cancelled.length, 0);
});
test('popup dismissal without code or FINISH cancels exactly once', async () => {
  const f = fixture(); f.coordinator.popupClosed(); await f.coordinator.finalizePopupClose(); await f.coordinator.finalizePopupClose(); assert.deepEqual(f.cancelled, [{ state: 'state-1' }]); assert.equal(f.statuses.at(-1).message, 'Signup cancelled.');
});

test('empty SDK callback preserves signup while popup remains open', async () => {
  const f = fixture();
  await f.coordinator.receiveLoginResult({ status: 'unknown' });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.coordinator.active('state-1'), true);
  assert.equal(f.cancelled.length, 0);
  assert.equal(f.statuses.at(-1).terminal, false);
  await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' });
  await f.coordinator.receiveLoginResult({ authResponse: { code: 'later-code' } });
  assert.equal(f.completed.length, 1);
  assert.equal(f.cancelled.length, 0);
});

test('empty callback still permits explicit cancellation and isolates retries', async () => {
  const f = fixture();
  await f.coordinator.receiveLoginResult(null);
  await f.coordinator.explicitCancel();
  assert.equal(f.cancelled.length, 1);
  f.coordinator.start('state-2');
  assert.equal(f.coordinator.active('state-1'), false);
  assert.equal(f.coordinator.active('state-2'), true);
  await f.coordinator.explicitCancel();
});
test('ERROR normalizes the UI message and permits a fresh retry', async () => {
  const f = fixture(); await f.coordinator.receiveError('META_INTERNAL_REASON'); assert.equal(f.cancelled.length, 1); assert.equal(f.statuses.at(-1).message, 'Signup failed. Start a new signup.');
  f.coordinator.start('state-2'); await f.coordinator.receiveCode('new-code'); await f.coordinator.receiveFinish({ businessAccountId: '123', phoneNumberId: '456' }); assert.equal(f.completed.length, 1);
});
test('launcher diagnostics expose only safe lifecycle metadata', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../public/meta-signup.js'), 'utf8');
  assert.match(source, /fb\.login\.callback/); assert.match(source, /message\.accepted/); assert.match(source, /hasCode/); assert.match(source, /hasAssets/); assert.doesNotMatch(source, /console\.(log|error)/); assert.doesNotMatch(source, /accessToken|appSecret/);
});
