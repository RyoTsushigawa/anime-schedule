// Writes offers.json: who sells each card on CardTrader right now and what they charge to ship to
// you, for the tracker's auto-grouper. Needs a CardTrader API token, from the CARDTRADER_TOKEN
// environment variable (GitHub secret) or a local cardtrader-token.txt that never gets published.
// Usage: node fetch-offers.mjs
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const here=path.dirname(fileURLToPath(import.meta.url));
const tokenFile=path.join(here,'cardtrader-token.txt');
const token=process.env.CARDTRADER_TOKEN||(fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():'');
if(!token){console.error('No CardTrader token found.');process.exit(1)}
const BASE=process.env.CT_BASE||'https://api.cardtrader.com/api/v2';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(url,tries=4){
 const r=await fetch(BASE+url,{headers:{Authorization:'Bearer '+token}});
 if(r.ok)return r.json();
 if(r.status===401)throw new Error('CardTrader refused the token (401)');
 if(tries>0&&(r.status===429||r.status>=500)){await sleep(3000);return api(url,tries-1)}
 throw new Error(url+' answered '+r.status);
}
// Runs jobs with a fixed gap between starts, to stay under CardTrader's rate limits.
async function paced(list,gapMs,fn){const running=[];for(const x of list){running.push(fn(x));await sleep(gapMs)}return Promise.all(running)}
const list=x=>Array.isArray(x)?x:x.array||[];

const cards=JSON.parse(fs.readFileSync(path.join(here,'cards.json'),'utf8'));
const byPid=new Map();
for(const c of cards)for(const p of c.prints)if(p.pid)byPid.set(Number(p.pid),{card:c,print:p});
// Cards added on the page reach this job as files in watch/, each a list of [cardId, [cardmarketIds]].
const watchDir=path.join(here,'watch');
if(fs.existsSync(watchDir))for(const f of fs.readdirSync(watchDir).filter(x=>x.endsWith('.json'))){
 let list=[];try{list=JSON.parse(fs.readFileSync(path.join(watchDir,f),'utf8'))}catch{console.log('skipped unreadable',f);continue}
 for(const [id,pids] of list)for(const pid of pids)if(!byPid.has(Number(pid)))byPid.set(Number(pid),{card:{id},print:null});
}

// Step 1: find CardTrader's id for each print, through the Cardmarket ids it stores on blueprints.
const game=list(await api('/games')).find(g=>/pok/i.test(g.name)&&!/japan/i.test(g.name));
if(!game)throw new Error('CardTrader lists no Pokémon game');
const expansions=list(await api('/expansions')).filter(e=>e.game_id===game.id);
const blueprints=[];
await paced(expansions,100,async e=>{
 for(const b of list(await api('/blueprints/export?expansion_id='+e.id)))
  for(const id of b.card_market_ids||[])if(byPid.has(id))blueprints.push({id:b.id,...byPid.get(id)});
});

// Step 2: the 25 cheapest offers per print. Graded copies, bundles and sellers on holiday are out.
const offers={},sellers=new Set();let skippedCurrency=0;
await paced(blueprints,125,async b=>{
 const res=await api('/marketplace/products?blueprint_id='+b.id);
 for(const o of res[b.id]||[]){
  if(o.quantity<1||o.on_vacation||o.graded||o.bundle_size>1||o.user?.on_vacation)continue;
  if(o.price?.currency!=='EUR'){skippedCurrency++;continue}
  const props=o.properties_hash||{};
  (offers[b.card.id]??=[]).push({seller:o.user.username,country:o.user.country_code,price:o.price.cents/100,
   lang:props.pokemon_language||'',cond:props.condition||'',hub:!!o.user.can_sell_via_hub,
   label:b.print?`${b.print.set} ${b.print.num}`:'',link:'https://www.cardtrader.com/cards/'+b.id});
  sellers.add(o.user.username);
 }
});

// Step 3: each seller's cheapest way to send a small envelope (about 20 g) to you.
const shipping={};
await paced([...sellers],60,async name=>{
 const methods=list(await api('/shipping_methods?'+new URLSearchParams({username:name})));
 let best=null;
 for(const m of methods){
  const cost=(m.shipping_method_costs||[]).find(x=>x.to_grams>=20);
  if(!cost)continue;
  if(!best||cost.price.cents<best.cents)best={cents:cost.price.cents,tracked:m.tracked,name:m.name,
   freeFrom:m.free_shipping_threshold_price?m.free_shipping_threshold_price.cents/100:null};
 }
 if(best)shipping[name]={cost:best.cents/100,tracked:best.tracked,method:best.name,freeFrom:best.freeFrom};
});
// A seller with no way to ship here is no use.
for(const id in offers){offers[id]=offers[id].filter(o=>shipping[o.seller]);if(!offers[id].length)delete offers[id]}

fs.writeFileSync(path.join(here,'offers.json'),JSON.stringify({generated:new Date().toISOString(),cards:offers,shipping}));
console.log(`prints matched ${blueprints.length} of ${byPid.size}, cards with offers ${Object.keys(offers).length} of ${cards.length}, sellers ${Object.keys(shipping).length}, non-euro skipped ${skippedCurrency}`);
