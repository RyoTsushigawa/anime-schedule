import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
// The Awards part of the votes helper: secret ballots in KV until "Auflösen".
const origin='https://ryotsushigawa.github.io';
function kv(){
 const data=new Map();
 return {data,
  get:async key=>data.has(key)?data.get(key):null,
  put:async (key,value)=>{data.set(key,value);},
  list:async ({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})};
}
const call=async (env,path,body,method=body?'POST':'GET')=>{
 const res=await worker.fetch(new Request('https://votes.test'+path,{method,headers:{Origin:origin,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)})}),env);
 return {status:res.status,body:await res.json()};
};
const season='Herbst 2026';

test('before Auflösen only the names of who voted are given out',async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 assert.equal((await call(env,'/awards/ballot',{season,person:'Rei',picks:{best:'Frieren',opening:'Gachiakuta'}})).status,200);
 assert.equal((await call(env,'/awards/ballot',{season,person:'Belly',picks:{best:'Frieren'}})).status,200);
 const state=(await call(env,'/awards?season='+encodeURIComponent(season))).body;
 assert.deepEqual(state,{season,revealed:false,voters:['Belly','Rei']});
 assert.doesNotMatch(JSON.stringify(state),/Frieren/);
});

test('voting again replaces the ballot; Auflösen shows all and closes voting',async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 await call(env,'/awards/ballot',{season,person:'Rei',picks:{best:'Frieren'}});
 await call(env,'/awards/ballot',{season,person:'Rei',picks:{best:'Dandadan',ending:'Frieren'}});
 assert.equal((await call(env,'/awards/reveal',{season})).status,200);
 const state=(await call(env,'/awards?season='+encodeURIComponent(season))).body;
 assert.equal(state.revealed,true);
 assert.deepEqual(state.ballots,[{person:'Rei',picks:{best:'Dandadan',ending:'Frieren'}}]);
 const late=await call(env,'/awards/ballot',{season,person:'Belly',picks:{best:'Frieren'}});
 assert.equal(late.status,409);
 // another season is separate
 assert.equal((await call(env,'/awards?season=Winter%202027')).body.revealed,false);
});

test('bad input, empty seasons and a missing store are refused',async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv()};
 for(const body of [
  {season:'Guckplan Herbst 2026',person:'Rei',picks:{best:'X'}},
  {season,person:'<b>Rei</b>',picks:{best:'X'}},
  {season,person:'Rei',picks:{worst:'X'}},
  {season,person:'Rei',picks:{best:''}},
  {season,person:'Rei',picks:{best:'<script>'}},
  {season,person:'Rei',picks:['X']},
 ])assert.equal((await call(env,'/awards/ballot',body)).status,400,JSON.stringify(body));
 assert.equal((await call(env,'/awards/reveal',{season})).status,409);
 assert.equal((await call({SITE_ORIGIN:origin},'/awards?season='+encodeURIComponent(season))).status,503);
 const foreign=await worker.fetch(new Request('https://votes.test/awards?season=Herbst%202026',{headers:{Origin:'https://evil.test'}}),env);
 assert.equal(foreign.status,403);
});

test('with a group code set, Awards need it too',async()=>{
 const env={SITE_ORIGIN:origin,AWARDS:kv(),GROUP_ACCESS_CODE:'TEST-ONLY-MEMBER-CODE-934257'};
 assert.equal((await call(env,'/awards?season='+encodeURIComponent(season))).status,401);
});
