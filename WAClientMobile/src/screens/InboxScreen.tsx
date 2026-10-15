import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {listConversations, Conversation} from '../services/inboxService';

export function InboxScreen({workspaceId = ''}: {workspaceId?: string}) {
  const [items, setItems] = useState<Conversation[]>([]); const [error, setError] = useState('');
  useEffect(() => { if (!workspaceId) return; listConversations(workspaceId).then(r => setItems(r.conversations)).catch(e => setError(e.message)); }, [workspaceId]);
  if (!workspaceId) return <View><Text>Inbox</Text><Text>Select a workspace to load conversations.</Text></View>;
  return <View><Text>Inbox</Text>{error ? <Text>{error}</Text> : !items.length ? <ActivityIndicator /> : items.map(item => <Text key={item.id}>{item.preview || item.contactId || item.id}</Text>)}</View>;
}
