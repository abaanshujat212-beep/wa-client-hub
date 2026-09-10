const crypto = require('node:crypto');
function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const a = crypto.createHash('sha256').update(left).digest(); const b = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(a, b);
}
function verifyMetaSignature(rawBody, supplied, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof appSecret !== 'string' || appSecret.length < 20 || !/^sha256=[a-f0-9]{64}$/.test(String(supplied || ''))) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
function verifyChallenge(query, verifyToken) {
  const mode = query?.['hub.mode']; const token = query?.['hub.verify_token']; const challenge = query?.['hub.challenge'];
  if (mode !== 'subscribe' || typeof challenge !== 'string' || challenge.length < 1 || challenge.length > 1024 || !equalSecret(token, verifyToken)) return null;
  return challenge;
}
module.exports = { equalSecret, verifyMetaSignature, verifyChallenge };
