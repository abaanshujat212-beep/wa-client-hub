export type WebRtcAdapter = {connect: (signaling: unknown) => Promise<void>; disconnect: () => Promise<void>; setMuted: (muted: boolean) => Promise<void>};
export const webRtcAdapter: WebRtcAdapter = {connect: async () => {throw new Error('WebRTC provider is not configured');}, disconnect: async () => {}, setMuted: async () => {}};
