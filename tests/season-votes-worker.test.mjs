import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import {generateKeyPairSync} from 'node:crypto';

const origin='https://ryotsushigawa.github.io';
const allowlist={123:{person:'MaRyo',delegates:['Rei']},456:{person:'Quecks'}};
const env={SITE_ORIGIN:origin,VOTER_MAP_JSON:JSON.stringify(allowlist)};
const oldFetch=globalThis.fetch;
function request(path,method='GET',body,token='this-is-test-token-only'){
 return new Request('https://example.workers.dev'+path,{
  method,headers:{Origin:origin,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function withAniList(identity,run){
 globalThis.fetch=async (url,opts)=>{
  if(String(url).includes('graphql.anilist.co'))return new Response(JSON.stringify({data:{Viewer:identity}}),{
   status:200,headers:{'Content-Type':'application/json'}});
  throw Error('Unexpected network call '+url);
 };
 try{return await run();}finally{globalThis.fetch=oldFetch;}
}
test('member mapping comes from verified AniList ID, not browser-picked name',async()=>{
 await withAniList({id:123,name:'Verified Anime Account'},async()=>{
  const response=await worker.fetch(request('/me'),env);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.person,'MaRyo');
  assert.deepEqual(result.delegates,['Rei']);
  assert.equal(result.account,'Verified Anime Account');
 });
});
test('unknown AniList account cannot vote',async()=>{
 await withAniList({id:999,name:'Unknown'},async()=>{
  const response=await worker.fetch(request('/vote','POST',{
   gid:'123',title:'Example',person:'MaRyo',choice:'Ja'
  }),env);
  assert.equal(response.status,403);
 });
});
test('delegates cannot use Okinawa 3 outside permitted people',async()=>{
 await withAniList({id:123,name:'Verified'},async()=>{
  const response=await worker.fetch(request('/vote','POST',{
   gid:'123',title:'Example',person:'MaRyo',choice:'Okinawa 3'
  }),env);
  assert.equal(response.status,403);
 });
});
test('visitor outside the allowed site origin cannot access voter mapping',async()=>{
 const response=await worker.fetch(new Request('https://example.workers.dev/me',{
  headers:{Origin:'https://unrelated.example',Authorization:'Bearer this-is-test-token-only'}
 }),env);
 assert.equal(response.status,403);
});
test('incorrect vote option is rejected before any Sheet write',async()=>{
 await withAniList({id:123,name:'Verified'},async()=>{
  const response=await worker.fetch(request('/vote','POST',{
   gid:'123',title:'Example',person:'MaRyo',choice:'Something else'
  }),env);
  assert.equal(response.status,400);
 });
});

test('vote is acknowledged only after Google Sheet updates and readback confirms',async()=>{
 const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
 const sheetEnv={...env,SHEET_ID:'test-sheet',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.iam.gserviceaccount.com',GOOGLE_PRIVATE_KEY:privateKey};
 let stored='Default';
 const original=globalThis.fetch;
 const observed=[];
 globalThis.fetch=async (url,options={})=>{
  const path=String(url),method=options.method||'GET';
  observed.push(method+' '+path);
  const data=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  if(path.includes('graphql.anilist.co'))return data({data:{Viewer:{id:123,name:'Verified'}}});
  if(path.includes('oauth2.googleapis.com/token'))return data({access_token:'test-google-access'});
  if(path.includes('fields=sheets'))return data({sheets:[{properties:{sheetId:17,title:'Winter 2027'}}]});
  if(path.includes('A1%3AAZ2000'))return data({values:[
   ['Anime Titel','Eng Anime Titel','Uhrzeit','MaRyo','Rei'],
   ['Example','Example','20:00',stored,'Default']
  ]});
  if(path.includes('values/')&&method==='PUT'){
   const body=JSON.parse(options.body);
   stored=body.values[0][0];
   return data({updatedCells:1});
  }
  if(path.includes('values/')&&method==='GET')return data({values:[[stored]]});
  throw Error('Unexpected request '+method+' '+path);
 };
 try{
  const response=await worker.fetch(request('/vote','POST',{
   gid:'17',title:'Example',person:'MaRyo',choice:'Ja',expected:'Default'
  }),sheetEnv);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(stored,'Ja');
  assert.ok(observed.some(x=>x.startsWith('PUT ')));
  assert.ok(observed.filter(x=>x.includes('values/')).length>=3);
 }finally{globalThis.fetch=original;}
});

test('voting API refuses false save confirmations when readback disagrees',async()=>{
 const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
 const sheetEnv={...env,SHEET_ID:'test-sheet',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test@example.iam.gserviceaccount.com',GOOGLE_PRIVATE_KEY:privateKey};
 const original=globalThis.fetch;
 const data=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async (url,options={})=>{
  const path=String(url),method=options.method||'GET';
  if(path.includes('graphql.anilist.co'))return data({data:{Viewer:{id:123,name:'Verified'}}});
  if(path.includes('oauth2.googleapis.com/token'))return data({access_token:'fake-google-access'});
  if(path.includes('fields=sheets'))return data({sheets:[{properties:{sheetId:17,title:'Winter 2027'}}]});
  if(path.includes('A1%3AAZ2000'))return data({values:[
   ['Anime Titel','Eng Anime Titel','Uhrzeit','MaRyo'],['Example','Example','20:00','Default']
  ]});
  if(path.includes('values/')&&method==='PUT')return data({updatedCells:1});
  if(path.includes('values/')&&method==='GET')return data({values:[['Default']]});
  throw Error('Unexpected request '+method+' '+path);
 };
 try{
  const response=await worker.fetch(request('/vote','POST',{
   gid:'17',title:'Example',person:'MaRyo',choice:'Ja',expected:'Default'
  }),sheetEnv);
  assert.equal(response.status,409);
 }finally{globalThis.fetch=original;}
});
