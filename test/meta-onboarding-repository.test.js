const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaOnboardingRepository } = require('../src/messaging/metaOnboardingRepository');
test('onboarding status is workspace-scoped and credential-free', async () => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push(params); if (sql.includes('SELECT EXISTS')) return { rows: [{ pending: true }] }; return { rows: [{ connection_id: 'c', label: 'Official', status: 'connecting', number_id: 'n', number_label: 'Sales', phone: '+923001112222', automation_enabled: false }] }; } };
  const status = await new MetaOnboardingRepository(pool).status('actor', 'workspace');
  assert.equal(status.pending, true); assert.deepEqual(calls, [['actor', 'workspace'], ['workspace']]);
  assert.doesNotMatch(JSON.stringify(status), /encrypted|credential|token|external_session|settings/i);
});
