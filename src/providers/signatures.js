const crypto=require("node:crypto");
const GHL_ED25519_PUBLIC_KEY=`-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=\n-----END PUBLIC KEY-----`;
function safeEqual(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}
function verifyBase64Hmac(rawBody,header,secret){if(!header||!secret)return false;const expected=crypto.createHmac("sha256",secret).update(rawBody).digest("base64");return safeEqual(expected,header);}
function verifyGhl(rawBody,signature,publicKey=GHL_ED25519_PUBLIC_KEY){if(!signature)return false;try{return crypto.verify(null,Buffer.from(rawBody),publicKey,Buffer.from(signature,"base64"));}catch{return false;}}
module.exports={GHL_ED25519_PUBLIC_KEY,safeEqual,verifyBase64Hmac,verifyGhl};
