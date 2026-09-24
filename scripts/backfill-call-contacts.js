// Local reconciliation only. No Meta requests, messages, or consent changes.
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const {databaseConfig}=require('../src/db/config');
(async()=>{const pool=new Pool(databaseConfig());try{
  const rows=(await pool.query("SELECT DISTINCT s.workspace_id,s.recipient FROM meta_call_sessions s WHERE s.recipient ~ '^[0-9]{8,15}$' AND NOT EXISTS(SELECT 1 FROM contacts c WHERE c.workspace_id=s.workspace_id AND c.phone_e164='+'||s.recipient)")).rows;
  let created=0;for(const r of rows)created+=(await pool.query('INSERT INTO contacts(id,workspace_id,phone_e164) VALUES($1,$2,$3) ON CONFLICT(workspace_id,phone_e164) DO NOTHING',[randomUUID(),r.workspace_id,'+'+r.recipient])).rowCount;
  console.log(JSON.stringify({contactsCreated:created}));
}finally{await pool.end();}})().catch(e=>{console.error(e.code||'CONTACT_BACKFILL_FAILED');process.exitCode=1;});
