import React from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {useState} from 'react';
import {sendTextMessage} from '../services/messageService';

export function ComposerScreen({conversationId = ''}: {conversationId?: string}) {
  const [body, setBody] = useState(''); const [status, setStatus] = useState('');
  const send = async () => { if (!conversationId || !body.trim()) return; setStatus('Sending…'); try { await sendTextMessage(conversationId, body.trim(), `${Date.now()}-${Math.random()}`); setBody(''); setStatus('Sent'); } catch (e) { setStatus(e instanceof Error ? e.message : 'Send failed'); } };
  return <View><Text>Message composer</Text><TextInput value={body} onChangeText={setBody} placeholder="Write a message"/><Pressable onPress={send}><Text>Send</Text></Pressable><Text>{status}</Text></View>;
}
