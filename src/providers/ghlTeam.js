const express = require('express');
const crypto = require('node:crypto');
const { GhlProvisioningService } = require('./ghlAutoProvisioning');

function createGhlTeamRouter({ pool, store, runtime, fetchImpl = fetch }) {
  const router = express.Router();
  const provisioning = new GhlProvisioningService({ pool, vault: runtime.repository.vault });
  router.use(async (req, res, next) => {
    try {
      const user = req.session?.userId && store.findUser(req.session.userId);
      const workspaceId = String(req.body?.workspaceId || req.query.workspaceId || '');
      if (!user?.active) return res.status(401).json({ error: 'Please sign in' });
      if (!store.canManageWorkspace(user, workspaceId)) return res.status(403).json({ error: 'Workspace administrator access required' });
      const installations = await pool.query("SELECT * FROM ghl_installations WHERE workspace_id=$1 AND status='active'", [workspaceId]);
      if (installations.rowCount !== 1) return res.status(409).json({ error: 'Connect one HighLevel location to this workspace first.' });
      req.teamInstallation = installations.rows[0]; next();
    } catch { res.status(503).json({ error: 'HighLevel team is unavailable' }); }
  });
  async function list(i) {
    return (await pool.query(`SELECT u.id,u.name,u.email FROM ghl_external_users x JOIN users u ON u.id=x.user_id AND u.active=true JOIN workspace_members m ON m.user_id=u.id AND m.workspace_id=$1 WHERE x.location_id=$2 ORDER BY u.name`, [i.workspace_id, i.location_id])).rows;
  }
  router.get('/', async (req,res) => { try { res.json({ users: await list(req.teamInstallation) }); } catch { res.status(503).json({ error: 'Could not load team' }); } });
  router.post('/sync', async (req,res) => {
    const i = req.teamInstallation;
    let client;
    try {
      if (!i.company_id) return res.status(409).json({ error: 'Reconnect HighLevel to restore the agency identity.' });
      if (!(i.scopes || []).includes('users.readonly')) return res.status(409).json({ error: 'Enable users.readonly in Marketplace Auth and reconnect HighLevel to sync your team.' });
      const token = await runtime.repository.getAccessToken({ installationId:i.installation_id, locationId:i.location_id, refresh:value=>runtime.client.refreshToken(value) });
      const users = [];
      for (let page=0;page<40;page++) {
        const query = new URLSearchParams({ companyId:i.company_id,locationId:i.location_id,skip:String(page*100),limit:'100' });
        const response=await fetchImpl(`${runtime.client.config.apiUrl}/users/search?${query}`,{headers:{authorization:`Bearer ${token.accessToken}`,Version:'2023-02-21',accept:'application/json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok) throw new Error('HighLevel rejected team sync. Check users.readonly permission and reconnect.');
        const body=await response.json();
        if(!Array.isArray(body.users))throw new Error('HighLevel returned an invalid team list.');
        users.push(...body.users);
        if(body.users.length<100 || users.length>=Number(body.count))break;
        if(page===39)throw new Error('Team is too large to synchronize in one request.');
      }
      client=await pool.connect();await client.query('BEGIN');
      await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[i.workspace_id]);
      for(const remote of users){
        if(typeof remote.id!=='string'||!remote.id)throw new Error('HighLevel user identity missing.');
        const identity={ghlUserId:remote.id,locationId:i.location_id,companyId:i.company_id,email:remote.email||null};
        const user=await provisioning.ensureUser(client,identity,null);
        const name=[remote.firstName,remote.lastName].filter(Boolean).join(' ').trim();
        if(name)await client.query('UPDATE users SET name=$2 WHERE id=$1',[user.id,name.slice(0,120)]);
        await client.query("INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES($1,$2,$3,'viewer') ON CONFLICT(workspace_id,user_id) DO NOTHING",[crypto.randomUUID(),i.workspace_id,user.id]);
        await client.query(`INSERT INTO ghl_external_users(id,ghl_user_id,location_id,company_id,user_id,email,role_type) VALUES($1,$2,$3,$4,$5,$6,'user') ON CONFLICT(location_id,ghl_user_id) DO UPDATE SET verified_at=now(),updated_at=now()`,[crypto.randomUUID(),remote.id,i.location_id,i.company_id,user.id,identity.email]);
      }
      await client.query('COMMIT');res.json({ users:await list(i),synced:users.length });
    }catch(error){if(client)await client.query('ROLLBACK');res.status(502).json({error:error.message||'Team sync failed'});}finally{client?.release();}
  });
  return router;
}
module.exports={createGhlTeamRouter};
