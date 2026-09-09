const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMessage, FACEBOOK_ORIGINS } = require('../public/meta-signup');
test('browser accepts exact Meta origins and Cloud API FINISH assets only', () => {
  const data = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123', phone_number_id: '456' } };
  assert.deepEqual(parseMessage('https://www.facebook.com', data), { kind: 'finish', businessAccountId: '123', phoneNumberId: '456' });
  assert.equal(parseMessage('https://www.facebook.com.evil.test', data), null);
  assert.deepEqual(parseMessage('https://web.facebook.com', JSON.stringify({ ...data, event: 'CANCEL' })), { kind: 'cancel' });
  assert.deepEqual(FACEBOOK_ORIGINS, ['https://www.facebook.com', 'https://web.facebook.com']);
});
test('launcher uses code flow without browser token persistence or logging', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../public/meta-signup.js'), 'utf8');
  assert.match(source, /config_id:config\.configId/); assert.match(source, /response_type:'code'/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./); assert.match(source, /Messaging remains disabled/);
});
