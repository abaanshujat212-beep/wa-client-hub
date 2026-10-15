/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';
import { InboxScreen } from './src/screens/InboxScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { ComposerScreen } from './src/screens/ComposerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { API_BASE_URL } from './src/config';
import { listWorkspaces, Workspace } from './src/services/workspaceService';

type Tab = 'Inbox' | 'Contacts' | 'Calls' | 'Settings';
const tabs: Tab[] = ['Inbox', 'Contacts', 'Calls', 'Settings'];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Inbox');
  const [authenticated, setAuthenticated] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => { (async () => { try { const credentials = await Keychain.getGenericPassword({service: 'wa-client-hub.session'}); setAuthenticated(Boolean(credentials)); } catch { setAuthenticated(false); } finally { setCheckingSession(false); } })(); }, []);
  if (checkingSession) return <View style={styles.content}><Text>Restoring secure session…</Text></View>;
  if (!authenticated) return <LoginScreen onSubmit={async (email, password) => {
    const response = await fetch(`${API_BASE_URL}/api/mobile/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Email or password is incorrect');
    try { await Keychain.setGenericPassword(email, JSON.stringify({accessToken: body.accessToken, user: body.user}), {service: 'wa-client-hub.session'}); } catch { /* Secure storage activates after a native rebuild. */ }
    setAuthenticated(true);
    const available = await listWorkspaces(); setWorkspaces(available.workspaces); setWorkspaceId(available.workspaces[0]?.id || '');
  }} />;
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.container}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>WA CLIENT HUB</Text><Text style={styles.title}>{activeTab}</Text></View><Text style={styles.online}>● Online</Text></View>
      <View style={styles.workspace}><Text style={styles.workspaceLabel}>Workspace</Text><Pressable onPress={() => { const current = workspaces.findIndex(w => w.id === workspaceId); const next = workspaces[(current + 1) % Math.max(workspaces.length, 1)]; if (next) setWorkspaceId(next.id); }}><Text style={styles.workspaceValue}>{workspaces.find(w => w.id === workspaceId)?.name || 'No workspace available'}</Text></Pressable></View>
      <View style={styles.content}>{activeTab === 'Inbox' ? <InboxScreen workspaceId={workspaceId} /> : activeTab === 'Contacts' ? <ContactsScreen workspaceId={workspaceId} /> : activeTab === 'Settings' ? <SettingsScreen onLogout={() => { setAuthenticated(false); setWorkspaceId(''); }} /> : <ComposerScreen />}</View>
      <View style={styles.nav}>{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected: activeTab === tab}} onPress={() => setActiveTab(tab)} style={[styles.navItem, activeTab === tab && styles.navItemActive]}><Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{tab}</Text></Pressable>)}</View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6faf8' },
  container: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 20, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#138b5b' },
  title: { fontSize: 30, fontWeight: '800', color: '#10251d', marginTop: 4 },
  online: { fontSize: 13, fontWeight: '700', color: '#167347' },
  workspace: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#dce9e2' },
  workspaceLabel: { fontSize: 12, color: '#6d7c75', marginBottom: 4 },
  workspaceValue: { fontSize: 16, fontWeight: '700', color: '#19382b' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 25 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#19382b', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: '#6d7c75' },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 6, marginBottom: 12, borderWidth: 1, borderColor: '#dce9e2' },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 11 },
  navItemActive: { backgroundColor: '#20a66d' },
  navText: { fontSize: 12, fontWeight: '700', color: '#6d7c75' },
  navTextActive: { color: '#fff' },
});

export default App;
