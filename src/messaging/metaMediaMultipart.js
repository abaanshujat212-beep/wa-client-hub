const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 110 * 1024 * 1024;
const DEFAULT_MAX_PART_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 16 * 1024;
const DEFAULT_MAX_PARTS = 10;
const DEFAULT_FILE_MEMORY_BYTES = 8 * 1024 * 1024;

class MetaMediaMultipartError extends Error {
  constructor(code, message = 'Multipart media request is invalid') { super(message); this.name = 'MetaMediaMultipartError'; this.code = code; }
}
function boundaryFromContentType(contentType) {
  const value = String(contentType || '');
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(value)) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_TYPE_INVALID');
  const match = value.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i); const boundary = String(match?.[1] || match?.[2] || '');
  if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_BOUNDARY_INVALID');
  return boundary;
}
function headersFromBlock(block) {
  const headers = {};
  for (const line of block.toString('latin1').split('\r\n')) {
    const separator = line.indexOf(':'); if (separator <= 0) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_HEADERS_INVALID');
    const name = line.slice(0, separator).trim().toLowerCase(); const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/.test(name) || value.length > 4096 || headers[name]) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_HEADERS_INVALID');
    headers[name] = value;
  }
  const disposition = headers['content-disposition'] || ''; if (!/^form-data\s*;/i.test(disposition)) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_DISPOSITION_INVALID');
  const name = disposition.match(/(?:^|;)\s*name="([^"]{1,128})"/i)?.[1]; if (!name || /[\r\n]/.test(name)) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_NAME_INVALID');
  const filenameMatch = disposition.match(/(?:^|;)\s*filename="([^"]{0,256})"/i);
  return { name, filename: filenameMatch ? filenameMatch[1] : null, contentType: headers['content-type'] || 'text/plain' };
}
function writeAll(fd, chunk) { let offset = 0; while (offset < chunk.length) offset += fs.writeSync(fd, chunk, offset); }
function createSpill(storage) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-meta-media-')); const filePath = path.join(directory, 'part.bin'); const fd = fs.openSync(filePath, 'w'); storage.directories.add(directory); storage.paths.add(filePath); storage.descriptors.add(fd); return { directory, filePath, fd }; }
function appendPart(part, chunk, maxPartBytes, storage) {
  if (!chunk.length) return; const nextSize = part.size + chunk.length; if (nextSize > maxPartBytes) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_PART_TOO_LARGE');
  if (part.meta.filename !== null && !part.filePath && nextSize > storage.fileMemoryBytes) { const spill = createSpill(storage); for (const previous of part.chunks) writeAll(spill.fd, previous); part.chunks = null; part.filePath = spill.filePath; part.fd = spill.fd; }
  part.size = nextSize; part.hash.update(chunk); if (part.filePath) writeAll(part.fd, chunk); else part.chunks.push(Buffer.from(chunk));
}
async function parseMetaMediaMultipart(stream, contentType, options = {}) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new TypeError('Readable request stream is required');
  const boundary = boundaryFromContentType(contentType); const maxBytes = Number(options.maxBytes ?? DEFAULT_MAX_BYTES); const maxPartBytes = Number(options.maxPartBytes ?? DEFAULT_MAX_PART_BYTES); const maxHeaderBytes = Number(options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES); const maxParts = Number(options.maxParts ?? DEFAULT_MAX_PARTS); const fileMemoryBytes = Number(options.fileMemoryBytes ?? DEFAULT_FILE_MEMORY_BYTES); const maxPartBytesFor = options.maxPartBytesFor === undefined ? () => maxPartBytes : options.maxPartBytesFor;
  if (typeof maxPartBytesFor !== 'function' || ![maxBytes, maxPartBytes, maxHeaderBytes, maxParts].every(Number.isSafeInteger) || !Number.isSafeInteger(fileMemoryBytes) || maxBytes < 1 || maxPartBytes < 1 || maxHeaderBytes < 1 || maxParts < 1 || fileMemoryBytes < 0) throw new TypeError('Multipart limits are invalid');
  const opening = Buffer.from(`--${boundary}`); const marker = Buffer.from(`\r\n--${boundary}`); let buffer = Buffer.alloc(0); let total = 0; let state = 'opening'; let current = null; let ended = false; const parts = [];
  const storage = { fileMemoryBytes, paths: new Set(), directories: new Set(), descriptors: new Set(), cleaned: false };
  const cleanup = () => { if (storage.cleaned) return; storage.cleaned = true; for (const fd of storage.descriptors) { try { fs.closeSync(fd); } catch {} } for (const filePath of storage.paths) { try { fs.unlinkSync(filePath); } catch {} } for (const directory of storage.directories) { try { fs.rmdirSync(directory); } catch {} } };
  const currentLimit = () => { let limit; try { limit = Number(maxPartBytesFor(current.meta)); } catch { throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_LIMIT_INVALID'); } if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPartBytes) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_LIMIT_INVALID'); return limit; };
  const finishPart = () => { if (!current) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_STATE_INVALID'); if (current.fd !== undefined) { fs.closeSync(current.fd); storage.descriptors.delete(current.fd); current.fd = undefined; } const result = { ...current.meta, sizeBytes: current.size, sha256: current.hash.digest('hex') }; if (current.filePath) result.filePath = current.filePath; else result.data = Buffer.concat(current.chunks); parts.push(result); if (parts.length > maxParts) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_TOO_MANY_PARTS'); current = null; };
  const process = () => { while (true) { if (state === 'done') return; if (state === 'opening') { const index = buffer.indexOf(opening); if (index < 0) { if (buffer.length > opening.length) buffer = buffer.subarray(buffer.length - opening.length); return; } buffer = buffer.subarray(index + opening.length); state = 'openingSuffix'; } if (state === 'openingSuffix') { if (buffer.length < 2) return; if (buffer.subarray(0, 2).toString() === '--') { buffer = buffer.subarray(2); state = 'done'; ended = true; return; } if (buffer.subarray(0, 2).toString() !== '\r\n') throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_BOUNDARY_INVALID'); buffer = buffer.subarray(2); state = 'headers'; } if (state === 'headers') { const end = buffer.indexOf(Buffer.from('\r\n\r\n')); if (end < 0) { if (buffer.length > maxHeaderBytes) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_HEADERS_TOO_LARGE'); return; } current = { meta: headersFromBlock(buffer.subarray(0, end)), chunks: [], hash: createHash('sha256'), size: 0 }; buffer = buffer.subarray(end + 4); state = 'body'; } if (state === 'body') { const index = buffer.indexOf(marker); if (index < 0) { const keep = Math.min(buffer.length, marker.length); appendPart(current, buffer.subarray(0, buffer.length - keep), currentLimit(), storage); buffer = buffer.subarray(buffer.length - keep); return; } appendPart(current, buffer.subarray(0, index), currentLimit(), storage); buffer = buffer.subarray(index + marker.length); finishPart(); state = 'boundarySuffix'; } if (state === 'boundarySuffix') { if (buffer.length < 2) return; if (buffer.subarray(0, 2).toString() === '--') { buffer = buffer.subarray(2); state = 'done'; ended = true; return; } if (buffer.subarray(0, 2).toString() !== '\r\n') throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_BOUNDARY_INVALID'); buffer = buffer.subarray(2); state = 'headers'; } } };
  try { for await (const chunk of stream) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += value.length; if (total > maxBytes) throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_TOO_LARGE'); buffer = Buffer.concat([buffer, value]); process(); } process(); if (!ended || state !== 'done') throw new MetaMediaMultipartError('META_MEDIA_MULTIPART_TRUNCATED'); const fields = {}; const files = []; for (const part of parts) { if (part.filename !== null) files.push(part); else if (fields[part.name] === undefined) fields[part.name] = part.data.toString('utf8'); else if (Array.isArray(fields[part.name])) fields[part.name].push(part.data.toString('utf8')); else fields[part.name] = [fields[part.name], part.data.toString('utf8')]; } return { fields, files, totalBytes: total, cleanup }; } catch (error) { cleanup(); throw error; }
}
module.exports = { MetaMediaMultipartError, boundaryFromContentType, parseMetaMediaMultipart, DEFAULT_MAX_BYTES, DEFAULT_MAX_PART_BYTES, DEFAULT_FILE_MEMORY_BYTES };
