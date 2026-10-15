import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {searchContacts, Contact} from '../services/contactsService';

export function ContactsScreen({workspaceId = ''}: {workspaceId?: string}) {
  const [items, setItems] = useState<Contact[]>([]); const [error, setError] = useState('');
  useEffect(() => { if (!workspaceId) return; searchContacts(workspaceId).then(r => setItems(r.contacts)).catch(e => setError(e.message)); }, [workspaceId]);
  return <View><Text>Contacts</Text>{error ? <Text>{error}</Text> : !workspaceId ? <Text>Select a workspace to load contacts.</Text> : items.map(item => <Text key={item.id}>{item.displayName || item.phoneE164}</Text>)}</View>;
}
