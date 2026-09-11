const test = require('node:test');
const assert = require('node:assert/strict');
const { MessagingRepository } = require('../src/messaging/repository');
const { MetaMediaRepository } = require('../src/messaging/metaMediaRepository');

test('canonical outbound persistence binds provider media to the exact message and connection', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO messages')) return { rows: [{ id: 'message-1', workspace_id: 'workspace-1' }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const repository = new MessagingRepository({ connect: async () => client });
  await repository.recordOutbound({
    attemptId: 'attempt-1',
    dispatch: { workspaceId: 'workspace-1', conversationId: 'conversation-1', providerConnectionId: 'connection-1' },
    body: '[media:image:provider-media-1]',
    type: 'image',
    origin: 'api',
    externalMessageId: 'external-1',
    idempotencyKey: 'media-key-1',
    rawProviderStatus: 'accepted',
    attachment: { mediaId: 'provider-media-1', type: 'image', filename: 'photo.png', sizeBytes: 5, sha256: 'a'.repeat(64) },
  });
  const attachmentInsert = queries.find(({ sql }) => sql.includes('INSERT INTO message_attachments'));
  assert.ok(attachmentInsert);
  assert.deepEqual(attachmentInsert.params.slice(1), ['workspace-1', 'message-1', 'connection-1', 'provider-media-1', 'image', 'photo.png', 5, 'a'.repeat(64)]);
  assert.match(attachmentInsert.sql, /ON CONFLICT \(message_id,provider_media_id\)/);
});

test('media cleanup candidate query retains exact number and Meta asset binding', async () => {
  const calls = [];
  const repository = new MetaMediaRepository({ async query(sql, params) { calls.push({ sql, params }); return { rows: [{ id: 'attachment-1', workspace_id: 'workspace-1', provider_connection_id: 'connection-1', provider_media_id: 'provider-media-1', provider_media_delete_attempts: 0, encrypted_credentials: 'ciphertext', encryption_key_id: 'key-1' }] }; } }, { decrypt(value, connectionId, keyId) { assert.deepEqual([value, connectionId, keyId], ['ciphertext', 'connection-1', 'key-1']); return { accessToken: 'server-token' }; } });
  const now = new Date('2026-01-01T00:00:00Z');
  const result = await repository.listMediaCleanupCandidates({ limit: 101, now });
  assert.deepEqual(result, [{ attachmentId: 'attachment-1', workspaceId: 'workspace-1', providerConnectionId: 'connection-1', providerMediaId: 'provider-media-1', accessToken: 'server-token', attempts: 0 }]);
  assert.deepEqual(calls[0].params, [now, 100]);
  assert.match(calls[0].sql, /p\.id=n\.provider_connection_id/);
  assert.match(calls[0].sql, /ca\.phone_number_id=n\.external_session_id/);
  assert.match(calls[0].sql, /ma\.provider_media_deleted_at IS NULL/);
});
