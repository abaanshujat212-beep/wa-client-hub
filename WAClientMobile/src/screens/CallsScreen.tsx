import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {listCalls} from '../services/callService';
export function CallsScreen({workspaceId}: {workspaceId: string}) { const [calls, setCalls] = useState<unknown[]>([]); const [error, setError] = useState(''); useEffect(() => { if (workspaceId) listCalls(workspaceId).then(r => setCalls(r.sessions)).catch(e => setError(e.message)); }, [workspaceId]); return <View><Text>Calls</Text>{error ? <Text>{error}</Text> : calls.map((call, index) => <Text key={index}>{JSON.stringify(call)}</Text>)}</View>; }
