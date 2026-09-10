class TemplateError extends Error {
  constructor(code, message = 'WhatsApp template is invalid or unavailable') {
    super(message);
    this.name = 'TemplateError';
    this.code = code;
    this.status = 409;
  }
}

function normalizeParameter(value) {
  if (value === null || value === undefined || Array.isArray(value)) {
    throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
  }
  let rawText;
  let parameterName = null;
  if (typeof value === 'object') {
    if (!Object.prototype.hasOwnProperty.call(value, 'text')) throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
    rawText = value.text;
    const rawName = value.parameterName ?? value.parameter_name;
    if (rawName !== undefined && rawName !== null && rawName !== '') parameterName = String(rawName).trim();
  } else {
    rawText = value;
  }
  if (!['string', 'number'].includes(typeof rawText) || (typeof rawText === 'number' && !Number.isFinite(rawText))) {
    throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
  }
  const text = String(rawText).trim();
  if (!text || text.length > 1024 || (parameterName && !/^[a-z][a-z0-9_]{0,63}$/.test(parameterName))) {
    throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
  }
  return { type: 'text', text, ...(parameterName ? { parameter_name: parameterName } : {}) };
}

function normalizeTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TemplateError('TEMPLATE_INVALID');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const language = typeof input.language === 'string' ? input.language.trim() : '';
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new TemplateError('TEMPLATE_INVALID');
  }
  if (input.parameters !== undefined && !Array.isArray(input.parameters)) throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
  const parameters = (input.parameters || []).map(normalizeParameter);
  if (parameters.length > 20) throw new TemplateError('TEMPLATE_PARAMETERS_INVALID');
  return { name, language, components: parameters.length ? [{ type: 'body', parameters }] : [] };
}

function approvedBodySpec(approved) {
  const components = Array.isArray(approved?.components) ? approved.components : [];
  const body = components.find(component => String(component?.type || '').toUpperCase() === 'BODY');
  if (!body) return { count: 0, names: [] };
  const format = String(approved.parameter_format || 'POSITIONAL').toUpperCase();
  const text = typeof body.text === 'string' ? body.text : '';
  const names = [];
  if (format === 'NAMED') {
    for (const match of text.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/g)) if (!names.includes(match[1])) names.push(match[1]);
    if (!names.length && Array.isArray(body.parameters)) {
      for (const parameter of body.parameters) {
        const name = parameter?.parameter_name || parameter?.parameterName || parameter?.name;
        if (name && !names.includes(String(name))) names.push(String(name));
      }
    }
    return { count: names.length, names };
  }
  const indexes = [...text.matchAll(/{{\s*(\d+)\s*}}/g)].map(match => Number(match[1]));
  const count = indexes.length ? Math.max(...indexes) : (Array.isArray(body.parameters) ? body.parameters.length : 0);
  return { count, names: [] };
}

function validateApprovedTemplate(normalized, approved) {
  const parameters = normalized.components[0]?.parameters || [];
  const format = String(approved?.parameter_format || 'POSITIONAL').toUpperCase();
  const expected = approvedBodySpec(approved);
  if (parameters.length !== expected.count) throw new TemplateError('TEMPLATE_PARAMETERS_MISMATCH');
  if (format === 'NAMED') {
    if (parameters.some((parameter, index) => parameter.parameter_name !== expected.names[index])) {
      throw new TemplateError('TEMPLATE_PARAMETERS_MISMATCH');
    }
  } else if (parameters.some(parameter => parameter.parameter_name)) {
    throw new TemplateError('TEMPLATE_PARAMETERS_MISMATCH');
  }
  return normalized;
}

class TemplateCatalog {
  constructor(pool) {
    if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required');
    this.pool = pool;
  }

  async resolveApproved({ workspaceId, providerConnectionId, numberId, name, language }) {
    const result = await this.pool.query(`
      SELECT t.*
      FROM whatsapp_message_templates t
      JOIN provider_connections p
        ON p.id = t.provider_connection_id
       AND p.workspace_id = t.workspace_id
       AND p.provider = t.provider
      JOIN whatsapp_numbers n
        ON n.id = t.whatsapp_number_id
       AND n.workspace_id = t.workspace_id
       AND n.provider_connection_id = t.provider_connection_id
      WHERE t.workspace_id = $1
        AND t.provider_connection_id = $2
        AND t.whatsapp_number_id = $3
        AND t.name = $4
        AND t.language = $5
        AND t.status = 'APPROVED'
        AND p.status = 'active'
    `, [workspaceId, providerConnectionId, numberId, name, language]);
    return result.rowCount === 1 ? result.rows[0] : null;
  }
}

module.exports = { TemplateError, TemplateCatalog, normalizeTemplate, validateApprovedTemplate, approvedBodySpec };
