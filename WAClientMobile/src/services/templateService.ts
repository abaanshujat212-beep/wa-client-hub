import {apiRequest} from '../api/authenticatedClient';
import {Template} from '../types/api';
export const listTemplates = (connectionId: string) => apiRequest<{templates: Template[]}>(`/api/meta/templates/${encodeURIComponent(connectionId)}`);
