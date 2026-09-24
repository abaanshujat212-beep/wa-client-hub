const crypto = require('node:crypto');
const terminal = new Set(['terminated','rejected','failed']);
const rank = { initiating: 0, ringing: 1, connecting: 2, pre_accepted: 3, accepted: 4, terminated: 5, rejected: 5, failed: 5 };
function normalizeCallEvents(value, wabaId, phoneNumberId) {
  const events = [];
  for (const raw of [...(Array.isArray(value.calls) ? value.calls : []), ...(Array.isArray(value.statuses) ? value.statuses : [])]) {
    const id = String(raw?.id || '');
    const event = String(raw?.event || raw?.status || '').toLowerCase();
    const stamp = Number(raw?.timestamp);
    if (!id || id.length > 512 || !['connect','terminate','ringing','accepted','rejected','failed'].includes(event) || !Number.isFinite(stamp) || stamp <= 0 || !Number.isFinite(new Date(stamp*1000).getTime())) continue;
    const direction = raw.direction === 'USER_INITIATED' ? 'inbound' : raw.direction === 'BUSINESS_INITIATED' ? 'outbound' : null;
    const recipient = String(direction === 'inbound' ? raw.from : raw.to || raw.recipient_id || '').replace(/\D/g, '');
    const session = raw.session;
    events.push({ kind:'call', wabaId, phoneNumberId, externalEventId:`call:${id}:${event}:${stamp}`, payload:{
      id, event, timestamp: stamp, direction, recipient: /^\d{8,15}$/.test(recipient) ? recipient : '',
      correlationId: /^[0-9a-f-]{36}$/i.test(raw.biz_opaque_callback_data || '') ? raw.biz_opaque_callback_data : null,
      errorCode: raw.errors?.[0]?.code ? String(raw.errors[0].code).slice(0,80) : null,
      ...(event === 'connect' && ['offer','answer'].includes(session?.sdp_type) && typeof session.sdp === 'string' && session.sdp.startsWith('v=0') && session.sdp.length <= 200000 ? { session: {sdp_type:session.sdp_type,sdp:session.sdp} } : {}),
    }});
  }
  return events;
}
async function persistCallEvent(client, receipt, asset) {
  const p = receipt.payload.value;
  // One connection lock also serializes an early webhook with an outbound API response.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['calls:'+asset.provider_connection_id]);
  let row = (await client.query('SELECT * FROM meta_call_sessions WHERE provider_connection_id=$1 AND external_call_id=$2 FOR UPDATE',[asset.provider_connection_id,p.id])).rows[0];
  if (!row && p.correlationId) row = (await client.query("SELECT * FROM meta_call_sessions WHERE id=$1 AND provider_connection_id=$2 AND external_call_id IS NULL AND direction='outbound' FOR UPDATE",[p.correlationId,asset.provider_connection_id])).rows[0];
  if (!row) {
    if (!p.direction || !p.recipient) throw Object.assign(new Error('Awaiting call connect'),{code:'META_CALL_NOT_READY'});
    row = (await client.query("INSERT INTO meta_call_sessions(id,workspace_id,provider_connection_id,external_call_id,direction,recipient,state) VALUES($1,$2,$3,$4,$5,$6,'initiating') RETURNING *",[crypto.randomUUID(),asset.workspace_id,asset.provider_connection_id,p.id,p.direction,p.recipient])).rows[0];
  }
  const inserted = await client.query('INSERT INTO meta_call_session_events(id,session_id,receipt_id,event,occurred_at,error_code) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(receipt_id) DO NOTHING RETURNING id',[crypto.randomUUID(),row.id,receipt.id,p.event,new Date(p.timestamp*1000),p.errorCode]);
  if (!inserted.rowCount) return {duplicate:true,callId:row.id};
  // Calls can arrive before any chat. Keep the canonical contact without
  // inventing a name or treating a call as consent for campaign messages.
  if (/^\d{8,15}$/.test(row.recipient)) await client.query(
    'INSERT INTO contacts(id,workspace_id,phone_e164) VALUES($1,$2,$3) ON CONFLICT(workspace_id,phone_e164) DO NOTHING',
    [crypto.randomUUID(),asset.workspace_id,'+'+row.recipient]);
  const next = {connect:row.direction==='inbound'?'ringing':'connecting',terminate:'terminated',ringing:'ringing',accepted:'accepted',rejected:'rejected',failed:'failed'}[p.event];
  const advance = !terminal.has(row.state) && (rank[next] >= (rank[row.state] ?? -1));
  const cipher = receipt.payload.value.encryptedSession;
  const signalValid = !terminal.has(row.state) && !terminal.has(next) && cipher && (Date.now()-p.timestamp*1000)<120000;
  await client.query(`UPDATE meta_call_sessions SET external_call_id=$2,state=$3,last_event_at=GREATEST(last_event_at,$4),updated_at=now(),
    remote_session=CASE WHEN $5 THEN NULL WHEN $6::bytea IS NOT NULL THEN $6 ELSE remote_session END,
    remote_key_id=CASE WHEN $5 THEN NULL WHEN $6::bytea IS NOT NULL THEN $7 ELSE remote_key_id END,
    remote_expires_at=CASE WHEN $5 THEN NULL WHEN $6::bytea IS NOT NULL THEN $8 ELSE remote_expires_at END WHERE id=$1`,
    [row.id,p.id,advance?next:row.state,new Date(p.timestamp*1000),terminal.has(next)||terminal.has(row.state),signalValid?Buffer.from(cipher,'base64'):null,p.sessionKeyId||null,new Date(p.timestamp*1000+120000)]);
  // SDP is short lived encrypted signaling, not permanent webhook history.
  await client.query("UPDATE webhook_receipts SET payload=jsonb_set(payload,'{value}',(payload->'value')-'encryptedSession'-'sessionKeyId') WHERE id=$1",[receipt.id]);
  return {callId:row.id};
}
module.exports = { normalizeCallEvents, persistCallEvent, terminal };
