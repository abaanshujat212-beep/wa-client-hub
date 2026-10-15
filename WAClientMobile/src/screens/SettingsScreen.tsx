import React from 'react';
import {Pressable, Text, View} from 'react-native';
import * as Keychain from 'react-native-keychain';

export function SettingsScreen({onLogout}: {onLogout?: () => void}) {
  const logout = async () => { await Keychain.resetGenericPassword({service: 'wa-client-hub.session'}); onLogout?.(); };
  return <View><Text>Settings</Text><Text>Notifications, audio permissions, device sessions and app diagnostics.</Text><Pressable onPress={logout}><Text>Log out</Text></Pressable></View>;
}
