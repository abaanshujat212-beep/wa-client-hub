export type CallState = 'idle' | 'ringing' | 'connecting' | 'active' | 'ending' | 'ended' | 'failed';
export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth';

export type CallSnapshot = { state: CallState; callId?: string; remoteNumber?: string; startedAt?: number; audioRoute: AudioRoute; muted: boolean };

export function createCallManager(onChange: (snapshot: CallSnapshot) => void) {
  let snapshot: CallSnapshot = {state: 'idle', audioRoute: 'earpiece', muted: false};
  const update = (next: Partial<CallSnapshot>) => { snapshot = {...snapshot, ...next}; onChange(snapshot); };
  return {
    getSnapshot: () => snapshot,
    startOutgoing: (callId: string, remoteNumber: string) => update({state: 'connecting', callId, remoteNumber, startedAt: Date.now()}),
    markActive: () => update({state: 'active', startedAt: snapshot.startedAt || Date.now()}),
    setAudioRoute: (audioRoute: AudioRoute) => update({audioRoute}),
    setMuted: (muted: boolean) => update({muted}),
    end: () => update({state: 'ending'}),
    reset: () => update({state: 'idle', callId: undefined, remoteNumber: undefined, startedAt: undefined, muted: false}),
  };
}
