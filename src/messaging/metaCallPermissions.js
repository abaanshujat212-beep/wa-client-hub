const crypto=require('node:crypto');
async function recordPermission(db,target,{recipient,status,expiresAt=null,occurredAt=new Date(),source,externalEventId,responseSource=null}) {
 await db.query(`INSERT INTO meta_call_permissions(id,workspace_id,provider_connection_id,recipient,status,expires_at,occurred_at,source,external_event_id,response_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider_connection_id,external_event_id) DO NOTHING`,[crypto.randomUUID(),target.workspaceId,target.connectionId,recipient,status,expiresAt,occurredAt,source,externalEventId,responseSource]);
}
async function recordPermissionReply(db,asset,payload){
 if(payload.history||payload.echo||payload.direction!=='inbound')return;
 const m=payload.value?.message,p=m?.interactive?.call_permission_reply;
 if(m?.interactive?.type!=='call_permission_reply'||!['accept','reject'].includes(p?.response)||!/^\d{8,15}$/.test(String(m.from)))return;
 const stamp=Number(m.timestamp),expiry=Number(p.expiration_timestamp);
 if(!Number.isFinite(stamp)||stamp<=0||!Number.isFinite(new Date(stamp*1000).getTime()))return;
 const expiresAt=Number.isFinite(expiry)&&expiry>0&&Number.isFinite(new Date(expiry*1000).getTime())?new Date(expiry*1000):null;
 await recordPermission(db,{workspaceId:asset.workspace_id,connectionId:asset.provider_connection_id},{recipient:String(m.from),status:p.response==='reject'?'rejected':p.is_permanent===true?'permanent':'temporary',expiresAt:p.is_permanent===true?null:expiresAt,occurredAt:new Date(stamp*1000),source:'webhook',externalEventId:'reply:'+m.id,responseSource:['automatic','user_action'].includes(p.response_source)?p.response_source:null});
}
async function permissionHistory(db,target){
 return (await db.query(`SELECT p.*,c.display_name FROM meta_call_permissions p LEFT JOIN contacts c ON c.workspace_id=p.workspace_id AND c.phone_e164='+'||p.recipient WHERE p.workspace_id=$1 AND p.provider_connection_id=$2 ORDER BY p.occurred_at DESC,p.recorded_at DESC LIMIT 100`,[target.workspaceId,target.connectionId])).rows;
}
module.exports={recordPermission,recordPermissionReply,permissionHistory};
