const crypto = require('node:crypto');
const fs = require('node:fs');
const { validPath } = require('./metaGraphClient');

const MEDIA_LIMITS = Object.freeze({ image: 5 * 1024 * 1024, audio: 16 * 1024 * 1024, video: 16 * 1024 * 1024, document: 100 * 1024 * 1024 });
const MIME_TYPES = new Map([
  ['image/jpeg', 'image'], ['image/png', 'image'],
  ['audio/aac', 'audio'], ['audio/amr', 'audio'], ['audio/mpeg', 'audio'], ['audio/ogg', 'audio'], ['audio/opus', 'audio'],
  ['video/3gpp', 'video'], ['video/mp4', 'video'],
  ['application/pdf', 'document'], ['application/msword', 'document'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ['application/vnd.ms-excel', 'document'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document'],
  ['application/vnd.ms-powerpoint', 'document'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document'], ['text/plain', 'document']
]);
const MEDIA_HOST_SUFFIXES = ['.facebook.com', '.fbcdn.net', '.fbsbx.com', '.whatsapp.net'];

class MetaMediaError extends Error {
  constructor(code, message = 'Meta media operation is unavailable') {
    super(message);
    this.name = 'MetaMediaError';
    this.code = code;
  }
}

function boundedId(value, code) {
  const id = String(value || '').trim();
  try { validPath([id]); } catch { throw new MetaMediaError(code); }
  return id;
}

function canonicalBase64(value) {
  const data = String(value || '').trim();
  if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new MetaMediaError('META_MEDIA_DATA_INVALID');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.toString('base64') !== data) throw new MetaMediaError('META_MEDIA_DATA_INVALID');
  return bytes;
}

function normalizeUpload(input = {}, limits = MEDIA_LIMITS) {
  const phoneNumberId = boundedId(input.phoneNumberId, 'META_MEDIA_NUMBER_INVALID');
  const mimeType = String(input.mimeType || '').trim().toLowerCase();
  const mediaType = MIME_TYPES.get(mimeType);
  const filename = String(input.filename || '').trim();
  if (!mediaType || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)) throw new MetaMediaError('META_MEDIA_METADATA_INVALID');
  const bytes = Buffer.isBuffer(input.bytes) ? Buffer.from(input.bytes) : canonicalBase64(input.data);
  const limit = Number(limits[mediaType]);
  if (!Number.isSafeInteger(limit) || limit < 1 || bytes.length > limit) throw new MetaMediaError('META_MEDIA_SIZE_INVALID');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return { phoneNumberId, mimeType, mediaType, filename, bytes, sizeBytes: bytes.length, sha256 };
}

function normalizeFileUpload(input = {}, limits = MEDIA_LIMITS) {
  const phoneNumberId = boundedId(input.phoneNumberId, 'META_MEDIA_NUMBER_INVALID');
  const mimeType = String(input.mimeType || '').trim().toLowerCase();
  const mediaType = MIME_TYPES.get(mimeType);
  const filename = String(input.filename || '').trim();
  const filePath = String(input.filePath || '');
  const sizeBytes = Number(input.sizeBytes);
  const sha256 = String(input.sha256 || '').trim().toLowerCase();
  if (!mediaType || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename) || !filePath || !require('node:path').isAbsolute(filePath) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || !/^[a-f0-9]{64}$/.test(sha256)) throw new MetaMediaError('META_MEDIA_DATA_INVALID');
  const limit = Number(limits[mediaType]);
  if (!Number.isSafeInteger(limit) || limit < 1 || sizeBytes > limit) throw new MetaMediaError('META_MEDIA_SIZE_INVALID');
  return { phoneNumberId, mimeType, mediaType, filename, filePath, sizeBytes, sha256 };
}

function providerUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !MEDIA_HOST_SUFFIXES.some(suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix))) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
  return url.toString();
}

async function readBoundedResponse(response, limit) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isSafeInteger(declared) && declared > limit) throw new MetaMediaError('META_MEDIA_DOWNLOAD_TOO_LARGE');
  if (response?.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > limit) throw new MetaMediaError('META_MEDIA_DOWNLOAD_TOO_LARGE');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }
  if (typeof response?.arrayBuffer === 'function') {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw new MetaMediaError('META_MEDIA_DOWNLOAD_TOO_LARGE');
    return bytes;
  }
  throw new MetaMediaError('META_MEDIA_DOWNLOAD_INVALID');
}

class MetaMediaService {
  constructor({ graphClient, limits = MEDIA_LIMITS, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
    if (!graphClient || typeof graphClient.request !== 'function') throw new TypeError('Meta Graph client is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('Media fetch implementation is required');
    this.graphClient = graphClient;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.min(30000, Math.max(1000, Number(timeoutMs) || 10000));
    this.limits = { ...MEDIA_LIMITS, ...limits };
  }

  async upload({ accessToken, phoneNumberId, mimeType, filename, data, bytes, filePath, sizeBytes, sha256 }) {
    let upload; let file;
    if (filePath !== undefined) {
      upload = normalizeFileUpload({ phoneNumberId, mimeType, filename, filePath, sizeBytes, sha256 }, this.limits);
      try {
        const stat = await fs.promises.stat(upload.filePath);
        if (!stat.isFile() || stat.size !== upload.sizeBytes || typeof fs.openAsBlob !== 'function') throw new Error('file is not available');
        file = await fs.openAsBlob(upload.filePath, { type: upload.mimeType });
      } catch { throw new MetaMediaError('META_MEDIA_DATA_INVALID'); }
    } else {
      upload = normalizeUpload({ phoneNumberId, mimeType, filename, data, bytes }, this.limits);
      file = new Blob([upload.bytes], { type: upload.mimeType });
    }
    const formData = new FormData();
    formData.set('messaging_product', 'whatsapp');
    formData.set('type', upload.mimeType);
    formData.set('file', file, upload.filename);
    const payload = await this.graphClient.request({ path: [upload.phoneNumberId, 'media'], accessToken, method: 'POST', formData });
    const mediaId = boundedId(payload?.id, 'META_MEDIA_RESPONSE_INVALID');
    return { mediaId, mimeType: upload.mimeType, mediaType: upload.mediaType, filename: upload.filename, sizeBytes: upload.sizeBytes, sha256: upload.sha256 };
  }

  async retrieve({ accessToken, mediaId }) {
    const id = boundedId(mediaId, 'META_MEDIA_ID_INVALID');
    const payload = await this.graphClient.request({ path: [id], accessToken });
    const responseId = boundedId(payload?.id || id, 'META_MEDIA_RESPONSE_INVALID');
    const mimeType = String(payload?.mime_type || '').trim().toLowerCase();
    if (!MIME_TYPES.has(mimeType)) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
    const sizeBytes = Number(payload?.file_size);
    const sha256 = String(payload?.sha256 || '').trim().toLowerCase();
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(sha256)) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
    return { mediaId: responseId, mimeType, mediaType: MIME_TYPES.get(mimeType), sizeBytes, sha256, url: providerUrl(payload?.url) };
  }

  async download({ accessToken, mediaId }) {
    const metadata = await this.retrieve({ accessToken, mediaId });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(metadata.url, { method: 'GET', redirect: 'error', headers: { authorization: `Bearer ${String(accessToken || '').trim()}` }, signal: controller.signal });
      if (!response?.ok) throw new MetaMediaError('META_MEDIA_DOWNLOAD_UNAVAILABLE');
      const contentType = String(response.headers?.get?.('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      if (contentType !== metadata.mimeType || !MIME_TYPES.has(contentType)) throw new MetaMediaError('META_MEDIA_DOWNLOAD_INVALID');
      const bytes = await readBoundedResponse(response, this.limits[metadata.mediaType]);
      if (metadata.sizeBytes !== bytes.length || crypto.createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new MetaMediaError('META_MEDIA_DOWNLOAD_INVALID');
      return { ...metadata, contentType, bytes };
    } catch (error) {
      if (error instanceof MetaMediaError) throw error;
      throw new MetaMediaError(error?.name === 'AbortError' ? 'META_MEDIA_DOWNLOAD_TIMEOUT' : 'META_MEDIA_DOWNLOAD_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }

  async remove({ accessToken, mediaId }) {
    const id = boundedId(mediaId, 'META_MEDIA_ID_INVALID');
    const payload = await this.graphClient.request({ path: [id], accessToken, method: 'DELETE' });
    if (payload?.success !== true) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
    return { mediaId: id, deleted: true };
  }
}

module.exports = { MetaMediaService, MetaMediaError, MEDIA_LIMITS, MIME_TYPES, normalizeUpload, normalizeFileUpload, providerUrl, readBoundedResponse };
