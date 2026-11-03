// Downloads Cardmarket's official daily price guide and writes prices.json for the tracker page.
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const here=path.dirname(fileURLToPath(import.meta.url));
const cards=JSON.parse(fs.readFileSync(path.join(here,'cards.json'),'utf8'));
const r=await fetch('https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json');
if(!r.ok)throw new Error('price guide HTTP '+r.status);
const g=await r.json();const by=new Map(g.priceGuides.map(p=>[p.idProduct,p]));
if(by.size<1000)throw new Error('price guide looks truncated: '+by.size);
const file=path.join(here,'prices.json');
const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{prices:{},history:[]};
const day=g.createdAt.slice(0,10);
const prices={};
for(const c of cards)for(const p of c.prints){if(!p.pid)continue;const x=by.get(p.pid);const was=old.prices?.[p.pid];
 // Keep the previous day's price when the guide has not moved on, so the change column survives re-runs.
 const prevLow=old.guideDate?.slice(0,10)===day?was?.prevLow??null:was?.low??null;
 prices[p.pid]={low:x?.low??null,trend:x?.trend??null,avg30:x?.avg30??null,prevLow}}
const cheapest=c=>Math.min(...c.prints.map(p=>prices[p.pid]?.low??Infinity));
const counted=cards.filter(c=>!c.verify&&isFinite(cheapest(c)));
const total=counted.reduce((s,c)=>s+cheapest(c),0);
const history=[...(old.history||[]).filter(h=>h.d!==day),{d:day,total:+total.toFixed(2)}].slice(-90);
fs.writeFileSync(file,JSON.stringify({source:'Cardmarket price guide',guideDate:g.createdAt,prices,history}));
console.log('guide',g.createdAt,'priced',counted.length,'of',cards.length,'sum of cheapest lows',total.toFixed(2));
