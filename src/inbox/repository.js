const crypto = require("node:crypto");

function encodeCursor(offset) { return Buffer.from(String(offset)).toString("base64url"); }
function decodeCursor(cursor) {
  if (!cursor) return 0;
  const value = Number(Buffer.from(String(cursor), "base64url").toString());
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid pagination cursor");
  return value;
}

class InboxRepository {
  constructor(pool) { this.pool = pool; }
  allowed(ids) { return ids?.length ? ids.map(String) : ["__no_authorized_workspace__"]; }

  async listConversations({ workspaceIds, search = "", status = "", assignedUserId = "", limit = 30, cursor = "" }) {
    const ids = this.allowed(workspaceIds); const offset = decodeCursor(cursor); const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const term = String(search).trim();
    const result = await this.pool.query(`SELECT c.id,c.workspace_id,c.whatsapp_number_id,c.assigned_user_id,c.status,c.unread_count,c.last_message_at,
      ct.phone_e164,ct.display_name,wn.label AS number_label,u.name AS assigned_user_name,
      lm.body AS last_message_body,lm.type AS last_message_type,lm.direction AS last_message_direction,lm.origin AS last_message_origin,
      COALESCE((SELECT json_agg(json_build_object('id',t.id,'name',t.name,'color',t.color) ORDER BY t.name) FROM conversation_tags x JOIN tags t ON t.id=x.tag_id WHERE x.conversation_id=c.id),'[]') AS tags
      FROM conversations c JOIN contacts ct ON ct.id=c.contact_id JOIN whatsapp_numbers wn ON wn.id=c.whatsapp_number_id
      LEFT JOIN users u ON u.id=c.assigned_user_id LEFT JOIN LATERAL (SELECT body,type,direction,origin FROM messages WHERE conversation_id=c.id ORDER BY occurred_at DESC,id DESC LIMIT 1) lm ON true
      WHERE c.workspace_id=ANY($1::text[]) AND ($2='' OR c.status=$2) AND ($3='' OR c.assigned_user_id=$3)
      AND ($4='' OR ct.phone_e164 ILIKE '%'||$4||'%' OR COALESCE(ct.display_name,'') ILIKE '%'||$4||'%' OR COALESCE(lm.body,'') ILIKE '%'||$4||'%')
      ORDER BY c.last_message_at DESC NULLS LAST,c.id DESC LIMIT $5 OFFSET $6`, [ids, status, assignedUserId, term, take + 1, offset]);
    const more = result.rows.length > take; return { conversations: result.rows.slice(0, take), nextCursor: more ? encodeCursor(offset + take) : null };
  }

  async conversation(workspaceIds, id) {
    const result = await this.pool.query(`SELECT c.*,ct.phone_e164,ct.display_name,wn.label AS number_label FROM conversations c JOIN contacts ct ON ct.id=c.contact_id JOIN whatsapp_numbers wn ON wn.id=c.whatsapp_number_id WHERE c.id=$1 AND c.workspace_id=ANY($2::text[])`, [id, this.allowed(workspaceIds)]);
    return result.rows[0] || null;
  }

  async listMessages(workspaceIds, conversationId, { limit = 50, cursor = "" } = {}) {
    const conversation = await this.conversation(workspaceIds, conversationId); if (!conversation) return null;
    const offset = decodeCursor(cursor); const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const result = await this.pool.query(`SELECT m.*,
      COALESCE((SELECT json_agg(a ORDER BY a.created_at) FROM message_attachments a WHERE a.message_id=m.id),'[]') AS attachments,
      COALESCE((SELECT json_agg(s ORDER BY s.occurred_at) FROM message_status_events s WHERE s.message_id=m.id),'[]') AS status_events
      FROM messages m WHERE m.conversation_id=$1 AND m.workspace_id=$2 ORDER BY m.occurred_at DESC,m.id DESC LIMIT $3 OFFSET $4`, [conversationId, conversation.workspace_id, take + 1, offset]);
    const more = result.rows.length > take; return { conversation, messages: result.rows.slice(0, take).reverse(), nextCursor: more ? encodeCursor(offset + take) : null };
  }

  async markRead(workspaceIds, id) { return this.updateConversation(workspaceIds, id, "unread_count=0"); }
  async assign(workspaceIds, id, userId) { return this.updateConversation(workspaceIds, id, "assigned_user_id=$3", userId || null); }
  async updateConversation(workspaceIds, id, set, value) {
    const params = [id, this.allowed(workspaceIds)]; if (arguments.length > 3) params.push(value);
    const result = await this.pool.query(`UPDATE conversations SET ${set},updated_at=now() WHERE id=$1 AND workspace_id=ANY($2::text[]) RETURNING *`, params); return result.rows[0] || null;
  }
  async member(workspaceId, userId) { const r = await this.pool.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspaceId, userId]); return Boolean(r.rowCount); }
  async notes(workspaceIds, id) { const c = await this.conversation(workspaceIds,id); if (!c) return null; const r=await this.pool.query("SELECT n.*,u.name AS author_name FROM conversation_notes n JOIN users u ON u.id=n.author_user_id WHERE n.conversation_id=$1 AND n.workspace_id=$2 ORDER BY n.created_at DESC",[id,c.workspace_id]); return r.rows; }
  async addNote(workspaceIds,id,userId,body) { const c=await this.conversation(workspaceIds,id); if(!c)return null; const r=await this.pool.query("INSERT INTO conversation_notes(id,workspace_id,conversation_id,author_user_id,body) VALUES($1,$2,$3,$4,$5) RETURNING *",[crypto.randomUUID(),c.workspace_id,id,userId,body]); return r.rows[0]; }
  async addTag(workspaceIds,id,name,color) { const c=await this.conversation(workspaceIds,id); if(!c)return null; const tagId=crypto.randomUUID(); const t=await this.pool.query("INSERT INTO tags(id,workspace_id,name,color) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,name) DO UPDATE SET color=EXCLUDED.color RETURNING *",[tagId,c.workspace_id,name,color]); await this.pool.query("INSERT INTO conversation_tags(workspace_id,conversation_id,tag_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[c.workspace_id,id,t.rows[0].id]); return t.rows[0]; }
  async removeTag(workspaceIds,id,tagId) { const c=await this.conversation(workspaceIds,id); if(!c)return null; const r=await this.pool.query("DELETE FROM conversation_tags WHERE workspace_id=$1 AND conversation_id=$2 AND tag_id=$3 RETURNING tag_id",[c.workspace_id,id,tagId]); return Boolean(r.rowCount); }
}

module.exports = { InboxRepository, encodeCursor, decodeCursor };
