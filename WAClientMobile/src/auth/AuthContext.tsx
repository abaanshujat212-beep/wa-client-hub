import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import * as Keychain from 'react-native-keychain';
import {API_BASE_URL} from '../config';
import {clearSession} from './tokenStore';

type User = {id: string; email: string; role: string};
type AuthContextValue = {user: User | null; loading: boolean; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>};
const AuthContext = createContext<AuthContextValue | null>(null);
const service = 'wa-client-hub.session';

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { Keychain.getGenericPassword({service}).then(async value => { if (!value) return; try { const saved = JSON.parse(value.password); const response = await fetch(`${API_BASE_URL}/api/mobile/session`, {headers: {Authorization: `Bearer ${saved.accessToken}`}}); if (response.ok) setUser((await response.json()).user); else await clearSession(); } catch { await clearSession(); } }).catch(() => {}).finally(() => setLoading(false)); }, []);
  const value = useMemo<AuthContextValue>(() => ({user, loading, signIn: async (email, password) => { const response = await fetch(`${API_BASE_URL}/api/mobile/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})}); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Email or password is incorrect'); try { await Keychain.setGenericPassword(email, JSON.stringify({accessToken: body.accessToken, user: body.user}), {service}); } catch {} setUser(body.user); }, signOut: async () => { await clearSession(); setUser(null); }}), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
