class MetaOnboardingRepository {
  constructor(pool) { if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required'); this.pool=pool; }
  async status(actorId,workspaceId){const [pending,connections]=await Promise.all([
    this.pool.query(`SELECT EXISTS(SELECT 1 FROM meta_signup_states WHERE actor_id=$1 AND workspace_id=$2 AND expires_at>clock_timestamp()) AS pending`,[actorId,workspaceId]),
    this.pool.query(`SELECT c.id AS connection_id,c.label,c.status,c.created_at,c.updated_at,n.id AS number_id,n.label AS number_label,n.phone,n.automation_enabled FROM provider_connections c LEFT JOIN whatsapp_numbers n ON n.provider_connection_id=c.id AND n.workspace_id=c.workspace_id WHERE c.workspace_id=$1 AND c.provider='whatsapp_cloud' ORDER BY c.created_at DESC,c.id,n.id`,[workspaceId])]);
    return{workspaceId,pending:Boolean(pending.rows[0]?.pending),connections:connections.rows.map(r=>({id:r.connection_id,label:r.label,status:r.status,createdAt:r.created_at?new Date(r.created_at).toISOString():null,updatedAt:r.updated_at?new Date(r.updated_at).toISOString():null,number:r.number_id?{id:r.number_id,label:r.number_label,phone:r.phone,automationEnabled:Boolean(r.automation_enabled)}:null}))};
  }
}
module.exports={MetaOnboardingRepository};
