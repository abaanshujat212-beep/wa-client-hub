const express = require('express');
const { callingConnections } = require('./metaCallingAccess');

async function listContacts(pool, connection, { search = '', offset = 0 } = {}) {
  const start = Number(offset);
  if (!Number.isSafeInteger(start) || start < 0 || start > 100000) throw new Error('Invalid offset');
  const result = await pool.query(`SELECT c.id,c.display_name,c.phone_e164,c.updated_at,
    c.attributes->'metaBusinessApp'->$2 AS business_app,
    EXISTS(SELECT 1 FROM meta_call_sessions s WHERE s.workspace_id=c.workspace_id
      AND s.provider_connection_id=$2 AND '+'||s.recipient=c.phone_e164) AS has_calls
    FROM contacts c WHERE c.workspace_id=$1 AND (
      c.attributes->'metaBusinessApp' ? $2 OR
      EXISTS(SELECT 1 FROM conversations v WHERE v.workspace_id=c.workspace_id AND v.contact_id=c.id AND v.whatsapp_number_id=$3) OR
      EXISTS(SELECT 1 FROM meta_call_sessions s WHERE s.workspace_id=c.workspace_id AND s.provider_connection_id=$2 AND '+'||s.recipient=c.phone_e164))
    AND ($4='' OR c.phone_e164 ILIKE '%'||$4||'%' OR c.display_name ILIKE '%'||$4||'%')
    ORDER BY c.updated_at DESC,c.id DESC LIMIT 51 OFFSET $5`,
  [connection.workspace_id, connection.id, connection.number_id, String(search).trim().slice(0,100), start]);
  const jobs = await pool.query("SELECT step,state,updated_at FROM meta_coexistence_jobs WHERE provider_connection_id=$1 AND step='smb_app_state_sync'", [connection.id]);
  return { contacts: result.rows.slice(0,50), nextOffset: result.rows.length > 50 ? start + 50 : null, sync: jobs.rows[0] || null };
}

function createContactDirectoryRouter({ pool }) {
  const router = express.Router();
  router.use((req,res,next) => {
    res.set('Cache-Control','no-store');
    if (!req.session?.userId) return res.status(401).json({error:'Please sign in'});
    next();
  });
  router.get('/connections', async (req,res) => {
    try { res.json({connections:await callingConnections(pool,req.session.userId,req.session)}); }
    catch { res.status(503).json({error:'Contact connections unavailable'}); }
  });
  router.get('/', async (req,res) => {
    try {
      const connections = await callingConnections(pool,req.session.userId,req.session);
      const connection = connections.find(c => c.id === req.query.connectionId);
      if (!connection) return res.status(404).json({error:'Connection not found'});
      res.json(await listContacts(pool,connection,req.query));
    } catch(error) { res.status(error.message==='Invalid offset'?400:503).json({error:error.message==='Invalid offset'?error.message:'Contacts unavailable'}); }
  });
  return router;
}
module.exports = { listContacts, createContactDirectoryRouter };
