const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaMediaRetentionService } = require('../src/messaging/metaMediaRetentionService');

test('media retention deletes due provider media and records only redacted failure codes', async () => {
  const removed = [];
  const deleted = [];
  const failed = [];
  const repository = {
    async listMediaCleanupCandidates(input) {
      assert.equal(input.limit, 3);
      return [
        { attachmentId: 'a1', providerMediaId: 'm1', accessToken: 'server-token' },
        { attachmentId: 'a2', providerMediaId: 'm2', accessToken: null },
        { attachmentId: 'a3', providerMediaId: 'm3', accessToken: 'server-token' },
      ];
    },
    async markMediaCleanupDeleted(input) { deleted.push(input); },
    async markMediaCleanupFailure(input) { failed.push(input); },
  };
  const service = new MetaMediaRetentionService({ repository, mediaService: { async remove(input) { removed.push(input); if (input.mediaId === 'm3') { const error = new Error('provider secret detail'); error.code = 'META_HTTP_500'; throw error; } } } });
  const result = await service.cleanup({ limit: 3, now: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(result, { examined: 3, deleted: 1, failed: 2 });
  assert.deepEqual(removed, [{ accessToken: 'server-token', mediaId: 'm1' }, { accessToken: 'server-token', mediaId: 'm3' }]);
  assert.deepEqual(deleted, [{ attachmentId: 'a1' }]);
  assert.deepEqual(failed, [{ attachmentId: 'a2', code: 'META_CREDENTIALS_UNAVAILABLE' }, { attachmentId: 'a3', code: 'META_HTTP_500' }]);
  assert.equal(JSON.stringify(failed).includes('provider secret detail'), false);
});

test('media retention clamps cleanup batches and processes candidates serially', async () => {
  const order = [];
  const repository = {
    async listMediaCleanupCandidates({ limit }) { assert.equal(limit, 100); return [{ attachmentId: 'a1', providerMediaId: 'm1', accessToken: 'token' }]; },
    async markMediaCleanupDeleted({ attachmentId }) { order.push(`mark:${attachmentId}`); },
    async markMediaCleanupFailure() { throw new Error('not expected'); },
  };
  const service = new MetaMediaRetentionService({ repository, maxBatch: 1000, mediaService: { async remove() { order.push('remove'); } } });
  assert.deepEqual(await service.cleanup({ limit: 1000 }), { examined: 1, deleted: 1, failed: 0 });
  assert.deepEqual(order, ['remove', 'mark:a1']);
});
