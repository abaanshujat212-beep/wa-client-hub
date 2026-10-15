import * as Keychain from 'react-native-keychain';
const SERVICE = 'wa-client-hub.session';
export async function readAccessToken() { try { const value = await Keychain.getGenericPassword({service: SERVICE}); if (!value) return null; return JSON.parse(value.password).accessToken || null; } catch { return null; } }
export async function clearSession() { try { await Keychain.resetGenericPassword({service: SERVICE}); } catch { /* Native keychain unavailable until a native rebuild. */ } }
