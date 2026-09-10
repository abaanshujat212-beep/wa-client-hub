const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const connectionString = process.env.TEST_DATABASE_URL;
const expected = process.env.TEMPLATE_EXPECTED || 'success';
const known = new Set(['23502','23503','23505','23514','P0001','22P02']);
test(`template insert diagnostic: ${expected}`, { skip: !connectionString, timeout: 60000 }, async () => {
  const schema = `official_template_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runMigrations(pool);
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('u1','One','one@template.test','x','client')");
    await pool.query("INSERT INTO plans(id,name,workspace_limit,number_limit,user_limit) VALUES('plan','Plan',5,5,5)");
    await pool.query("INSERT INTO workspaces(id,owner_id,name,plan_id) VALUES('w1','u1','One','plan')");
    await pool.query("INSERT INTO provider_connections(id,workspace_id,provider,label,status) VALUES('meta','w1','whatsapp_cloud','Sales','active')");
    await pool.query("INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id,automation_enabled) VALUES('sales','u1','w1','Sales','+923001110000','meta',true)");
    let error;
    try {
      await pool.query("INSERT INTO whatsapp_message_templates(id,workspace_id,provider_connection_id,whatsapp_number_id,provider,name,language,category,status,components) VALUES('valid','w1','meta','sales','whatsapp_cloud','order_update','en','UTILITY','APPROVED',jsonb_build_array(jsonb_build_object('type','BODY','text','Hello'))) ");
    } catch (caught) { error = caught; }
    if (expected === 'success') return assert.equal(error, undefined);
    assert.ok(error);
    if (expected === 'other') return assert.equal(known.has(error.code), false);
    assert.equal(error.code, expected);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
