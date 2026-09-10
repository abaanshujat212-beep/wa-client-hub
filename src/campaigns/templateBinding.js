const { normalizeTemplate, validateApprovedTemplate, TemplateCatalog, TemplateError } = require('../messaging/templateCatalog');

async function bindOfficialTemplate({ pool, workspaceId, campaignId, numberId, template }) {
  const value = normalizeTemplate(template);
  const connection = await pool.query(`
    SELECT pc.id, pc.provider
    FROM whatsapp_numbers n
    JOIN provider_connections pc
      ON pc.id = n.provider_connection_id
     AND pc.workspace_id = n.workspace_id
    WHERE n.id = $1
      AND n.workspace_id = $2
      AND pc.provider IN ('whatsapp_cloud','ycloud')
      AND pc.status = 'active'
  `, [numberId, workspaceId]);
  if (connection.rowCount !== 1) throw new TemplateError('TEMPLATE_PROVIDER_UNAVAILABLE');

  const approved = await new TemplateCatalog(pool).resolveApproved({
    workspaceId,
    providerConnectionId: connection.rows[0].id,
    numberId,
    name: value.name,
    language: value.language
  });
  if (!approved || approved.provider !== connection.rows[0].provider) throw new TemplateError('APPROVED_TEMPLATE_REQUIRED');
  validateApprovedTemplate(value, approved);

  const updated = await pool.query(`
    UPDATE campaigns
    SET message_mode = 'official_template',
        official_template_name = $1,
        official_template_language = $2,
        official_template_parameters = $3,
        updated_at = now()
    WHERE id = $4
      AND workspace_id = $5
      AND whatsapp_number_id = $6
    RETURNING *
  `, [value.name, value.language, JSON.stringify(template.parameters || []), campaignId, workspaceId, numberId]);
  if (updated.rowCount !== 1) throw new TemplateError('CAMPAIGN_NOT_FOUND');
  return updated.rows[0];
}

module.exports = { bindOfficialTemplate };
