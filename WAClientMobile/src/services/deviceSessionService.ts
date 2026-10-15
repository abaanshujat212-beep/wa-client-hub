import {apiRequest} from '../api/authenticatedClient';
export type DeviceSession = {id: string; deviceName?: string; lastSeenAt?: string; current?: boolean};
export const listDeviceSessions = () => apiRequest<{sessions: DeviceSession[]}>('/api/mobile/devices');
export const revokeDeviceSession = (id: string) => apiRequest<{ok: boolean}>(`/api/mobile/devices/${encodeURIComponent(id)}`, {method: 'DELETE'});
