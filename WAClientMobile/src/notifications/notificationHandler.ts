export type NotificationPayload = {type: 'message' | 'incoming_call' | 'call_update'; id: string; workspaceId: string};
export function handleNotification(payload: NotificationPayload, open: (path: string) => void) { if (payload.type === 'incoming_call') open(`/calls/${payload.id}`); else if (payload.type === 'message') open(`/inbox/${payload.id}`); }
