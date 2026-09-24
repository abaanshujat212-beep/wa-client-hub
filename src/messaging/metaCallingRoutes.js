const express = require('express');
const { callingConnections } = require('./metaCallingAccess');
const { normalizeCallingReadiness } = require('./metaCallingReadiness');
const { CredentialVault } = require('../security/credentialVault');
const { MetaGraphClient } = require('./metaGraphClient');
const { MetaCallingClient, MetaCallingError } = require('./metaCallingClient');
const { MetaCallService } = require('./metaCallService');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { validCsrf, validateOrigin } = require('./metaSignupRoutes');

function enabled(env = process.env) { return env.META_CALLING_ENABLED === 'true'; }

function createMetaCallingRouter({ enabled: isEnabled = false, env = process.env, store, origin, fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router({ mergeParams: true });
  if (!isEnabled) {
    router.use((_req, res) => res.status(404).json({ error: 'Meta Calling is not enabled' }));
    return router;
  }
  if (!validateOrigin(origin) || store?.driver !== 'postgres' || typeof store?.repository?.pool?.query !== 'function') throw new TypeError('Enabled Meta Calling requires an exact origin and PostgreSQL store');
  const vault = new CredentialVault({ env });
  const graph = new MetaGraphClient({ graphVersion: env.META_GRAPH_VERSION, fetchImpl, maxRetries: 0 });
  const calling = new MetaCallingClient({ graphClient: graph, enabled: true });
  const pool = store.repository.pool;
  const service = new MetaCallService({pool,graph,calling,vault});
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use(rateLimit({windowMs:60000,limit:120,keyGenerator:req=>req.session?.userId||ipKeyGenerator(req.ip),standardHeaders:true,legacyHeaders:false}));
  router.use(express.json({limit:'256kb',strict:true}));
  router.use((req,res,next)=>{if(req.method==='POST'&&(req.get('origin')!==origin||!validCsrf(req.session?.csrfToken,req.get('x-csrf-token'))))return res.status(403).json({error:'Security token or origin is invalid'});next();});


  async function resolveTarget(req, res) {
    const user = req.session?.userId ? store.findUser(req.session.userId) : null;
    if (!user || !user.active) { res.status(401).json({ error: 'Please sign in' }); return null; }
    const workspaceId = String(req.body?.workspaceId || req.query.workspaceId || '').trim();
    const connectionId = String(req.params.connectionId || '').trim();
    if (!workspaceId || !(await callingConnections(pool,user.id,req.session)).some(c=>c.id===connectionId&&c.workspace_id===workspaceId) || !/^[0-9a-f-]{36}$/i.test(connectionId)) { res.status(404).json({ error: 'Meta connection not found' }); return null; }
    const result = await pool.query(`SELECT p.id,p.workspace_id,p.encrypted_credentials,p.encryption_key_id,
      a.waba_id,a.phone_number_id,n.id AS number_id
      FROM provider_connections p JOIN meta_connection_assets a
        ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=p.workspace_id
      WHERE p.id=$1 AND p.workspace_id=$2 AND p.provider='whatsapp_cloud'
        AND (p.status IN ('active','degraded') OR ($3::boolean AND p.status='connecting')) AND a.disconnected_at IS NULL`, [connectionId, workspaceId, req.method === 'GET']);
    const row = result.rows[0];
    if (!row || !row.encrypted_credentials) { res.status(404).json({ error: 'Meta connection not found' }); return null; }
    const credentials = vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
    if (!credentials.accessToken) { res.status(409).json({ error: 'Meta credentials are unavailable', code: 'META_CREDENTIALS_UNAVAILABLE' }); return null; }
    return { user, workspaceId, connectionId, numberId: row.number_id, phoneNumberId: row.phone_number_id, wabaId: row.waba_id, accessToken: credentials.accessToken };
  }

  router.get('/readiness', async (req, res) => {
    try {
      const target = await resolveTarget(req, res); if (!target) return;
      const settings = await graph.request({ path: [target.phoneNumberId, 'settings'], accessToken: target.accessToken });
      const subscriptions = await graph.request({ path: [target.wabaId, 'subscribed_apps'], accessToken: target.accessToken, query: { limit: 100 } });
      let permissions = null;
      const recipient = String(req.query.recipient || '').replace(/\D/g, '');
      if (recipient) permissions = await graph.request({ path: [target.phoneNumberId, 'call_permissions'], accessToken: target.accessToken, query: { user_wa_id: recipient } });
      const evidence=(await pool.query(`SELECT max(e.occurred_at) AS webhook_at,max(e.occurred_at) FILTER(WHERE s.direction='inbound' AND e.event='connect') AS inbound_at,max(e.occurred_at) FILTER(WHERE s.direction='outbound' AND e.event='accepted') AS outbound_at FROM meta_call_sessions s JOIN meta_call_session_events e ON e.session_id=s.id WHERE s.workspace_id=$1 AND s.provider_connection_id=$2`,[target.workspaceId,target.connectionId])).rows[0];
      return res.json({ evidence, connectionId: target.connectionId, wabaId: target.wabaId, phoneNumberId: target.phoneNumberId, settings, subscriptions, permissions, readiness: normalizeCallingReadiness({ settings, subscriptions }) });
    } catch (error) {
      return res.status(error?.code === 'META_ERROR_190' || error?.providerStatus === 401 || error?.providerStatus === 403 ? 409 : 503).json({ error: error?.code === 'META_ERROR_190' ? 'The Meta access token has expired or is invalid. Update the connection token before checking calling.' : 'Meta Calling readiness is unavailable', code: error?.code || 'META_CALLING_READINESS_FAILED' });
    }
  });

  function endpoint(handler) { return async(req,res)=>{try {const target=await resolveTarget(req,res);if(!target)return;await handler(req,res,target);}catch(error){if(error instanceof MetaCallingError)return res.status(error.status||400).json({error:error.message,code:error.code});res.status(503).json({error:'Calling service unavailable',code:'META_CALL_SERVICE_UNAVAILABLE'});}}; }
  router.get('/permissions/history',endpoint(async(req,res,target)=>res.json({permissions:await require('./metaCallPermissions').permissionHistory(pool,target)})));
  router.get('/permissions/templates',endpoint(async(req,res,target)=>res.json({templates:await require('./metaCallPermissionTemplates').permissionTemplates(graph,target)})));
  router.get('/permissions',endpoint(async(req,res,target)=>res.json(await service.permissions(target,req.query.recipient))));
  router.get('/sessions',endpoint(async(req,res,target)=>res.json({sessions:await service.list(target)})));
  router.get('/sessions/:sessionId',endpoint(async(req,res,target)=>res.json(await service.detail(target,req.params.sessionId))));
  router.post('/sessions/:sessionId/claim',endpoint(async(req,res,target)=>res.json(await service.claim(target,req.params.sessionId))));
  router.get('/sessions/:sessionId/signaling',endpoint(async(req,res,target)=>res.json(await service.signaling(target,req.params.sessionId))));
  router.post('/action',endpoint(async(req,res,target)=>{
    const result=await service.action(target,req.body,req.get('idempotency-key'));
    res.status(result.state==='failed'?409:result.state==='uncertain'?202:result.state==='sending'?202:200).json(result);
  }));
  router.post('/permissions/request',endpoint(async(req,res,target)=>{
    const result=await service.action(target,{...req.body,action:'request_permission'},req.get('idempotency-key'));
    res.status(result.state==='failed'?409:result.state==='accepted'?200:202).json(result);
  }));

  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { enabled, createMetaCallingRouter };
