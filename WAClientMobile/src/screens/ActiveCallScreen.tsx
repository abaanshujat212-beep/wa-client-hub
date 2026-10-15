import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {callAction} from '../services/callService';
export function ActiveCallScreen({sessionId}: {sessionId: string}) { const [muted, setMuted] = useState(false); const action = async (name: string) => { await callAction(name, {sessionId}); }; return <View><Text>Active call</Text><Text>{sessionId}</Text><Pressable onPress={async () => { setMuted(!muted); await action(muted ? 'unmute' : 'mute'); }}><Text>{muted ? 'Unmute' : 'Mute'}</Text></Pressable><Pressable onPress={() => action('end')}><Text>End call</Text></Pressable></View>; }
