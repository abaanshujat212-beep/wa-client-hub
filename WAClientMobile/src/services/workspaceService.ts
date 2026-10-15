import {apiRequest} from '../api/authenticatedClient';
export type Workspace = {id: string; name: string};
export const listWorkspaces = () => apiRequest<{workspaces: Workspace[]}>('/api/workspaces');
