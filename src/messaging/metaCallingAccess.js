const express=require('express');
async function callingConnections(pool,userId,session={}) {
  return (await pool.query(`SELECT p.id,p.workspace_id,w.name AS workspace_name,n.id AS number_id,n.phone,p.status
    FROM provider_connections p JOIN workspaces w ON w.id=p.workspace_id
    JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=w.id
    JOIN users u ON u.id=$1 AND u.active=true
    WHERE p.provider='whatsapp_cloud' AND p.status IN ('active','degraded') AND w.status='active'
    AND EXISTS(SELECT 1 FROM meta_connection_assets a WHERE a.provider_connection_id=p.id AND a.disconnected_at IS NULL)
    AND (NOT $2 OR (w.id=$3 AND EXISTS(SELECT 1 FROM ghl_installations g WHERE g.workspace_id=w.id AND g.location_id=$4 AND g.status='active')))
    AND (u.role='admin' OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=u.id AND
      (m.role IN ('owner','admin') OR (m.role='agent' AND EXISTS(SELECT 1 FROM whatsapp_number_assignments a WHERE a.workspace_id=w.id AND a.whatsapp_number_id=n.id AND a.user_id=u.id AND a.removed_at IS NULL)))))
    ORDER BY w.name,n.phone`,[userId,session.ghlEmbedded===true,session.ghlWorkspaceId||null,session.ghlLocationId||null])).rows;
}
function createCallingDirectoryRouter({pool,enabled=false}) {
  const router=express.Router();
  router.get('/connections',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!enabled)return res.status(404).json({error:'Calling is not enabled'});
    if(!req.session?.userId)return res.status(401).json({error:'Please sign in'});
    try{res.json({connections:await callingConnections(pool,req.session.userId,req.session),embedded:req.session.ghlEmbedded===true,userId:req.session.userId});}
    catch{res.status(503).json({error:'Calling connections unavailable'});}
  });return router;
}
module.exports={callingConnections,createCallingDirectoryRouter};
