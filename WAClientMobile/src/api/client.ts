export type ApiConfig = { baseUrl: string; getAccessToken: () => Promise<string | null> };

export function createApiClient(config: ApiConfig) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await config.getAccessToken();
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json() as Promise<T>;
  };
}
