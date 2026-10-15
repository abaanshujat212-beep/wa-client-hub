import {apiRequest} from '../api/authenticatedClient';
export type MobileSession = {authenticated: boolean; user: {id: string; email: string; role: string}};
export const validateSession = () => apiRequest<MobileSession>('/api/mobile/session');
