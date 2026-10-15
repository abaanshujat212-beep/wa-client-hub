import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {sendTextMessage} from '../services/messageService';
export function ChatScreen({conversationId}: {conversationId: string}) { const [body, setBody] = useState(''); const [status, setStatus] = useState(''); const send = async () => { if (!body.trim()) return; try { await sendTextMessage(conversationId, body.trim(), `${Date.now()}`); setBody(''); setStatus('Sent'); } catch (e) { setStatus(e instanceof Error ? e.message : 'Send failed'); } }; return <View><Text>Chat</Text><TextInput value={body} onChangeText={setBody} placeholder="Message"/><Pressable onPress={send}><Text>Send</Text></Pressable><Text>{status}</Text></View>; }
