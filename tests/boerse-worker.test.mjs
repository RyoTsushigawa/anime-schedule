import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
// Anime-Börse in the votes helper: portfolios, only while trading is open at the start of a season
const origin='https://ryotsushigawa.github.io';
function kv(){
 const data=new Map();
 return {data,get:async key=>data.has(key)?data.get(key):null,put:async (key,value)=>{data.set(key,value);},
  list:async ({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})};
}
const call=async (env,path,body)=>{
 const res=await worker.fetch(new Request('https://votes.test'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)})}),env);
 return {status:res.status,body:await res.json()};
};
const season='Winter 2027';
const at=iso=>String(Date.parse(iso));

test('trading is open from 14 days before to 14 days after the season starts',async()=>{
 const store=kv();
 for(const [now,open] of [['2026-12-17T12:00:00Z',false],['2026-12-19T12:00:00Z',true],['2027-01-10T12:00:00Z',true],['2027-01-15T12:00:00Z',false]]){
  const state=(await call({SITE_ORIGIN:origin,AWARDS:store,TEST_NOW:at(now)},'/stocks?season='+encodeURIComponent(season))).body;
  assert.equal(state.open,open,now);
  assert.equal(state.cash,1000);
 }
});

test('a portfolio spends at most 1000 Taler at 100 a share; secret while open, everyone\'s after',async()=>{
 const store=kv(),open={SITE_ORIGIN:origin,AWARDS:store,TEST_NOW:at('2027-01-02T12:00:00Z')};
 assert.equal((await call(open,'/stocks/portfolio',{season,person:'Rei',holdings:{Frieren:6,Dandadan:4}})).status,200);
 const saved=await call(open,'/stocks/portfolio',{season,person:'Mia',holdings:{Frieren:2,Dandadan:0}});
 assert.deepEqual(saved.body.holdings,{Frieren:2});
 assert.equal(saved.body.cash,800);
 for(const holdings of [{Frieren:11},{Frieren:6,Dandadan:5},{Frieren:-1},{Frieren:1.5},{'<b>':1}])
  assert.equal((await call(open,'/stocks/portfolio',{season,person:'Bad',holdings})).status,400,JSON.stringify(holdings));
 let state=(await call(open,'/stocks?season='+encodeURIComponent(season)+'&person=Rei')).body;
 assert.deepEqual(state.traders,['Mia','Rei']);
 assert.deepEqual(state.mine,{Frieren:6,Dandadan:4});
 assert.equal(state.portfolios,undefined);
 const closed={SITE_ORIGIN:origin,AWARDS:store,TEST_NOW:at('2027-02-01T12:00:00Z')};
 assert.equal((await call(closed,'/stocks/portfolio',{season,person:'Rei',holdings:{Frieren:1}})).status,409);
 state=(await call(closed,'/stocks?season='+encodeURIComponent(season))).body;
 assert.deepEqual(state.portfolios,[{person:'Mia',holdings:{Frieren:2}},{person:'Rei',holdings:{Frieren:6,Dandadan:4}}]);
});
