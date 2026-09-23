const test=require('node:test');
const assert=require('node:assert/strict');
const {permissionSummary,recipient}=require('../src/messaging/metaCallService');
const {normalizeCallEvents}=require('../src/messaging/metaCallEvents');
const {buildCallActionBody}=require('../src/messaging/metaCallingClient');
test('permission gate requires both live grant and explicit provider action allowance',()=>{
 const check=(status,expiry,allowed)=>permissionSummary({permission:{status,expiration_time:expiry},actions:[{action_name:'start_call',can_perform_action:allowed}]},100000);
 assert.equal(check('temporary',101,true).canStartCall,true);
 assert.equal(check('temporary',99,true).canStartCall,false);
 assert.equal(check('permanent',null,false).canStartCall,false);
 assert.equal(check('no_permission',null,true).canStartCall,false);
 assert.equal(check('granted',null,true).canStartCall,true);
 assert.equal(check('temporary',undefined,true).canStartCall,false);
 assert.equal(permissionSummary({}).canStartCall,false);
 assert.throws(()=>recipient('123abc456789'));
});
test('call payload uses documented session SDP with correct offer/answer direction',()=>{
 for(const action of ['connect','accept','pre_accept']){
  const body=buildCallActionBody({action,to:'923001234567',callId:'wacid.test',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111'});
  assert.equal(body.session.sdp_type,action==='connect'?'offer':'answer');assert.equal(body.connection,undefined);
 }
});
test('call normalizer separates signaling and statuses from message events',()=>{
 const result=normalizeCallEvents({calls:[{id:'wacid.x',event:'connect',timestamp:'123',direction:'USER_INITIATED',from:'923001234567',session:{sdp_type:'offer',sdp:'v=0\r\n'}}],statuses:[{id:'wacid.x',status:'ringing',timestamp:'124'}]},'12','34');
 assert.equal(result.length,2);assert.equal(result[0].payload.direction,'inbound');assert.equal(result[0].payload.recipient,'923001234567');assert.equal(result[1].kind,'call');
 assert.equal(normalizeCallEvents({calls:[{id:'x',event:'connect',timestamp:'NaN'}]},'1','2').length,0);
});
