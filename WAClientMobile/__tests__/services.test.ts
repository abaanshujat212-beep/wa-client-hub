import {pendingMessageQueue} from '../src/storage/pendingMessageQueue';
import {reconcile} from '../src/services/syncService';

test('pending message queue removes by idempotency key', () => { const key = `test-${Date.now()}`; pendingMessageQueue.add({idempotencyKey: key, conversationId: 'conversation', body: 'hello', createdAt: Date.now()}); expect(pendingMessageQueue.list().some(item => item.idempotencyKey === key)).toBe(true); pendingMessageQueue.remove(key); expect(pendingMessageQueue.list().some(item => item.idempotencyKey === key)).toBe(false); });
test('sync reconciliation returns cursor metadata', async () => { const result = await reconcile(async () => ({items: ['one'], nextCursor: 'next'})); expect(result.items).toEqual(['one']); expect(result.cursor.cursor).toBe('next'); });
