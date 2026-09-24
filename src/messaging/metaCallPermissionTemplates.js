const {MetaCallingError}=require('./metaCallingClient');
const {normalizeTemplate,validateApprovedTemplate,approvedBodySpec}=require('./templateCatalog');
const eligible=t=>t.status==='APPROVED'&&['MARKETING','UTILITY'].includes(t.category)&&Array.isArray(t.components)&&t.components.some(c=>String(c.type).toUpperCase()==='CALL_PERMISSION_REQUEST')&&t.components.every(c=>['BODY','CALL_PERMISSION_REQUEST'].includes(String(c.type).toUpperCase()));
function normalizePermissionTemplate(value){try{return value?normalizeTemplate(value):null;}catch{throw new MetaCallingError('META_CALL_TEMPLATE_INVALID','Check the call-permission template and variable values',400);}}
async function permissionTemplates(graph,target,name){
 const results=[];let after;const seen=new Set();
 for(let page=0;page<20;page++){
  const data=await graph.request({path:[target.wabaId,'message_templates'],accessToken:target.accessToken,query:{fields:'id,name,language,status,category,parameter_format,components',limit:100,...(name?{name}:{}),...(after?{after}:{})}});
  if(!Array.isArray(data.data))throw new MetaCallingError('META_CALL_TEMPLATES_UNAVAILABLE','Could not load approved permission templates',503);
  results.push(...data.data.filter(eligible).map(t=>({...t,body:t.components.find(c=>String(c.type).toUpperCase()==='BODY')?.text||'',variables:approvedBodySpec(t)})));
  if(!data.paging?.next)return results;
  after=data.paging?.cursors?.after;if(typeof after!=='string'||seen.has(after)||after.length>2048)break;seen.add(after);
 }
 throw new MetaCallingError('META_CALL_TEMPLATES_UNAVAILABLE','Template catalog pagination could not complete',503);
}
async function resolvePermissionTemplate(graph,target,template){
 if(!template)throw new MetaCallingError('META_CALL_TEMPLATE_REQUIRED','The 24-hour chat window is closed. Select an approved call-permission template.',409);
 const approved=(await permissionTemplates(graph,target,template.name)).find(t=>t.name===template.name&&t.language===template.language);
 if(!approved)throw new MetaCallingError('META_CALL_TEMPLATE_NOT_APPROVED','This template is not an approved call-permission template for this number.',409);
 try{validateApprovedTemplate(template,approved);}catch{throw new MetaCallingError('META_CALL_TEMPLATE_PARAMETERS','Fill all template variables correctly',400);}
 return template;
}
module.exports={eligible,normalizePermissionTemplate,permissionTemplates,resolvePermissionTemplate};
