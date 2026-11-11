import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import worker from '../workers/season-votes/index.js';

const origin='https://ryotsushigawa.github.io';
const code='TEST-ONLY-MEMBER-CODE-934257';
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});
const env={SITE_ORIGIN:origin,GROUP_ACCESS_CODE:code,SHEET_ID:'example-sheet',
 GOOGLE_SERVICE_ACCOUNT_EMAIL:'example@project.iam.gserviceaccount.com',GOOGLE_PRIVATE_KEY:privateKey};
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
function request(path,method='GET',body,key=code,requestOrigin=origin){
 return new Request('https://example.workers.dev'+path,{
  method,headers:{Origin:requestOrigin,'X-Group-Code':key,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
async function fakeSheets(run,{tab='Winter 2027',stored='Default',person='Rei',readBack=null}={}){
 const original=globalThis.fetch, events=[];
 globalThis.fetch=async (url,options={})=>{
  const dest=String(url),method=options.method||'GET';
  events.push({dest,method});
  if(dest.includes('graphql.anilist.co'))throw Error('Unexpected AniList request');
  if(dest.includes('oauth2.googleapis.com/token'))return json({access_token:'fake-google-token'});
  if(dest.includes('fields=sheets'))return json({sheets:[{properties:{sheetId:17,title:tab}}]});
  if(dest.includes('A1%3AAZ2000'))return json({values:[
   ['Anime Titel','Eng Anime Titel','Uhrzeit','Rei','MaRyo','Quecks'],
   ['Example','Example','20:00',stored,'Default','Default']
  ]});
  if(dest.includes('/values/')&&method==='PUT'){
   stored=JSON.parse(options.body).values[0][0];
   return json({updatedCells:1});
  }
  if(dest.includes('/values/')&&method==='GET')return json({values:[[readBack??stored]]});
  throw Error('Unexpected network '+method+' '+dest);
 };
 try{await run(events,()=>stored);}finally{globalThis.fetch=original;}
}
test('group code opens voting without AniList or person mapping',async()=>{
 const res=await worker.fetch(request('/access'),env);
 assert.equal(res.status,200);assert.equal((await res.json()).ok,true);
});
test('wrong, missing or short code is denied',async()=>{
 for(const bad of ['wrong','',null]){
  const res=await worker.fetch(request('/access','GET',undefined,bad??''),env);
  assert.equal(res.status,401);
 }
});
test('refuses access when the code is not configured securely',async()=>{
 const res=await worker.fetch(request('/access'),{...env,GROUP_ACCESS_CODE:''});
 assert.equal(res.status,503);
});
test('cross-origin browser requests are rejected',async()=>{
 const res=await worker.fetch(request('/access','GET',undefined,code,'https://other.example'),env);
 assert.equal(res.status,403);
});
test('a friend may vote for a named Google Sheet column after unlocking',async()=>{
 await fakeSheets(async(events,stored)=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'Rei',choice:'Ja',expected:'Default'}),env);
  assert.equal(res.status,200,JSON.stringify(await res.clone().json()));
  assert.equal(stored(),'Ja');
  assert.ok(events.some(event=>event.method==='PUT'));
  assert.ok(events.filter(event=>event.dest.includes('/values/')).length>=3);
 });
});
test('unknown person is refused even with valid group code',async()=>{
 await fakeSheets(async()=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'MadeUp',choice:'Ja',expected:'Default'}),env);
  assert.equal(res.status,409);
 });
});
test('Okinawa 3 only for Quecks, Rei, Terra',async()=>{
 const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'MaRyo',choice:'Okinawa 3'}),env);
 assert.equal(res.status,403);
});
test('Default remains valid only as a reset value',async()=>{
 await fakeSheets(async()=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'Rei',choice:'Default',expected:'Default'}),env);
  assert.equal(res.status,200);
 });
});
test('Guckplan tabs cannot be edited using the group code',async()=>{
 await fakeSheets(async()=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'Rei',choice:'Ja'}),env);
  assert.equal(res.status,403);
 },{tab:'Guckplan Winter 2027'});
});
test('conflicting prior vote is not overwritten',async()=>{
 await fakeSheets(async(events)=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'Rei',choice:'Ja',expected:'Default'}),env);
  assert.equal(res.status,409);
  assert.equal(events.some(event=>event.method==='PUT'),false);
 },{stored:'Nein'});
});
test('readback mismatch does not send false success',async()=>{
 await fakeSheets(async()=>{
  const res=await worker.fetch(request('/vote','POST',{gid:'17',title:'Example',person:'Rei',choice:'Ja',expected:'Default'}),env);
  assert.equal(res.status,409);
 },{readBack:'Nein'});
});
