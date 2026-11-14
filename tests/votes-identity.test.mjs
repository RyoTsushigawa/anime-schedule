import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import './votes-identity-stub.mjs';
// Only for yourself: Awards ballots and Börse orders need your AniList login, or your PIN without AniList
const origin='https://ryotsushigawa.github.io';
function kv(){
 const data=new Map();
 return {data,get:async k=>data.has(k)?data.get(k):null,put:async (k,v)=>{data.set(k,v);},delete:async k=>{data.delete(k);},
  list:async ({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})};
}
const call=async (env,path,body,headers={})=>{
 const res=await worker.fetch(new Request('https://votes.test'+path,{method:body?'POST':'GET',headers:{Origin:origin,...headers,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)})}),env);
 return {status:res.status,body:await res.json()};
};
const season='Herbst 2040', stockSeason='Herbst 2026';
const ballot=(person,headers,env)=>call(env,'/awards/ballot',{season,person,picks:{best:['Frieren']}},headers);

test('AniList: the login decides the person; MaRyo\'s two accounts are Ryo and Marvin', async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 assert.equal((await ballot('Ryo',{'X-AniList-Token':'tok-RyoTsushigawa'},env)).status,200);
 assert.equal((await ballot('Marvin',{'X-AniList-Token':'tok-MilkyWay95'},env)).status,200);
 let r=await ballot('Marvin',{'X-AniList-Token':'tok-RyoTsushigawa'},env);
 assert.equal(r.status,403);
 assert.match(r.body.error,/nur als Ryo/);
 assert.equal((await ballot('Terra',{'X-AniList-Token':'tok-RyoTsushigawa'},env)).status,403);
 r=await ballot('Ryo',{'X-AniList-Token':'tok-SomeoneElse'},env);
 assert.match(r.body.error,/nicht in „Wer ist wer“/);
 assert.equal((await ballot('Ryo',{'X-AniList-Token':'expired'},env)).status,401);
 // someone with AniList can't be claimed with a PIN
 r=await ballot('Ryo',{'X-Person-Pin':'1234'},env);
 assert.equal(r.status,403);
 assert.match(r.body.error,/mit AniList an/);
});

test('PIN: set the first time, then needed; 5 wrong tries lock it; the owner resets it', async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 assert.equal((await ballot('Sophie',{},env)).status,401,'no PIN');
 assert.equal((await ballot('Sophie',{'X-Person-Pin':'12'},env)).status,401,'too short');
 assert.equal((await ballot('Sophie',{'X-Person-Pin':'sophie-1'},env)).status,200,'set');
 assert.ok(!JSON.stringify([...env.AWARDS.data.values()]).includes('sophie-1'),'only a hash is kept');
 assert.equal((await ballot('Sophie',{'X-Person-Pin':'sophie-1'},env)).status,200);
 for(let i=0;i<5;i++)assert.equal((await ballot('Sophie',{'X-Person-Pin':'wrong-'+i},env)).status,403);
 assert.equal((await ballot('Sophie',{'X-Person-Pin':'sophie-1'},env)).status,429,'locked');
 assert.equal((await call(env,'/identity?person=Sophie')).body.pinSet,true);
 assert.equal((await call(env,'/identity/pin-reset',{person:'Sophie'},{'X-Owner-Key':'nope'})).status,403);
 assert.equal((await call(env,'/identity/pin-reset',{person:'Sophie'},{'X-Owner-Key':'owner-key'})).status,200);
 assert.equal((await call(env,'/identity?person=Sophie')).body.pinSet,false);
 assert.equal((await ballot('Sophie',{'X-Person-Pin':'new-pin'},env)).status,200,'a new PIN after the reset');
 assert.deepEqual((await call(env,'/identity?person=Ryo')).body,{person:'Ryo',anilist:['ryotsushigawa'],pinSet:false});
});

test('Börse: your own account only with your login; orders only for yourself', async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv(),TEST_NOW:String(Date.parse('2026-11-14T12:00:00Z'))};
 const real=globalThis.fetch;
 globalThis.fetch=async (u,init)=>/boerse-prices\.json/.test(String(u))?new Response(JSON.stringify({seasons:{[stockSeason]:{days:['2026-11-14'],shows:{Frieren:{closes:[100]}}}}})):real(u,init);
 try{
  const order=(person,headers)=>call(env,'/stocks/trade',{season:stockSeason,person,title:'Frieren',qty:1},headers);
  assert.equal((await order('Ryo',{'X-AniList-Token':'tok-MilkyWay95'})).status,403,'Marvin can\'t buy for Ryo');
  assert.equal((await order('Ryo',{'X-AniList-Token':'tok-RyoTsushigawa'})).status,200);
  const peek=await call(env,'/stocks?season='+encodeURIComponent(stockSeason)+'&person=Ryo',null,{'X-AniList-Token':'tok-MilkyWay95'});
  assert.equal(peek.status,403,'nobody looks into someone else\'s account');
  const mine=await call(env,'/stocks?season='+encodeURIComponent(stockSeason)+'&person=Ryo',null,{'X-AniList-Token':'tok-RyoTsushigawa'});
  assert.deepEqual(mine.body.account.holdings,{Frieren:1});
  const open=await call(env,'/stocks?season='+encodeURIComponent(stockSeason));
  assert.equal(open.body.account,null);
  assert.equal(open.body.ranking[0].person,'Ryo');
 }finally{globalThis.fetch=real;}
});

test('an AniList outage is not called an expired login; a login confirmed earlier still works during it', async t=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 const before=globalThis.fetch;
 t.after(()=>{ globalThis.fetch=before; });
 // confirmed once while AniList answers
 assert.equal((await ballot('Ryo',{'X-AniList-Token':'tok-RyoTsushigawa'},env)).status,200);
 assert.ok([...env.AWARDS.data.keys()].some(k=>k.startsWith('login:')),'the confirmation is remembered (as a hash)');
 assert.ok(![...env.AWARDS.data.values()].some(v=>String(v).includes('tok-')),'never the login itself');
 // AniList down (503) or rate-limited (429): a new login gets a clear "AniList antwortet nicht", not "abgelaufen"
 let calls=0;
 globalThis.fetch=async (url,init)=>String(url)==='https://graphql.anilist.co'?(calls++,new Response('busy',{status:calls%2?503:429})):before(url,init);
 const r=await ballot('Marvin',{'X-AniList-Token':'tok-MilkyWay95'},env);
 assert.equal(r.status,503);
 assert.match(r.body.error,/AniList antwortet gerade nicht/);
 assert.equal(calls,2,'one more try before giving up');
 // the login confirmed before still works without AniList
 calls=0;
 assert.equal((await ballot('Ryo',{'X-AniList-Token':'tok-RyoTsushigawa'},env)).status,200);
 assert.equal(calls,0);
});

// AniList logins are JWTs with the user ID ("sub") and the expiry ("exp"); AniList blocks Cloudflare (403)
const jwt=(sub,exp=Math.floor(Date.now()/1000)+86400)=>['e30',Buffer.from(JSON.stringify({sub:String(sub),exp})).toString('base64url'),'sig'].join('.');
test('AniList blocks the helper: the user ID in the login decides, via anilist-ids.json', async t=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 const before=globalThis.fetch;
 t.after(()=>{ globalThis.fetch=before; });
 let asked=0;
 globalThis.fetch=async (url,init)=>String(url)==='https://graphql.anilist.co'?(asked++,new Response('Forbidden',{status:403})):before(url,init);
 assert.equal((await ballot('Ryo',{'X-AniList-Token':jwt(101)},env)).status,200);
 assert.equal((await ballot('Marvin',{'X-AniList-Token':jwt(102)},env)).status,200);
 assert.equal(asked,0,'AniList isn\'t asked for a login with an ID');
 let r=await ballot('Marvin',{'X-AniList-Token':jwt(101)},env);
 assert.equal(r.status,403);
 assert.match(r.body.error,/nur als Ryo/);
 r=await ballot('Ryo',{'X-AniList-Token':jwt(999)},env);
 assert.equal(r.status,403);
 assert.match(r.body.error,/nicht in „Wer ist wer“/);
 r=await ballot('Ryo',{'X-AniList-Token':jwt(101,Math.floor(Date.now()/1000)-60)},env);
 assert.equal(r.status,401);
 assert.match(r.body.error,/abgelaufen/);
});
