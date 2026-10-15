export type PendingMessage = {idempotencyKey: string; conversationId: string; body: string; createdAt: number};
const queue: PendingMessage[] = [];
export const pendingMessageQueue = {add: (message: PendingMessage) => queue.push(message), list: () => [...queue], remove: (key: string) => { const index = queue.findIndex(item => item.idempotencyKey === key); if (index >= 0) queue.splice(index, 1); }};
