import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import './votes-identity-stub.mjs';
// Anime-Börse in the votes helper: trading at the day's close, fees, T+1, short sales, circuit breaker
const origin='https://ryotsushigawa.github.io';
function kv(){
 const data=new Map();
 return {data,get:async key=>data.has(key)?data.get(key):null,put:async (key,value)=>{data.set(key,value);},delete:async key=>{data.delete(key);},
  list:async ({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})};
}
let n=0;
// a fresh "site" per test, with its own boerse-prices.json
function site(shows){
 const url='https://site'+(++n)+'.test/';
 const file={seasons:{'Winter 2027':{days:['2027-01-04'],shows}}};
 const real=globalThis.fetch;
 globalThis.fetch=async (u,init)=>String(u).startsWith(url+'boerse-prices.json')?new Response(JSON.stringify(file)):real(u,init);
 return {url,file};
}
const at=iso=>String(Date.parse(iso));
const env=(url,now='2027-01-04T15:00:00Z',store=kv())=>({SITE_ORIGIN:origin,AWARDS:store,SITE_URL:url,TEST_NOW:at(now)});
const call=async (e,path,body)=>{
 const res=await worker.fetch(new Request('https://votes.test'+path,{method:body?'POST':'GET',headers:{Origin:origin,'X-Person-Pin':'1234',...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)})}),e);
 return {status:res.status,body:await res.json()};
};
const season='Winter 2027';
const get=(e,person)=>call(e,'/stocks?season='+encodeURIComponent(season)+(person?'&person='+person:''));

test('the whole season is open: from 14 days before the start until the next season',async()=>{
 const {url}=site({});
 for(const [now,open] of [['2026-12-17T12:00:00Z',false],['2026-12-19T12:00:00Z',true],['2027-03-20T12:00:00Z',true],['2027-04-01T12:00:00Z',false]])
  assert.equal((await get(env(url,now))).body.open,open,now);
});

test('buy at the close plus a fee; a sale pays the next day (T+1); value and ranking',async()=>{
 const {url,file}=site({Frieren:{closes:[100,120]},Dandadan:{closes:[100,80]}});
 const store=kv(),e=env(url,'2027-01-04T15:00:00Z',store);
 let r=await call(e,'/stocks/trade',{season,person:'Rei',title:'Frieren',qty:5});
 assert.equal(r.status,200);
 assert.equal(r.body.account.cash,1000-600-1);
 r=await call(e,'/stocks/trade',{season,person:'Rei',title:'Frieren',qty:-2});
 assert.equal(r.body.account.cash,399,'not yet');
 assert.deepEqual(r.body.account.pending,[{amount:239,on:'2027-01-05'}]);
 // the same day: that money can't buy yet
 assert.equal((await call(e,'/stocks/trade',{season,person:'Rei',title:'Dandadan',qty:5})).status,400);
 file.seasons[season].days.push('2027-01-05');file.seasons[season].shows.Frieren.closes.push(130);
 const next={...e,TEST_NOW:at('2027-01-05T15:00:00Z')};
 const state=(await get(next,'Rei')).body;
 assert.equal(state.account.cash,638);
 assert.deepEqual(state.account.holdings,{Frieren:3});
 assert.equal(state.ranking[0].person,'Rei');
 assert.equal(state.portfolios,undefined,'holdings stay private during the season');
});

test('short sales up to 1000 Taler; circuit breaker halts a show for the day; bad input',async()=>{
 const {url}=site({Frieren:{closes:[100,120]},Dandadan:{closes:[100,90],halted:'2027-01-04'}});
 const e=env(url);
 let r=await call(e,'/stocks/trade',{season,person:'Mia',title:'Frieren',qty:-8});
 assert.equal(r.status,200);
 assert.deepEqual(r.body.account.holdings,{Frieren:-8});
 assert.equal((await call(e,'/stocks/trade',{season,person:'Mia',title:'Frieren',qty:-1})).status,400,'over 1000 Taler short');
 r=await call(e,'/stocks/trade',{season,person:'Mia',title:'Dandadan',qty:1});
 assert.equal(r.status,409);
 assert.match(r.body.error,/Circuit Breaker/);
 for(const body of [{title:'Frieren',qty:0},{title:'Frieren',qty:1.5},{title:'Frieren',qty:51},{title:'Nope',qty:1},{title:'<b>',qty:1}])
  assert.equal((await call(e,'/stocks/trade',{season,person:'Mia',...body})).status,400,JSON.stringify(body));
 assert.equal((await call(env(url,'2027-04-02T12:00:00Z'),'/stocks/trade',{season,person:'Mia',title:'Frieren',qty:1})).status,409,'season over');
});

test('after the season everyone sees everyone\'s holdings',async()=>{
 const {url}=site({Frieren:{closes:[100]}});
 const store=kv();
 await call(env(url,'2027-01-04T15:00:00Z',store),'/stocks/trade',{season,person:'Rei',title:'Frieren',qty:2});
 const state=(await get(env(url,'2027-04-02T12:00:00Z',store))).body;
 assert.deepEqual(state.portfolios.map(p=>[p.person,p.holdings]),[['Rei',{Frieren:2}]]);
});
