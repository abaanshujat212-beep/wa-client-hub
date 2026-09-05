const crypto=require("node:crypto");

function loadKey(env=process.env){const encoded=String(env.CONNECTOR_MASTER_KEY||"");const key=Buffer.from(encoded,"base64");if(key.length!==32)throw new Error("CONNECTOR_MASTER_KEY must be a base64-encoded 32-byte key");return{key,keyId:String(env.CONNECTOR_KEY_ID||"v1")};}
class CredentialVault{
  constructor(options={}){const loaded=options.key?{key:options.key,keyId:options.keyId||"v1"}:loadKey(options.env);this.key=loaded.key;this.keyId=loaded.keyId;if(this.key.length!==32)throw new Error("Connector encryption key must be 32 bytes");}
  encrypt(credentials,context){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv("aes-256-gcm",this.key,iv);cipher.setAAD(Buffer.from(String(context)));const encrypted=Buffer.concat([cipher.update(JSON.stringify(credentials),"utf8"),cipher.final()]);return{ciphertext:Buffer.from(JSON.stringify({v:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")})),keyId:this.keyId};}
  decrypt(ciphertext,context){const value=JSON.parse(Buffer.from(ciphertext).toString("utf8"));if(value.v!==1)throw new Error("Unsupported credential envelope");const decipher=crypto.createDecipheriv("aes-256-gcm",this.key,Buffer.from(value.iv,"base64"));decipher.setAAD(Buffer.from(String(context)));decipher.setAuthTag(Buffer.from(value.tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,"base64")),decipher.final()]).toString("utf8"));}
}
module.exports={CredentialVault,loadKey};
