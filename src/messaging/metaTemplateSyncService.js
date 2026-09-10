const { MetaGraphError } = require('./metaGraphClient');
const { MetaTemplateSyncError } = require('./metaTemplateSyncRepository');

const STATUSES = new Set(['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'ARCHIVED']);
const CATEGORIES = new Set(['AUTHENTICATION', 'MARKETING', 'UTILITY']);
const FORMATS = new Set(['POSITIONAL', 'NAMED']);

function payloadError() {
  return new MetaTemplateSyncError('META_TEMPLATE_PAYLOAD_INVALID', 'Meta returned an invalid template catalog');
}

function normalizeRemoteTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw payloadError();
  const officialTemplateId = String(input.id || '').trim();
  const name = String(input.name || '').trim();
  const language = String(input.language || '').trim();
  const status = String(input.status || '').trim().toUpperCase();
  const category = String(input.category || '').trim().toUpperCase();
  const parameterFormat = String(input.parameter_format || 'POSITIONAL').trim().toUpperCase();
  if (!officialTemplateId || officialTemplateId.length > 256 || !/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language) || !STATUSES.has(status) || !CATEGORIES.has(category) || !FORMATS.has(parameterFormat) || !Array.isArray(input.components)) throw payloadError();
  let components;
  try {
    const encoded = JSON.stringify(input.components);
    if (!encoded || encoded.length > 100000) throw payloadError();
    components = JSON.parse(encoded);
  } catch (error) {
    if (error instanceof MetaTemplateSyncError) throw error;
    throw payloadError();
  }
  return { officialTemplateId, name, language, status, category, parameterFormat, components };
}

class MetaTemplateSyncService {
  constructor({ repository, graphClient, maxPages = 20, pageSize = 100 } = {}) {
    if (!repository || typeof repository.target !== 'function' || typeof repository.replace !== 'function') throw new TypeError('template repository is required');
    if (!graphClient || typeof graphClient.request !== 'function') throw new TypeError('Meta Graph client is required');
    this.repository = repository;
    this.graphClient = graphClient;
    this.maxPages = Math.min(20, Math.max(1, Number(maxPages) || 20));
    this.pageSize = Math.min(100, Math.max(1, Number(pageSize) || 100));
  }

  async sync(scope) {
    const target = await this.repository.target(scope);
    const templates = [];
    const seen = new Set();
    let after = null;
    for (let page = 0; page < this.maxPages; page += 1) {
      let payload;
      try {
        payload = await this.graphClient.request({
          path: [target.wabaId, 'message_templates'],
          accessToken: target.accessToken,
          query: { fields: 'id,name,language,status,category,parameter_format,components', limit: this.pageSize, after }
        });
      } catch (error) {
        if (error instanceof MetaGraphError) throw error;
        throw new MetaTemplateSyncError('META_TEMPLATE_SYNC_UNAVAILABLE');
      }
      if (!payload || !Array.isArray(payload.data)) throw payloadError();
      for (const raw of payload.data) {
        const template = normalizeRemoteTemplate(raw);
        const key = `${template.name}\u0000${template.language}`;
        if (seen.has(key)) throw payloadError();
        seen.add(key);
        templates.push(template);
        if (templates.length > 2000) throw payloadError();
      }
      const cursor = payload.paging?.cursors?.after;
      if (!cursor || !payload.paging?.next) return { templates: await this.repository.replace(scope, templates), count: templates.length };
      after = String(cursor);
      if (!after || after.length > 2048) throw payloadError();
    }
    throw new MetaTemplateSyncError('META_TEMPLATE_PAGE_LIMIT');
  }

  async list(scope) {
    return { templates: await this.repository.list(scope) };
  }
}

module.exports = { MetaTemplateSyncService, normalizeRemoteTemplate };
