export type PushEvent = {type: string; id: string; workspaceId: string};
export const fcmAdapter = {register: async () => {throw new Error('FCM is not configured');}, unregister: async () => {}, subscribe: (_handler: (event: PushEvent) => void) => () => {}};
