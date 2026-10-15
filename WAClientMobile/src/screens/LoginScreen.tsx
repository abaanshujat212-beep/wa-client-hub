import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';

export function LoginScreen({onSubmit}: {onSubmit: (email: string, password: string) => Promise<void>}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => { setError(''); setBusy(true); try { await onSubmit(email.trim(), password); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); } finally { setBusy(false); } };
  return <View style={{flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f6faf8'}}>
    <Text style={{fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: '#138b5b'}}>WA CLIENT HUB</Text>
    <Text style={{fontSize: 32, fontWeight: '800', color: '#10251d', marginTop: 8, marginBottom: 24}}>Welcome back</Text>
    <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} style={styles.input}/>
    <View style={styles.passwordRow}><TextInput secureTextEntry={!showPassword} placeholder="Password" value={password} onChangeText={setPassword} style={styles.passwordInput}/><Pressable onPress={() => setShowPassword(value => !value)}><Text>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View>
    {!!error && <Text style={styles.error}>{error}</Text>}
    <Pressable disabled={busy || !email || !password} onPress={submit} style={[styles.button, (busy || !email || !password) && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text></Pressable>
  </View>;
}

const styles = {input: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce9e2', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16} as const, passwordRow: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce9e2', borderRadius: 12, paddingLeft: 14, paddingRight: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center'} as const, passwordInput: {flex: 1, paddingVertical: 14, fontSize: 16} as const, button: {backgroundColor: '#20a66d', borderRadius: 12, padding: 15, alignItems: 'center'} as const, disabled: {opacity: 0.45} as const, buttonText: {color: '#fff', fontWeight: '800'} as const, error: {color: '#b42318', marginBottom: 12} as const};
