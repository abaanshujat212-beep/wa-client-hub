const crypto = require('node:crypto');

async function persistContact(client, asset, payload) {
  const item = payload.value;
  const phone = '+' + String(item.contact.phone_number).replace(/\D/g, '');
  // Removing a mobile address-book entry must not erase CRM conversations.
  const stamp = Number(item.metadata?.timestamp) || 0;
  const source = { timestamp: stamp, removed: item.action === 'remove', fullName: item.contact.full_name || null };
  await client.query(`INSERT INTO contacts(id,workspace_id,phone_e164,display_name,attributes)
    VALUES($1,$2,$3,$4,jsonb_build_object('metaBusinessApp',jsonb_build_object($5::text,$6::jsonb)))
    ON CONFLICT(workspace_id,phone_e164) DO UPDATE SET
    display_name=COALESCE(EXCLUDED.display_name,contacts.display_name),
    attributes=jsonb_set(contacts.attributes,'{metaBusinessApp}',COALESCE(contacts.attributes->'metaBusinessApp','{}'::jsonb)||(EXCLUDED.attributes->'metaBusinessApp')),updated_at=now()
    WHERE COALESCE((contacts.attributes->'metaBusinessApp'->$5->>'timestamp')::numeric,0)<=$7`,
    [crypto.randomUUID(), asset.workspace_id, phone, item.action === 'add' ? item.contact.full_name || item.contact.first_name || null : null, asset.provider_connection_id, source, stamp]);
  return { contactSynced: true };
}

async function persistHistoryProgress(client, asset, payload) {
  const value = payload.value;
  const declined = value.errors?.some(error => Number(error.code) === 2593109);
  const phase = Number(value.metadata?.phase);
  const progress = Math.max(0, Math.min(100, Number(value.metadata?.progress) || 0));
  const update = { historySharing: declined ? 'declined' : value.errors?.length ? 'error' : 'receiving' };
  if (value.errors?.length) update.historyErrorCodes = value.errors.map(e => e.code);
  if (!declined && Number.isInteger(phase) && phase >= 0 && phase <= 2) {
    // Per-phase progress is retained; a phase reaching 100 is not overall completion.
    await client.query(`UPDATE provider_connections SET settings=jsonb_set(settings,ARRAY[$2],to_jsonb(GREATEST(COALESCE((settings->>$2)::int,0),$3::int))),updated_at=now() WHERE id=$1`,
      [asset.provider_connection_id, `historyPhase${phase}Progress`, progress]);
  }
  await client.query('UPDATE provider_connections SET settings=settings||$2::jsonb,updated_at=now() WHERE id=$1', [asset.provider_connection_id, update]);
  return { historyProgress: true };
}
module.exports = { persistContact, persistHistoryProgress };
