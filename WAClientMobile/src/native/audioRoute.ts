export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth';
export const audioRoute = {set: async (_route: AudioRoute) => {throw new Error('Native audio module is not configured');}, available: async () => [] as AudioRoute[]};
