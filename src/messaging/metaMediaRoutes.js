const { validCsrf, validateOrigin } = require('./metaSignupRoutes');
const { validId } = require('./metaTemplateSyncRoutes');
const { MEDIA_LIMITS, MIME_TYPES } = require('./metaMediaService');
const { parseMetaMediaMultipart } = require('./metaMediaMultipart');

const MULTIPART_LIMITS = Object.freeze({ maxBytes: 110 * 1024 * 1024, maxPartBytes: 100 * 1024 * 1024, fileMemoryBytes: 8 * 1024 * 1024 });

function multipartPartLimit(part) {
  const mediaType = MIME_TYPES.get(String(part?.contentType || '').trim().toLowerCase());
  return mediaType ? MEDIA_LIMITS[mediaType] : MULTIPART_LIMITS.maxPartBytes;
}

function mapError(error) {
  const code = String(error?.code || '');
  if (code === 'META_MEDIA_TARGET_NOT_FOUND') return { status: 404, body: { error: 'Meta media target not found', code } };
  if (code === 'META_CREDENTIALS_UNAVAILABLE') return { status: 409, body: { error: 'Meta credentials are unavailable', code } };
  if (code === 'META_MEDIA_MULTIPART_TOO_LARGE' || code === 'META_MEDIA_MULTIPART_PART_TOO_LARGE' || code === 'META_MEDIA_MULTIPART_HEADERS_TOO_LARGE' || code === 'META_MEDIA_DOWNLOAD_TOO_LARGE') return { status: 413, body: { error: 'Meta media request is too large', code: 'META_MEDIA_REQUEST_TOO_LARGE' } };
  if (code.startsWith('META_MEDIA_MULTIPART_')) return { status: 400, body: { error: 'Invalid Meta media multipart request', code: 'META_MEDIA_MULTIPART_INVALID' } };
  if (code === 'META_MEDIA_ID_INVALID' || code === 'META_MEDIA_NUMBER_INVALID' || code === 'META_MEDIA_METADATA_INVALID' || code === 'META_MEDIA_DATA_INVALID' || code === 'META_MEDIA_SIZE_INVALID' || code === 'META_MEDIA_RESPONSE_INVALID' || code === 'META_MEDIA_DOWNLOAD_INVALID') return { status: 400, body: { error: 'Meta media request is invalid', code } };
  if (code.startsWith('META_HTTP_') || code === 'META_TIMEOUT' || code === 'META_NETWORK_ERROR' || code === 'META_MEDIA_DOWNLOAD_TIMEOUT' || code === 'META_MEDIA_DOWNLOAD_UNAVAILABLE') return { status: 503, body: { error: 'Meta media service is temporarily unavailable', code: 'META_MEDIA_UNAVAILABLE' } };
  return { status: 503, body: { error: 'Meta media service is temporarily unavailable', code: 'META_MEDIA_UNAVAILABLE' } };
}

function exactScope(body) { return Boolean(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 2 && validId(body.workspaceId) && validId(body.numberId)); }
function validUpload(body) { return Boolean(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 5 && validId(body.workspaceId) && validId(body.numberId) && typeof body.mimeType === 'string' && typeof body.filename === 'string' && typeof body.data === 'string'); }
function validMultipartUpload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validId(body.workspaceId) || !validId(body.numberId) || typeof body.mimeType !== 'string' || typeof body.filename !== 'string') return false;
  const base = ['workspaceId', 'numberId', 'mimeType', 'filename'];
  const keys = Object.keys(body);
  if (Buffer.isBuffer(body.bytes)) return keys.length === 5 && keys.every(key => [...base, 'bytes'].includes(key));
  return keys.length === 7 && keys.every(key => [...base, 'filePath', 'sizeBytes', 'sha256'].includes(key)) && typeof body.filePath === 'string' && Number.isSafeInteger(body.sizeBytes) && /^[a-f0-9]{64}$/.test(String(body.sha256 || ''));
}

function createMetaMediaRouter({ enabled = false, pool, repository, service, origin } = {}) {
  const express = require('express'); const router = express.Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (enabled !== true) { router.use((_req, res) => res.status(404).json({ error: 'Not found' })); return router; }
  if (!validateOrigin(origin) || typeof pool?.query !== 'function' || typeof repository?.target !== 'function' || typeof service?.upload !== 'function' || typeof service?.retrieve !== 'function' || typeof service?.download !== 'function' || typeof service?.remove !== 'function') throw new TypeError('Enabled Meta media dependencies are required');
  async function actor(req, res) { if (!validId(req.params.connectionId) || typeof req.session?.userId !== 'string' || !req.session.userId || typeof req.sessionID !== 'string' || !req.sessionID) { res.status(401).json({ error: 'Please sign in' }); return null; } try { const row = (await pool.query('SELECT id FROM users WHERE id=$1 AND active=true', [req.session.userId])).rows[0]; if (!row) { res.status(401).json({ error: 'Please sign in' }); return null; } return row; } catch { res.status(503).json({ error: 'Meta media service is temporarily unavailable', code: 'META_MEDIA_UNAVAILABLE' }); return null; } }
  async function scope(req, res, body) { const current = await actor(req, res); if (!current) return null; const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''; const numberId = typeof body?.numberId === 'string' ? body.numberId : ''; if (!exactScope({ workspaceId, numberId })) { res.status(400).json({ error: 'Exact workspace and number scope is required' }); return null; } try { return await repository.target({ actorId: current.id, workspaceId, connectionId: req.params.connectionId, numberId }); } catch (error) { const mapped = mapError(error); res.status(mapped.status).json(mapped.body); return null; } }
  const writeGuard = (req, res, next) => { if (req.get('origin') !== origin || !validCsrf(req.session?.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' }); if (!req.is('application/json') && !req.is('multipart/form-data')) return res.status(415).json({ error: 'JSON or multipart body required' }); next(); };
  const parseUploadBody = (req, res, next) => { if (!req.is('multipart/form-data')) { if (req.body !== undefined) return next(); return express.json({ limit: '140mb', strict: true })(req, res, next); } parseMetaMediaMultipart(req, req.get('content-type'), { ...MULTIPART_LIMITS, maxPartBytesFor: multipartPartLimit }).then(parsed => { if (Object.keys(parsed.fields).length !== 2 || !exactScope(parsed.fields) || parsed.files.length !== 1 || parsed.files[0].name !== 'file') { parsed.cleanup(); const error = new Error('Invalid multipart upload'); error.code = 'META_MEDIA_MULTIPART_FIELDS_INVALID'; throw error; } const file = parsed.files[0]; req.metaMediaMultipartCleanup = parsed.cleanup; req.body = { ...parsed.fields, mimeType: file.contentType, filename: file.filename }; if (file.filePath) Object.assign(req.body, { filePath: file.filePath, sizeBytes: file.sizeBytes, sha256: file.sha256 }); else req.body.bytes = file.data; next(); }).catch(error => { const mapped = mapError(error); res.status(mapped.status).json(mapped.body); }); };
  router.post('/', writeGuard, parseUploadBody, async (req, res) => { if (!validUpload(req.body) && !validMultipartUpload(req.body)) { req.metaMediaMultipartCleanup?.(); return res.status(400).json({ error: 'workspaceId, numberId, and a valid media upload are required' }); } const target = await scope(req, res, req.body); if (!target) { req.metaMediaMultipartCleanup?.(); return; } try { const result = await service.upload({ accessToken: target.accessToken, phoneNumberId: target.phoneNumberId, mimeType: req.body.mimeType, filename: req.body.filename, data: req.body.data, bytes: req.body.bytes, filePath: req.body.filePath, sizeBytes: req.body.sizeBytes, sha256: req.body.sha256 }); res.status(201).json(result); } catch (error) { const mapped = mapError(error); res.status(mapped.status).json(mapped.body); } finally { req.metaMediaMultipartCleanup?.(); } });
  router.get('/:mediaId/content', async (req, res) => { const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : ''; const numberId = typeof req.query.numberId === 'string' ? req.query.numberId : ''; const target = await scope(req, res, { workspaceId, numberId }); if (!target) return; try { const result = await service.download({ accessToken: target.accessToken, mediaId: req.params.mediaId }); res.set('Content-Type', result.contentType); res.set('Content-Length', String(result.bytes.length)); return res.status(200).send(result.bytes); } catch (error) { const mapped = mapError(error); return res.status(mapped.status).json(mapped.body); } });
  router.get('/:mediaId', async (req, res) => { const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : ''; const numberId = typeof req.query.numberId === 'string' ? req.query.numberId : ''; const target = await scope(req, res, { workspaceId, numberId }); if (!target) return; try { const { url: _temporaryUrl, ...result } = await service.retrieve({ accessToken: target.accessToken, mediaId: req.params.mediaId }); res.json(result); } catch (error) { const mapped = mapError(error); res.status(mapped.status).json(mapped.body); } });
  router.delete('/:mediaId', writeGuard, async (req, res) => { if (!exactScope(req.body)) return res.status(400).json({ error: 'Exact workspace and number scope is required' }); const target = await scope(req, res, req.body); if (!target) return; try { res.json(await service.remove({ accessToken: target.accessToken, mediaId: req.params.mediaId })); } catch (error) { const mapped = mapError(error); res.status(mapped.status).json(mapped.body); } });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => { const large = error?.type === 'entity.too.large'; res.status(large ? 413 : 400).json({ error: large ? 'Meta media request is too large' : 'Invalid Meta media request' }); });
  return router;
}
module.exports = { createMetaMediaRouter, exactScope, validUpload, validMultipartUpload, mapError, multipartPartLimit };
