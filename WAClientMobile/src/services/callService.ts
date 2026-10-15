import {apiRequest} from '../api/authenticatedClient';
import {CallRecord} from '../types/api';
export const listCalls = (workspaceId: string) => apiRequest<{sessions: CallRecord[]}>(`/api/meta/calling/sessions?workspaceId=${encodeURIComponent(workspaceId)}`);
export const callAction = (action: string, payload: Record<string, unknown>) => apiRequest<{session?: CallRecord}>(`/api/meta/calling/action`, {method: 'POST', body: JSON.stringify({action, ...payload})});
