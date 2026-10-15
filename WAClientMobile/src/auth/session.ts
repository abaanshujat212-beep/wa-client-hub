export type Session = { accessToken: string; refreshToken: string; expiresAt: number };

// Storage adapter is intentionally injected so production can use encrypted native storage.
export type SessionStore = { read: () => Promise<Session | null>; write: (session: Session) => Promise<void>; clear: () => Promise<void> };

export function createSessionManager(store: SessionStore) {
  return {
    getAccessToken: async () => {
      const session = await store.read();
      if (!session || session.expiresAt <= Date.now()) return null;
      return session.accessToken;
    },
    save: store.write,
    logout: store.clear,
  };
}
