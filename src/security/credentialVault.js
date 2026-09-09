const crypto = require('node:crypto');

function assertKey(value, label = 'credential encryption key') {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw new Error(`${label} must be 32 bytes`);
  return value;
}
function decodeKey(encoded, label) {
  const key = Buffer.from(String(encoded || ''), 'base64');
  if (key.length !== 32) throw new Error(`${label} must be a base64-encoded 32-byte key`);
  return key;
}
function loadKey(env = process.env) {
  return { key: decodeKey(env.CONNECTOR_MASTER_KEY, 'CONNECTOR_MASTER_KEY'), keyId: String(env.CONNECTOR_KEY_ID || 'v1') };
}
function loadKeys(env = process.env) {
  const current = loadKey(env); const keys = { [current.keyId]: current.key };
  if (env.CONNECTOR_PREVIOUS_KEYS_JSON) {
    let parsed;
    try { parsed = JSON.parse(env.CONNECTOR_PREVIOUS_KEYS_JSON); }
    catch { throw new Error('CONNECTOR_PREVIOUS_KEYS_JSON must be valid JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CONNECTOR_PREVIOUS_KEYS_JSON must be an object');
    for (const [id, value] of Object.entries(parsed)) {
      if (!id || id === current.keyId) throw new Error('Previous credential key IDs must be unique');
      keys[id] = decodeKey(value, `Credential key ${id}`);
    }
  }
  return { keys, currentKeyId: current.keyId };
}
class CredentialVault {
  constructor(options = {}) {
    const loaded = options.keys ? { keys: options.keys, currentKeyId: options.currentKeyId || options.keyId } :
      options.key ? { keys: { [options.keyId || 'v1']: options.key }, currentKeyId: options.keyId || 'v1' } : loadKeys(options.env);
    this.keyId = String(loaded.currentKeyId || ''); this.keys = new Map();
    for (const [id, key] of Object.entries(loaded.keys || {})) this.keys.set(String(id), assertKey(key, `Credential key ${id}`));
    if (!this.keyId || !this.keys.has(this.keyId)) throw new Error('Current credential encryption key is unavailable');
  }
  encrypt(credentials, context) {
    const key = this.keys.get(this.keyId); const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(context)));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
    return { ciphertext: Buffer.from(JSON.stringify({ v: 2, kid: this.keyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') })), keyId: this.keyId };
  }
  decrypt(ciphertext, context, storedKeyId) {
    const value = JSON.parse(Buffer.from(ciphertext).toString('utf8'));
    if (value.v !== 1 && value.v !== 2) throw new Error('Unsupported credential envelope');
    const keyId = value.v === 2 ? String(value.kid || '') : String(storedKeyId || this.keyId); const key = this.keys.get(keyId);
    if (!key) throw new Error('Credential encryption key is unavailable');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(String(context))); decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'));
  }
  rotate(ciphertext, context, storedKeyId) { return this.encrypt(this.decrypt(ciphertext, context, storedKeyId), context); }
}
module.exports = { CredentialVault, loadKey, loadKeys };
