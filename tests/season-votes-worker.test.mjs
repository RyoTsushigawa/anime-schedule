import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';

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
