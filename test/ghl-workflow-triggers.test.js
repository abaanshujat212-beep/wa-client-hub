const test=require('node:test');const assert=require('node:assert/strict');
const {validateTarget,validateFilters,matches,createWorkflowTriggers}=require('../src/providers/ghlWorkflowTriggers');
const {locationToken}=require('../src/providers/ghlWorkflowActions');
test('callback target cannot exfiltrate message data or cross locations',()=>{
 const base='https://services.leadconnectorhq.com/workflows-marketplace/triggers/execute/location/trigger';
 assert.equal(validateTarget(base,'location','trigger'),base);
 for(const url of [base.replace('https:','http:'),base+'?redirect=x',base.replace('location/trigger','other/trigger'),'https://evil.test/',base.replace('services.leadconnectorhq.com','services.leadconnectorhq.com.evil.test')])assert.throws(()=>validateTarget(url,'location','trigger'));
});
test('filters fail closed and distinguish read from delivered',()=>{
 const f=[{field:'status',operator:'==',value:'read'}];assert.equal(matches(f,{status:'read'}),true);assert.equal(matches(f,{status:'delivered'}),false);
 assert.throws(()=>validateFilters([{field:'status',operator:'unknown',value:'read'}]));
});
test('subscription auth and installed location are checked before mutation',async()=>{
 let queries=0;const env={GHL_WORKFLOW_SECRET:'secret'};const s=createWorkflowTriggers({env,pool:{query:async()=>{queries++;return{rowCount:0}}}});
 const b={extras:{locationId:'location',workflowId:'workflow'},meta:{key:'tenx_wa_message_received'},triggerData:{id:'trigger',key:'tenx_wa_message_received',eventType:'CREATED',filters:[],targetUrl:'https://services.leadconnectorhq.com/workflows-marketplace/triggers/execute/location/trigger'}};
 await assert.rejects(s.subscribe(b,'wrong'),{code:'WORKFLOW_UNAUTHORIZED'});assert.equal(queries,0);
 await assert.rejects(s.subscribe(b,locationToken('marketplace-app',env)),{code:'LOCATION_NOT_INSTALLED'});assert.equal(queries,1);
});
test('delete disables subscription without requiring target URL',async()=>{
 const queries=[],env={GHL_WORKFLOW_SECRET:'secret'};const s=createWorkflowTriggers({env,pool:{query:async(sql)=>{queries.push(sql);return{rowCount:1}}}});
 await s.subscribe({extras:{locationId:'location',workflowId:'workflow'},meta:{key:'tenx_wa_message_received'},triggerData:{id:'trigger',key:'tenx_wa_message_received',eventType:'DELETED'}},locationToken('marketplace-app',env));assert.match(queries[1],/active=false/);
});
