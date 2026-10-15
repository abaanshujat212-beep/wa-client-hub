export type SyncCursor = {cursor?: string; updatedAt?: string};
export async function reconcile<T>(loader: (cursor?: string) => Promise<{items: T[]; nextCursor?: string}>, cursor?: SyncCursor) { const result = await loader(cursor?.cursor); return {items: result.items, cursor: {cursor: result.nextCursor, updatedAt: new Date().toISOString()}}; }
