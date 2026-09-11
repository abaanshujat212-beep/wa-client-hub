const { validPath } = require('./metaGraphClient');

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document']);

class MediaReferenceError extends Error {
  constructor(code, message = 'Media reference is invalid') {
    super(message);
    this.name = 'MediaReferenceError';
    this.code = code;
    this.status = 400;
  }
}

function normalizeMediaReference(input = {}) {
  const mediaId = String(input.mediaId || '').trim();
  const type = String(input.type || '').trim().toLowerCase();
  try { validPath([mediaId]); } catch { throw new MediaReferenceError('MEDIA_REFERENCE_INVALID'); }
  if (!MEDIA_TYPES.has(type)) throw new MediaReferenceError('MEDIA_REFERENCE_INVALID');
  const caption = input.caption == null ? null : String(input.caption).trim();
  if (caption !== null && (caption.length === 0 || caption.length > 1024 || type === 'audio')) throw new MediaReferenceError('MEDIA_CAPTION_INVALID');
  const filename = input.filename == null ? null : String(input.filename).trim();
  if (filename !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)) throw new MediaReferenceError('MEDIA_FILENAME_INVALID');
  const sizeBytes = input.sizeBytes == null ? null : Number(input.sizeBytes);
  if (sizeBytes !== null && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)) throw new MediaReferenceError('MEDIA_REFERENCE_INVALID');
  const sha256 = input.sha256 == null ? null : String(input.sha256).trim().toLowerCase();
  if (sha256 !== null && !/^[a-f0-9]{64}$/.test(sha256)) throw new MediaReferenceError('MEDIA_REFERENCE_INVALID');
  return { mediaId, type, caption, filename, sizeBytes, sha256 };
}

module.exports = { MEDIA_TYPES, MediaReferenceError, normalizeMediaReference };
