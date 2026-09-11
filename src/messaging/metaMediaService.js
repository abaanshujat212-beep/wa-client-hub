const crypto = require('node:crypto');
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

function providerUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID'); }
  if (url.protocol !== 'https:' || !MEDIA_HOST_SUFFIXES.some(suffix => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix))) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
  return url.toString();
}

class MetaMediaService {
  constructor({ graphClient, limits = MEDIA_LIMITS } = {}) {
    if (!graphClient || typeof graphClient.request !== 'function') throw new TypeError('Meta Graph client is required');
    this.graphClient = graphClient;
    this.limits = { ...MEDIA_LIMITS, ...limits };
  }

  async upload({ accessToken, phoneNumberId, mimeType, filename, data, bytes }) {
    const upload = normalizeUpload({ phoneNumberId, mimeType, filename, data, bytes }, this.limits);
    const formData = new FormData();
    formData.set('messaging_product', 'whatsapp');
    formData.set('type', upload.mimeType);
    formData.set('file', new Blob([upload.bytes], { type: upload.mimeType }), upload.filename);
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

  async remove({ accessToken, mediaId }) {
    const id = boundedId(mediaId, 'META_MEDIA_ID_INVALID');
    const payload = await this.graphClient.request({ path: [id], accessToken, method: 'DELETE' });
    if (payload?.success !== true) throw new MetaMediaError('META_MEDIA_RESPONSE_INVALID');
    return { mediaId: id, deleted: true };
  }
}

module.exports = { MetaMediaService, MetaMediaError, MEDIA_LIMITS, MIME_TYPES, normalizeUpload, providerUrl };
