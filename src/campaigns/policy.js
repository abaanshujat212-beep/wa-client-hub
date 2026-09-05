const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit"]);

function normalizePhone(value) { const digits=String(value||"").replace(/\D/g,""); return digits.length>=8&&digits.length<=15 ? `+${digits}` : null; }
function isOptOut(text) { return OPT_OUT_KEYWORDS.has(String(text||"").trim().toLowerCase()); }
function renderTemplate(template, contact) { return String(template).replace(/{{\s*(name|phone)\s*}}/gi,(_m,key)=>key.toLowerCase()==="name"?(contact.name||""):(contact.phone||"")); }
function inQuietHours(date,start,end) { if(start===null||start===undefined||end===null||end===undefined||start===end)return false; const hour=date.getUTCHours(); return start<end ? hour>=start&&hour<end : hour>=start||hour<end; }
function parseCsv(text) {
  const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).filter(line=>line.trim()); if(!lines.length)return [];
  const split=(line)=>{const out=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(value.trim());value="";}else value+=c;}out.push(value.trim());return out;};
  const headers=split(lines.shift()).map(x=>x.toLowerCase()); const required=["phone","consent_source","policy_version","consent_captured_at"];
  if(required.some(x=>!headers.includes(x)))throw new Error(`CSV requires: ${required.join(", ")}`);
  return lines.map((line,index)=>{const values=split(line);const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]||""]));const phone=normalizePhone(row.phone);const captured=new Date(row.consent_captured_at);if(!phone||!row.consent_source||!row.policy_version||Number.isNaN(captured.getTime()))throw new Error(`Invalid CSV row ${index+2}`);return {phone,name:row.name||"",consentSource:row.consent_source,policyVersion:row.policy_version,consentCapturedAt:captured.toISOString(),evidence:row.consent_evidence||""};});
}
module.exports={OPT_OUT_KEYWORDS,normalizePhone,isOptOut,renderTemplate,inQuietHours,parseCsv};
