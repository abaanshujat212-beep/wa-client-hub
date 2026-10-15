import {apiRequest} from '../api/authenticatedClient';
export type Contact = {id: string; displayName?: string; phoneE164?: string; email?: string};
export const searchContacts = (workspaceId: string, query = '') => apiRequest<{contacts: Contact[]}>(`/api/contacts?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}`);
