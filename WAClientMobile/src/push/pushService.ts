export type PushPayload = { type: 'message' | 'incoming_call' | 'call_update'; id: string; workspaceId: string };

export type PushService = {
  register: () => Promise<string>;
  unregister: () => Promise<void>;
  onMessage: (handler: (payload: PushPayload) => void) => () => void;
};

// Native FCM implementation will be injected here; push is only a hint and never the source of truth.
export function createPushService(): PushService {
  return {register: async () => { throw new Error('Push provider is not configured'); }, unregister: async () => {}, onMessage: () => () => {}};
}
