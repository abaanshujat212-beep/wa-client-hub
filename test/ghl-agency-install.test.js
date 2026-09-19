const test = require('node:test');
const assert = require('node:assert/strict');
const { GhlAgencyInstallService } = require('../src/providers/ghlAgencyInstall');
const { normalizeTokenResponse } = require('../src/providers/ghlContract');
const agency = { userType:'Company', companyId:'company', userId:'installer', accessToken:'agency-access', refreshToken:'agency-refresh', expiresIn:3600 };
function fixture(fetchImpl) {
  const provisioned = [], saved = [];
  const service = new GhlAgencyInstallService({ pool:{query:async (...args)=>saved.push(args)}, vault:{encrypt:()=>({ciphertext:Buffer.from('encrypted'),keyId:'v1'})}, client:{config:{apiUrl:'https://api.test',requiredScopes:['users.readonly']}}, provisioning:{provision:async value=>provisioned.push(value)}, marketplaceInstall:{claim:async()=>true}, env:{GHL_APP_ID:'app'}, fetchImpl });
  return {service,provisioned,saved};
}
const response = data => ({ok:true,json:async()=>data});
const locationToken = locationId => ({access_token:'loc-access',refresh_token:'loc-refresh',locationId,companyId:'company',scope:'users.readonly',userType:'Location'});
test('preserves the agency bulk-install flag',()=>assert.equal(normalizeTokenResponse({isBulkInstallation:true,userType:'Company'}).isBulkInstallation,true));
test('paginates installed locations and excludes uninstalled accounts',async()=>{
  const calls=[];
  const {service}=fixture(async url=>{calls.push(new URL(url));return response(calls.length===1?{locations:Array.from({length:100},(_,i)=>({_id:`loc-${i}`,isInstalled:true}))}:{locations:[{_id:'extra',isInstalled:true},{_id:'removed',isInstalled:false}]});});
  assert.equal((await service.locations(agency)).length,101);
  assert.equal(calls[1].searchParams.get('skip'),'100');
  assert.equal(calls[0].searchParams.get('companyId'),'company');
  assert.equal(calls[0].searchParams.get('appId'),'app');
});
test('bulk install uses separate location tokens and reports partial failure',async()=>{
  const {service,provisioned,saved}=fixture(async (url,options)=>{
    if(url.includes('installedLocations')) return response({locations:[{_id:'a',isInstalled:true},{_id:'b',isInstalled:true}]});
    const id=JSON.parse(options.body).locationId;
    return response(locationToken(id==='a'?'a':'wrong-location'));
  });
  const result=await service.install(agency);
  assert.equal(result.connected,1);assert.equal(result.failed,1);
  assert.equal(result.results[1].code,'GHL_LOCATION_TOKEN_MISMATCH');
  assert.equal(provisioned[0].token.accessToken,'loc-access');
  assert.equal(provisioned[0].identity.locationId,'a');
  assert.equal(saved.length,1);
});
test('rejects cross-company tokens and missing permissions without provisioning',async()=>{
  for(const bad of [{...locationToken('a'),companyId:'other'},{...locationToken('a'),scope:'contacts.readonly'}]) {
    const {service,provisioned}=fixture(async()=>response(bad));
    await assert.rejects(service.provisionLocation(agency,'a'));assert.equal(provisioned.length,0);
  }
});
test('requires signed correlation when callback has no local OAuth state',async()=>{
  const {service,provisioned}=fixture(async()=>response(locationToken('a')));
  service.marketplaceInstall.claim=async()=>null;
  await assert.rejects(service.provisionLocation(agency,'a',{correlate:true}),{code:'GHL_MARKETPLACE_INSTALL_NOT_CORRELATED'});
  assert.equal(provisioned.length,0);
});
test('fails on repeated full pages instead of looping forever',async()=>{
  const {service}=fixture(async()=>response({locations:Array.from({length:100},(_,i)=>({_id:String(i),isInstalled:true}))}));
  await assert.rejects(service.locations(agency),{code:'GHL_AGENCY_PAGINATION_FAILED'});
});
