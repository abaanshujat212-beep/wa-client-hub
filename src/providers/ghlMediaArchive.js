const crypto = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });

// Only IDs recorded by this uploader are eligible for expiry deletion.
class GhlMediaArchive {
  constructor(sync) { this.sync = sync; this.nextCleanup = 0; }
  async upload(db, mapping, token, sourceKey, file, filename) {
    if (!mapping.scopes.includes('medias.write')) throw fail('GHL_MEDIA_SCOPE_MISSING');
    if (file.bytes.length > (file.contentType.startsWith('video/') ? 500 : 25) * 1024 * 1024) throw fail('GHL_MEDIA_TOO_LARGE');
    const key = `ghl-media:${mapping.location_id}`;
    await db.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    try {
      const prior = (await db.query('SELECT * FROM ghl_media_archive WHERE location_id=$1 AND source_key=$2', [mapping.location_id, sourceKey])).rows[0];
      if (prior?.state === 'ready' && new Date(prior.expires_at) > new Date()) return prior.url;
      if (prior) throw fail(prior.state === 'expired' || prior.state === 'ready' ? 'GHL_MEDIA_RETENTION_EXPIRED' : 'GHL_MEDIA_UPLOAD_UNCERTAIN');
      let folder = (await db.query('SELECT * FROM ghl_media_folders WHERE location_id=$1', [mapping.location_id])).rows[0];
      if (folder && folder.state !== 'ready') throw fail('GHL_MEDIA_FOLDER_UNCERTAIN');
      if (!folder) {
        await db.query("INSERT INTO ghl_media_folders(location_id,state) VALUES($1,'creating')", [mapping.location_id]);
        try {
          const result = await this.sync.request('/medias/folder', token, { altId: mapping.location_id, altType: 'location', name: '10x WA Hub — 3 month media' }, true);
          const id = result.id || result._id || result.folder?.id || result.folder?._id;
          if (!id) throw fail('GHL_MEDIA_FOLDER_RESPONSE_INVALID');
          folder = { folder_id: String(id) };
          await db.query("UPDATE ghl_media_folders SET folder_id=$2,state='ready',updated_at=now() WHERE location_id=$1", [mapping.location_id, folder.folder_id]);
        } catch (e) {
          if (/HTTP_4\d\d/.test(e.code || '')) await db.query('DELETE FROM ghl_media_folders WHERE location_id=$1', [mapping.location_id]);
          else await db.query("UPDATE ghl_media_folders SET state='uncertain' WHERE location_id=$1", [mapping.location_id]);
          throw e;
        }
      }
      const id = crypto.randomUUID();
      await db.query("INSERT INTO ghl_media_archive(id,installation_id,location_id,workspace_id,source_key,state) VALUES($1,$2,$3,$4,$5,'uploading')", [id,mapping.installation_id,mapping.location_id,mapping.workspace_id,sourceKey]);
      try {
        const form = new FormData();
        form.set('parentId', folder.folder_id); form.set('name', `${id}-${filename}`);
        form.set('file', new Blob([file.bytes], { type: file.contentType }), `${id}-${filename}`);
        const uploaded = await this.sync.request('/medias/upload-file', token, form, true, '2021-07-28');
        if (!uploaded.fileId || typeof uploaded.url !== 'string' || !uploaded.url.startsWith('https://')) throw fail('GHL_MEDIA_UPLOAD_INVALID');
        await db.query("UPDATE ghl_media_archive SET file_id=$2,url=$3,state='ready',expires_at=now()+interval '3 months',updated_at=now() WHERE id=$1", [id,uploaded.fileId,uploaded.url]);
        return uploaded.url;
      } catch (e) {
        if (/HTTP_4\d\d/.test(e.code || '')) await db.query('DELETE FROM ghl_media_archive WHERE id=$1', [id]);
        else await db.query("UPDATE ghl_media_archive SET state='uncertain' WHERE id=$1", [id]);
        throw e;
      }
    } finally { await db.query('SELECT pg_advisory_unlock(hashtext($1))', [key]); }
  }
  async cleanup() {
    if (Date.now() < this.nextCleanup) return;
    this.nextCleanup = Date.now() + 3600000;
    const rows = (await this.sync.pool.query("SELECT a.* FROM ghl_media_archive a WHERE a.state='ready' AND a.expires_at<=now() ORDER BY a.expires_at LIMIT 100")).rows;
    for (const row of rows) {
      try {
        const access = await this.sync.runtime.repository.getAccessToken({ installationId: row.installation_id, locationId: row.location_id, refresh: value => this.sync.runtime.client.refreshToken(value) });
        const query = new URLSearchParams({ altId: row.location_id, altType: 'location' });
        const response = await this.sync.fetchImpl(`${this.sync.runtime.client.config.apiUrl}/medias/${encodeURIComponent(row.file_id)}?${query}`, { method: 'DELETE', headers: { Authorization: `Bearer ${access.accessToken}`, Version: '2021-07-28' }, signal: AbortSignal.timeout(20000) });
        if (!response.ok && response.status !== 404) throw fail('GHL_MEDIA_EXPIRY_FAILED');
        await this.sync.pool.query("UPDATE ghl_media_archive SET state='expired',url=NULL,updated_at=now() WHERE id=$1", [row.id]);
      } catch { this.sync.logger.error?.('GHL media retention needs attention', { archiveId: row.id }); }
    }
  }
}
module.exports = { GhlMediaArchive };
