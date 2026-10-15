const values = new Map<string, unknown>();
export const cache = {get: <T>(key: string) => values.get(key) as T | undefined, set: (key: string, value: unknown) => values.set(key, value), remove: (key: string) => values.delete(key), clear: () => values.clear()};
