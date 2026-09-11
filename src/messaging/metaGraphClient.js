class MetaGraphError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super('Meta Graph request failed');
    this.name = 'MetaGraphError';
    this.code = code;
    this.providerStatus = status;
    this.retryable = retryable;
  }
}

function validVersion(value) {
  const version = String(value || '').trim();
  if (!/^v\d+\.\d+$/.test(version)) throw new MetaGraphError('META_GRAPH_VERSION_REQUIRED');
  return version;
}

function validPath(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.some(part => !/^[A-Za-z0-9._-]+$/.test(String(part)))) throw new TypeError('Meta Graph path segments are invalid');
  return parts.map(String).join('/');
}

function validQuery(input) {
  if (input == null) return '';
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Meta Graph query is invalid');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) throw new TypeError('Meta Graph query is invalid');
    if (value == null || value === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError('Meta Graph query is invalid');
    const normalized = String(value);
    if (normalized.length > 4096) throw new TypeError('Meta Graph query is invalid');
    query.set(key, normalized);
  }
  const value = query.toString();
  return value ? `?${value}` : '';
}

function classify(status) {
  if (status === 429) return new MetaGraphError('META_HTTP_429', { status, retryable: true });
  if (status >= 500) return new MetaGraphError(`META_HTTP_${status}`, { status, retryable: true });
  return new MetaGraphError(`META_HTTP_${status}`, { status, retryable: false });
}

class MetaGraphClient {
  constructor({ graphVersion, fetchImpl = globalThis.fetch, baseUrl = 'https://graph.facebook.com', timeoutMs = 10000, maxRetries = 2, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');
    this.graphVersion = String(graphVersion || '').trim();
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.timeoutMs = Math.min(30000, Math.max(1000, Number(timeoutMs) || 10000));
    this.maxRetries = Math.min(3, Math.max(0, Number(maxRetries) || 0));
    this.sleep = sleep;
  }

  async request({ path, accessToken, method = 'GET', body = null, formData = null, query = null }) {
    if (body !== null && formData !== null) throw new TypeError('Meta Graph request body is ambiguous');
    const token = String(accessToken || '').trim();
    if (!token) throw new MetaGraphError('META_ACCESS_TOKEN_REQUIRED');
    const url = `${this.baseUrl}/${validVersion(this.graphVersion)}/${validPath(path)}${validQuery(query)}`;
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers = { authorization: `Bearer ${token}` };
        const requestBody = formData !== null ? formData : body === null ? undefined : JSON.stringify(body);
        if (formData === null && body !== null) headers['content-type'] = 'application/json';
        const response = await this.fetch(url, { method, headers, body: requestBody, signal: controller.signal });
        let payload = null;
        try { payload = await response.json(); } catch {}
        if (response.ok) return payload;
        const error = classify(response.status);
        if (!error.retryable || attempt >= this.maxRetries) throw error;
      } catch (error) {
        const safe = error instanceof MetaGraphError ? error : new MetaGraphError(error?.name === 'AbortError' ? 'META_TIMEOUT' : 'META_NETWORK_ERROR', { retryable: true });
        if (!safe.retryable || attempt >= this.maxRetries) throw safe;
      } finally { clearTimeout(timer); }
      await this.sleep(Math.min(2000, 250 * (2 ** attempt)));
    }
  }
}

module.exports = { MetaGraphClient, MetaGraphError, validVersion, validPath, validQuery, classify };
