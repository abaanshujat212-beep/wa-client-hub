const crypto = require('node:crypto');

// CryptoJS passphrase AES uses the OpenSSL salted format and EVP_BytesToKey.
function decryptUserContext(encryptedData, secret) {
  if (!secret) throw Object.assign(new Error('Configure the Marketplace Auth Shared Secret as GHL_APP_SHARED_SECRET on the app server.'), { status: 503, code: 'GHL_SHARED_SECRET_REQUIRED' });
  if (typeof encryptedData !== 'string' || encryptedData.length > 10000) throw Object.assign(new Error('HighLevel returned an unsupported context format.'), { status: 400, code: 'GHL_CONTEXT_FORMAT_INVALID' });
  const data = Buffer.from(encryptedData, 'base64');
  if (data.length < 32 || data.subarray(0, 8).toString() !== 'Salted__') throw Object.assign(new Error('HighLevel returned an unsupported encrypted context format.'), { status: 400, code: 'GHL_CONTEXT_FORMAT_INVALID' });
  let context;
  try {
    const salt = data.subarray(8, 16);
    let derived = Buffer.alloc(0), previous = Buffer.alloc(0);
    while (derived.length < 48) {
      previous = crypto.createHash('md5').update(Buffer.concat([previous, Buffer.from(secret, 'utf8'), salt])).digest();
      derived = Buffer.concat([derived, previous]);
    }
    const decipher = crypto.createDecipheriv('aes-256-cbc', derived.subarray(0, 32), derived.subarray(32, 48));
    context = JSON.parse(Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]).toString('utf8'));
  } catch {
    throw Object.assign(new Error('HighLevel context decryption failed. The server Shared Secret must match the Marketplace app that owns this Custom Page.'), { status: 401, code: 'GHL_CONTEXT_DECRYPT_FAILED' });
  }
  if (!context || typeof context.userId !== 'string' || !context.userId) throw Object.assign(new Error('HighLevel context decrypted, but user identity is missing.'), { status: 401, code: 'GHL_CONTEXT_USER_MISSING' });
  if (typeof context.activeLocation !== 'string' || !context.activeLocation) throw Object.assign(new Error('HighLevel context decrypted, but activeLocation is missing. Open the app from the installed sub-account.'), { status: 401, code: 'GHL_CONTEXT_LOCATION_MISSING' });
  if (typeof context.companyId !== 'string' || !context.companyId) throw Object.assign(new Error('HighLevel context decrypted, but agency identity is missing.'), { status: 401, code: 'GHL_CONTEXT_COMPANY_MISSING' });
  return { ...context, locationId: context.activeLocation, nonce: crypto.createHash('sha256').update(encryptedData).digest('hex'), exp: Math.floor(Date.now() / 1000) + 300 };
}
module.exports = { decryptUserContext };
