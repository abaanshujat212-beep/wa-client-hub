// Replays already stored, genuine permission replies; never sends provider requests.
const {Pool}=require('pg');
const {databaseConfig}=require('../src/db/config');
const {recordPermissionReply}=require('../src/messaging/metaCallPermissions');
(async()=>{const pool=new Pool(databaseConfig());try{
 const rows=(await pool.query("SELECT workspace_id,provider_connection_id,direction,metadata FROM messages WHERE direction='inbound' AND metadata->'meta'->'interactive'->>'type'='call_permission_reply' ORDER BY occurred_at LIMIT 10000")).rows;
 for(const row of rows)await recordPermissionReply(pool,row,{direction:row.direction,history:row.metadata.history===true,echo:row.metadata.coexistenceEcho===true,value:{message:row.metadata.meta}});
 console.log(JSON.stringify({permissionRepliesInspected:rows.length}));
}finally{await pool.end();}})().catch(e=>{console.error(e.code||'PERMISSION_BACKFILL_FAILED');process.exit(1);});
