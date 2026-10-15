import {apiRequest} from '../api/authenticatedClient';
export type Conversation = {id: string; contactId?: string; preview?: string; unreadCount?: number; updatedAt?: string};
export const listConversations = (workspaceId: string, cursor?: string) => apiRequest<{conversations: Conversation[]; nextCursor?: string}>(`/api/inbox/conversations?workspaceId=${encodeURIComponent(workspaceId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
export const listMessages = (conversationId: string, cursor?: string) => apiRequest<{messages: unknown[]; nextCursor?: string}>(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
