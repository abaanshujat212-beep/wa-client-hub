const crypto = require('node:crypto');

function assertKey(value, label = 'credential encryption key') {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw new Error(`${label} must be 32 bytes`);
  return value;
}
function loadKey(env = process.env) {
  const encoded = String(env.CONNECTOR_MASTER_KEY || '');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('CONNECTOR_MASTER_KEY must be a base64-encoded 32-byte key');
  return { key, keyId: String(env.CONNECTOR_KEY_ID || 'v1') };
}
class CredentialVault {
  constructor(options = {}) {
    const loaded = options.key ? { key: options.key, keyId: options.keyId || 'v1' } : loadKey(options.env);
    this.keyId = String(options.currentKeyId || loaded.keyId);
    this.keys = new Map();
    if (options.keys) for (const [keyId, key] of Object.entries(options.keys)) this.keys.set(String(keyId), assertKey(key, `Credential key ${keyId}`));
    if (!this.keys.has(this.keyId)) this.keys.set(this.keyId, assertKey(loaded.key));
  }
  encrypt(credentials, context) {
    const key = this.keys.get(this.keyId); const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(context)));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
    return { ciphertext: Buffer.from(JSON.stringify({ v: 2, kid: this.keyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') })), keyId: this.keyId };
  }
  decrypt(ciphertext, context, storedKeyId) {
    const value = JSON.parse(Buffer.from(ciphertext).toString('utf8'));
    if (value.v !== 1 && value.v !== 2) throw new Error('Unsupported credential envelope');
    const keyId = value.v === 2 ? String(value.kid || '') : String(storedKeyId || this.keyId);
    const key = this.keys.get(keyId);
    if (!key) throw new Error('Credential encryption key is unavailable');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(String(context)));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'));
  }
  rotate(ciphertext, context, storedKeyId) {
    return this.encrypt(this.decrypt(ciphertext, context, storedKeyId), context);
  }
}
module.exports = { CredentialVault, loadKey };
