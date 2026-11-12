const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const eur=v=>v==null||!isFinite(v)?'–':'€'+v.toFixed(2);
let baseCards=[],cards=[],prices={},guideDate='';
let state={owned:{},pick:{},vendors:{},ship:{letter:1.5,tracked:4.5,threshold:25}};
let ui={fam:'All',q:'',sort:'name',expansion:'',hide:false,open:new Set()};
let sharing=null;let nameIndex=PokemonNames.create([]);

const LS='piplup-masterset';
function loadLocal(){try{const s=localStorage.getItem(LS);if(s)Object.assign(state,JSON.parse(s))}catch{}}
function save(){
  try{localStorage.setItem(LS,JSON.stringify(state))}catch{}
  sharing?.changed();
}


const printsOf=c=>c.prints.map(p=>({...p,...(p.pid&&prices[p.pid]||{})}));
function bestIn(c,lang){return printsOf(c).filter(p=>p.low!=null&&(!lang||p.region===lang)).sort((a,b)=>a.low-b.low)[0]||null}
// The chosen language wins; a card with no priced print in it falls back to its cheapest print.
function best(c){return (state.lang&&bestIn(c,state.lang))||bestIn(c)}
function bestForView(c){if(!ui.expansion)return best(c);const prints=printsOf(c).filter(p=>p.set===ui.expansion&&p.low!=null);return prints.filter(p=>!state.lang||p.region===state.lang).sort((a,b)=>a.low-b.low)[0]||prints.sort((a,b)=>a.low-b.low)[0]||null;}
const LANGS=[['International','Intl'],['Japanese','JP'],['Chinese','CN'],['Korean','KR'],['Indonesian','ID'],['Thai','TH']];
function langRow(c){
  const b=best(c);
  return LANGS.filter(([r])=>c.prints.some(p=>p.region===r)).map(([r,s])=>{
    const x=bestIn(c,r);
    return `<span class="lang${b&&x&&x.pid===b.pid?' on':''}" title="${r}">${s} ${x?eur(x.low):'no price'}</span>`}).join('');
}
function pickOf(id){return state.pick[id]||{}}
// Priced means safe to add to a total. Cards flagged verify have a listing nobody has confirmed yet.
function priceOf(c){const p=pickOf(c.id);if(p.price!=null&&p.price!=='')return +p.price;const b=best(c);return b&&!c.verify?b.low:null}
function shipFor(sub){return sub>=state.ship.threshold?state.ship.tracked:state.ship.letter}
// Direct card page when known, else the set's page, else Cardmarket's list of every version of that Pokémon.
function cmLink(c,p){
  if(p&&(p.url||p.setUrl))return p.url||p.setUrl;
  if(c.family==='Cameo')return null;
  if(c.added)return speciesLink(c);
  return 'https://www.cardmarket.com/en/Pokemon/Species/'+c.family;
}
function speciesLink(c){return c.species?'https://www.cardmarket.com/en/Pokemon/Species/'+encodeURIComponent(c.species):null}
// Cardmarket's language ids, for opening a card page already filtered to one language.
const CM_LANG={EN:1,FR:2,DE:3,ES:4,IT:5,PT:8,JP:7,'中文':11};
function langLinks(p){
  if(!p||!p.url||!p.url.includes('cardmarket.com'))return '';
  const set=p.region==='International'?['EN','DE','FR','ES','IT','PT']:p.region==='Japanese'?['JP']:p.region==='Chinese'?['中文']:[];
  return set.length>1?`<div class="links">Only in: ${set.map(l=>`<a href="${p.url}?language=${CM_LANG[l]}" target="_blank" rel="noopener">${l}</a>`).join('')}</div>`:'';
}
function ebLink(c,p){const lang=p&&p.region!=='International'?p.region.toLowerCase()+' ':'';return 'https://www.ebay.de/sch/i.html?_nkw='+encodeURIComponent('pokemon '+lang+c.name+' '+(p?p.num:''))}

// The cards being collected: leaving some out removes them from the list, the counts, the totals and the auto-grouper.
const isCameo=c=>c.family==='Cameo',noPrice=c=>priceOf(c)==null;
function inSet(){const x=state.exclude||{};return cards.filter(c=>!(x.cameo&&isCameo(c))&&!(x.noPrice&&noPrice(c))&&!x.fam?.[c.family])}
const families=()=>[...new Set(cards.map(c=>c.family))];
function totals(){
  const open=inSet().filter(c=>!state.owned[c.id]);
  const groups={};let loose=0,looseShip=0,looseN=0,unpriced=0;
  for(const c of open){
    const v=(pickOf(c.id).vendor||'').trim(),pr=priceOf(c);
    if(pr==null){unpriced++;continue}
    if(v){(groups[v]??=[]).push(c)}else{loose+=pr;looseShip+=shipFor(pr);looseN++}
  }
  let items=loose,ship=looseShip;
  const orders=Object.entries(groups).map(([v,list])=>{
    const sub=list.reduce((s,c)=>s+priceOf(c),0);
    const own=state.vendors[v]?.ship;
    const sh=own!=null&&own!==''?+own:shipFor(sub);
    const alone=list.reduce((s,c)=>s+shipFor(priceOf(c)),0);
    items+=sub;ship+=sh;
    return{v,list,sub,sh,saved:alone-sh};
  }).sort((a,b)=>b.list.length-a.list.length);
  const trend=open.reduce((s,c)=>{const b=best(c);return s+(b&&!c.verify&&b.trend?b.trend:0)},0);
  return{open,orders,loose,looseShip,looseN,unpriced,items,ship,trend};
}

function renderLedger(){
  const t=totals(),n=inSet().length,own=n-t.open.length;
  $('ledger').innerHTML=`
   <div><b>${own} / ${n}</b><span>cards owned</span><div class="bar"><i style="width:${n?own/n*100:0}%"></i></div></div>
   <div><b>${eur(t.items+t.ship)}</b><span>left to spend, ${eur(t.ship)} of it shipping</span></div>
   ${t.unpriced?`<div><b>${t.unpriced}</b><span>cards with no price, not counted</span></div>`:''}`;
}

function renderFam(){
  const x=state.exclude||{},shown=families().filter(f=>!(f==='Cameo'&&x.cameo)&&!x.fam?.[f]);
  if(ui.fam!=='All'&&!shown.includes(ui.fam))ui.fam='All';
  $('fam').innerHTML=['All',...shown].map(f=>`<button class="chip" aria-pressed="${ui.fam===f}" data-fam="${esc(f)}">${esc(f)}</button>`).join(' ');
}

function cardHtml(c){
  const own=!!state.owned[c.id],all=printsOf(c),b=bestForView(c),p=pickOf(c.id);
  const delta=b&&b.prevLow!=null&&b.prevLow!==b.low?`<span class="${b.low>b.prevLow?'up':'down'}">${b.low>b.prevLow?'▲':'▼'} ${eur(Math.abs(b.low-b.prevLow))}</span>`:'';
  const pr=priceOf(c),targetPrint=b||(ui.expansion?all.find(p=>p.set===ui.expansion):null),buy=cmLink(c,targetPrint);
  const priceBlock=c.verify&&b?`<div class="price"><b>${eur(b.low)}</b><small>unconfirmed, not in totals</small></div>`
   :b?`<div class="price"><b>${eur(b.low)}</b>${delta}<small>about ${eur(b.low+shipFor(b.low))} delivered</small></div>`
   :`<div class="price"><small>No Cardmarket price. Prize or very rare card, watch auctions.</small></div>`;
  return `<article class="card${own?' own':''}" data-id="${c.id}">
    ${picHtml(c,`alt="${esc(c.name)}" width="96" height="134"`)}
    <div>
      <h2>${esc(c.name)}${c.family==='Cameo'?'<span class="tag">Cameo</span>':''}${c.verify?'<span class="tag warn">Check listing</span>':''}</h2>
      <div class="meta">${b?`${esc(b.set)} ${esc(b.num)} · ${esc(b.region)}`:`${esc(all[0].set)} ${esc(all[0].num)}`}${state.lang&&b&&!bestIn(c,state.lang)?`<span class="tag warn">No ${esc(state.lang)} price</span>`:''}</div>
      ${priceBlock}
      <div class="foot">
        <label class="own-toggle"><input type="checkbox" data-act="own" ${sharing?.editable?'':'disabled'} ${own?'checked':''}> Owned</label>
        ${buy?`<a href="${buy}" target="_blank" rel="noopener">${targetPrint&&targetPrint.url?'Open on Cardmarket':targetPrint&&targetPrint.setUrl?'Cardmarket set page':'Cardmarket list'}</a>`:`<a href="${ebLink(c,b||all[0])}" target="_blank" rel="noopener">Search eBay.de</a>`}
      </div>
    </div>
    <details class="more" data-more="${c.id}" ${ui.open.has(c.id)?'open':''}><summary>Details${p.vendor?' · '+esc(p.vendor):''}</summary><div>
      ${c.note?`<p class="note" style="margin:0">${esc(c.note)}</p>`:''}
      <div><h4>Lowest price by language${b?` · trend ${eur(b.trend)}`:''}</h4><div class="langs" style="margin:0">${langRow(c)}</div></div>
      ${offerData?`<div><h4>CardTrader by condition</h4>${condRow(c)}</div>`:''}
      <div class="row" style="margin:0">
        <input type="text" list="vendors" data-act="vendor" placeholder="Seller" aria-label="Seller for ${esc(c.name)}" value="${esc(p.vendor||'')}">
        <input type="number" min="0" step="0.01" data-act="price" placeholder="${pr!=null?pr.toFixed(2):'€'}" aria-label="Price from that seller" value="${p.price??''}">
      </div>
      <div><h4>${all.length} print${all.length>1?'s':''} with this art</h4><ul style="list-style:none;margin:0;padding:0">
        ${all.map(x=>`<li class="${b&&x.pid===b.pid?'best':''}">${esc(x.region)} · ${x.url?`<a href="${x.url}" target="_blank" rel="noopener">${esc(x.set)} ${esc(x.num)}</a>`:`${esc(x.set)} ${esc(x.num)}`} <span class="num">${x.low!=null?eur(x.low):'no price'}</span></li>`).join('')}
      </ul></div>
      ${langLinks(b)}
      <div class="links">${buy?`<a href="${ebLink(c,b||all[0])}" target="_blank" rel="noopener">Search eBay.de</a>`:''}${c.added&&b&&b.url&&speciesLink(c)?`<a href="${speciesLink(c)}" target="_blank" rel="noopener">All versions</a>`:''}${c.added&&sharing?.editable?`<button class="linkish" data-remove="${esc(c.id)}">Remove card</button>`:''}</div>
    </div></details></article>`;
}

function renderCards(){
  const x=state.exclude||{},on=[state.lang,ui.hide,x.cameo,x.noPrice].filter(Boolean).length;
  $('filter-label').textContent=on?`Filters (${on})`:'Filters';$('filter-label').parentElement.dataset.on=on>0;
  const q=PokemonNames.norm(ui.q);
  let list=inSet().filter(c=>(ui.fam==='All'||c.family===ui.fam)&&(!ui.hide||!state.owned[c.id])&&(!ui.expansion||c.prints.some(p=>p.set===ui.expansion))&&(!q||nameIndex.text(c).includes(q)));
  const val=c=>bestForView(c)?.low??null;
  if(ui.sort==='cond'){
    // Near Mint offers first, cheapest within each condition; cards with no offers last.
    const rank=c=>{const o=byCondition(c,true)[0];return o?[COND.indexOf(o.cond),o.price]:[9,0]};
    list=[...list].sort((a,b)=>{const x=rank(a),y=rank(b);return x[0]-y[0]||x[1]-y[1]});
  }else if(ui.sort!=='name')list=[...list].sort((a,b)=>{const x=val(a),y=val(b);if(x==null)return 1;if(y==null)return -1;return ui.sort==='asc'?x-y:y-x});
  $('grid').innerHTML=(list.map(cardHtml).join('')||'<p class="note">No cards match. Clear the search or show owned cards.</p>')+
    `<datalist id="vendors">${Object.keys(allVendors()).map(v=>`<option value="${esc(v)}">`).join('')}</datalist>`;
}
function allVendors(){const o={};for(const k in state.pick){const v=(state.pick[k].vendor||'').trim();if(v)o[v]=1}return o}

// Auto-grouper. Picks one offer per open card so that card prices plus each seller's single
// shipping charge are as low as it can find: start with every card at its best solo price, then
// keep trying to pull cards over to a seller while the total falls.
const EU=new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
const COND=['Near Mint','Slightly Played','Moderately Played','Played','Poor'];
const shipAuto=(v,sub)=>{const s=offerData.shipping?.[v];if(!s)return shipFor(sub);return s.freeFrom!=null&&sub>=s.freeFrom?0:s.cost};
function planOrders(items,shipOf){
  const total=a=>{const sub={};let s=0;for(const it of items){const o=a[it.id];s+=o.price;sub[o.seller]=(sub[o.seller]||0)+o.price}
    for(const v in sub)s+=shipOf(v,sub[v]);return s};
  const a={};
  for(const it of items)a[it.id]=it.offers.reduce((x,y)=>y.price+shipOf(y.seller,y.price)<x.price+shipOf(x.seller,x.price)?y:x);
  const sellers=[...new Set(items.flatMap(it=>it.offers.map(o=>o.seller)))];
  const cheapestAt=(it,v)=>{let m=null;for(const o of it.offers)if(o.seller===v&&(!m||o.price<m.price))m=o;return m};
  let cur=total(a);
  for(let pass=0,moved=true;moved&&pass<20;pass++){
    moved=false;
    for(const v of sellers){
      // Pull everything this seller stocks, then send back whatever was cheaper where it came from.
      const old={...a};
      for(const it of items){const o=cheapestAt(it,v);if(o)a[it.id]=o}
      for(const it of items){const was=a[it.id];if(was===old[it.id])continue;const t0=total(a);a[it.id]=old[it.id];if(total(a)>t0)a[it.id]=was}
      const t=total(a);
      if(t<cur-1e-9){cur=t;moved=true}else Object.assign(a,old);
    }
  }
  return a;
}
let offerData=null;
function offersFor(c,filtered=false){const f=state.auto||{};
  return (offerData?.cards[c.id]||[]).filter(o=>(!filtered||!ui.expansion||String(o.label||'').startsWith(ui.expansion+' '))&&(!f.lang||o.lang===f.lang)&&(!(f.eu??true)||EU.has(o.country)))}
// Cheapest offer in each condition, best condition first.
function byCondition(c,filtered=false){return COND.map(name=>offersFor(c,filtered).filter(o=>o.cond===name).sort((a,b)=>a.price-b.price)[0]).filter(Boolean)}
const COND_SHORT={'Near Mint':'NM','Slightly Played':'SP','Moderately Played':'MP','Played':'PL','Poor':'PO'};
function condRow(c){
  if(!offerData)return '';
  const list=byCondition(c,true);
  return `<div class="links">${list.length?list.map(o=>`<a href="${esc(o.link)}" target="_blank" rel="noopener" title="${esc(o.cond)} from ${esc(o.seller)}">${COND_SHORT[o.cond]} ${eur(o.price)}</a>`).join(''):'no offers match'}</div>`;
}
function autoInputs(){
  const f=state.auto||{},minC=COND.indexOf(f.cond||'Moderately Played');
  const items=[],missing=[];
  for(const c of totals().open){
    const list=offersFor(c).filter(o=>COND.indexOf(o.cond)<=minC);
    if(list.length)items.push({id:c.id,offers:list});else missing.push(c);
  }
  return{items,missing};
}
function renderAuto(){
  if(!offerData)return `<section class="panel"><h3>Auto-group</h3><p class="note">Seller stock has not loaded here. The Orders plan runs on the live site.</p></section>`;
  const f=state.auto||{},{items,missing}=autoInputs();
  const shipOf=shipAuto;
  const a=planOrders(items,shipOf);
  const by={};for(const it of items){const o=a[it.id];(by[o.seller]??=[]).push({card:cards.find(c=>c.id===it.id),o})}
  const orders=Object.entries(by).map(([v,l])=>{const sub=l.reduce((s,x)=>s+x.o.price,0);return{v,l,sub,sh:shipOf(v,sub)}}).sort((x,y)=>y.l.length-x.l.length);
  const sum=orders.reduce((s,o)=>s+o.sub+o.sh,0),ships=orders.reduce((s,o)=>s+o.sh,0);
  const sel=(id,opts,val)=>`<select id="${id}" aria-label="${id}">${opts.map(([v,l])=>`<option value="${v}"${v===val?' selected':''}>${l}</option>`).join('')}</select>`;
  return `<section class="panel" id="auto"><h3>Auto-group</h3>
   <p class="note"><b>${eur(sum)}</b> for ${items.length} cards from ${orders.length} seller${orders.length===1?"":"s"}, ${eur(ships)} of it shipping. Stock from ${new Date(offerData.generated).toLocaleDateString('de-DE')}.</p>
   <div class="tools">
    ${sel('a-lang',[['','Any language'],...[...new Set(Object.values(offerData.cards).flat().map(o=>o.lang).filter(Boolean))].sort().map(l=>[l,l.toUpperCase()])],f.lang||'')}
    ${sel('a-cond',COND.map(x=>[x,x+' or better']),f.cond||'Moderately Played')}
    <label class="own-toggle"><input id="a-eu" type="checkbox" ${(f.eu??true)?'checked':''}> EU sellers only (no customs)</label>
    <button class="primary" id="a-apply">Use this plan</button>
   </div>
   ${orders.map(o=>`<details><summary><b>${esc(o.v)}</b> · ${o.l.length} card${o.l.length>1?'s':''} · <span class="num">${eur(o.sub+o.sh)}</span> with <span class="num">${eur(o.sh)}</span> shipping</summary><ul>
     ${o.l.map(x=>`<li>${x.o.link?`<a href="${esc(x.o.link)}" target="_blank" rel="noopener">${esc(x.card.name)}</a>`:esc(x.card.name)} · ${esc(x.o.label||best(x.card)?.set||'')} · ${esc(x.o.lang)} · ${esc(x.o.cond)} <span class="num">${eur(x.o.price)}</span></li>`).join('')}</ul></details>`).join('')}
   ${missing.length?`<p class="note" style="margin-top:8px">${missing.length} cards have no matching offer.</p>`:''}
  </section>`;
}

function renderOrders(){
  const t=totals();
  const rows=t.orders.map(o=>`<section class="panel"><h3>${esc(o.v)}</h3><div class="scroll"><table>
    <thead><tr><th>Card</th><th>Print</th><th class="r">Price</th></tr></thead><tbody>
    ${o.list.map(c=>{const b=best(c);return `<tr><td>${esc(c.name)}</td><td>${b?esc(b.set+' '+b.num):'–'}</td><td class="r">${eur(priceOf(c))}</td></tr>`}).join('')}
    </tbody><tfoot><tr><td colspan="2">Cards</td><td class="r">${eur(o.sub)}</td></tr>
    <tr><td colspan="2"><label>Shipping <input type="number" min="0" step="0.01" data-vendor="${esc(o.v)}" value="${state.vendors[o.v]?.ship??''}" placeholder="${o.sh.toFixed(2)}" style="width:80px" aria-label="Shipping from ${esc(o.v)}"></label></td><td class="r">${eur(o.sh)}</td></tr>
    <tr><td colspan="2">Order total ${o.saved>0?`<span class="saving">saves ${eur(o.saved)} shipping</span>`:''}</td><td class="r">${eur(o.sub+o.sh)}</td></tr></tfoot></table></div></section>`).join('');
  const wants=t.open.map(c=>{const b=best(c);return `${c.name} | ${b?b.set+' '+b.num+' ('+b.region+')':c.prints[0].set+' '+c.prints[0].num} | ${b?eur(b.low):'no price'}`}).join('\n');
  $('view-orders').innerHTML=`${renderAuto()}
   ${rows}
   <section class="panel"><details style="margin:0"><summary><b>Group by hand</b></summary>
     <p class="note">Type a seller's name under Details on any card. Cards with the same seller become one order, with one shipping charge. ${t.looseN} cards are not assigned yet: ${eur(t.loose)} plus about ${eur(t.looseShip)} shipping if each ships alone.</p>
     <p class="note">Cardmarket's Shopping Wizard can also find cheap combinations from a Wants list.</p></details></section>
   <section class="panel"><details style="margin:0"><summary><b>Shopping list</b> · ${t.open.length} open cards</summary>
     <textarea id="wants" readonly aria-label="Shopping list" style="margin-top:8px">${esc(wants)}</textarea>
     <p><button class="primary" id="copy">Copy list</button><span id="copied"></span></p></details></section>`;
}

function renderShip(){
  const s=state.ship;
  $('view-ship').innerHTML=`<section class="panel"><h3>Shipping estimates</h3>
   <div class="settings">
    <label>Letter, no tracking (€)<input id="s-letter" type="number" step="0.05" min="0" value="${s.letter}"></label>
    <label>Tracked shipping (€)<input id="s-tracked" type="number" step="0.05" min="0" value="${s.tracked}"></label>
    <label>Use tracking from an order value of (€)<input id="s-threshold" type="number" step="1" min="0" value="${s.threshold}"></label>
   </div>
   <p class="note">These are my starting estimates, and sellers set their own rates. Cardmarket has quoted Einwurf Einschreiben from €3.35 within Germany. Every card total on this page updates when you change them.</p></section>
   <section class="panel"><h3>Buying from abroad</h3>
   <p class="note"><b>Inside the EU:</b> no customs. Since January 2026 Cardmarket has removed tracked international letters, so tracked orders from other countries usually go as small parcels and cost more. Enter the real rate on the order.</p>
   <p class="note" style="margin-top:8px"><b>Outside the EU (Japan, UK, US):</b> expect 19% import VAT and customs handling on top. An EU flat duty of €3 per item type on low-value parcels began on 1 July 2026, and sources differ on how it reaches private buyers. Add these costs to the order's shipping field.</p></section>`;
}

// Adding cards. TCGdex is the only open card database a browser can read directly. Prices come from
// its Cardmarket figures and are refreshed once a day when the page opens.
const TCG='https://api.tcgdex.net/v2/';
const REGION={en:'International',ja:'Japanese','zh-tw':'Chinese','zh-cn':'Chinese',ko:'Korean',id:'Indonesian',th:'Thai'};
const getJson=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.json()};
async function pool(list,n,fn){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<list.length){const k=i++;await fn(list[k],k)}}))}
// English ids that the pokemontcg.io redirect can turn into the card's own Cardmarket page.
function directLink(id,lang){
  const m=lang==='en'&&id.match(/^(base|gym|neo|ecard|ex|dp|pl|hgss|bw|xy|sm|swsh|sv)0*(\d+)(\.5)?-0*(\d+)$/);
  return m?`https://prices.pokemontcg.io/cardmarket/${m[1]}${m[2]}${m[3]?'pt5':''}-${m[4]}`:null;
}
// Limitless TCG keeps Japanese card scans under a predictable address, for prints TCGdex has no picture of.
// Promo sets drop the hyphen there (SV-P is SVP), so both spellings are tried.
function limitlessPics(tid){const m=String(tid||'').match(/^(.+)-0*(\d+)$/);if(!m)return [];
  return [...new Set([m[1],m[1].replace(/-/g,'')])].map(s=>`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${s}/${s}_${m[2]}_R_JP_SM.png`)}
// pokemontcg.io keeps English scans under its own set codes, which mostly follow TCGdex's ids.
function ptcgGuess(tid){const m=String(tid||'').match(/^(.+)-0*([A-Za-z]*\d+)$/);if(!m)return null;
  const set=m[1].replace(/^\d{2}(\d{2})(sm|xy|swsh|sv|bw)$/,'mcd$1').replace(/\.5/,'pt5').replace(/^sv0(\d)/,'sv$1');
  return `https://images.pokemontcg.io/${set}/${m[2]}.png`}
function picsOf(c){
  const list=[];
  if(c.imgUrl)list.push(c.imgUrl+'/low.webp');
  if(c.img&&!c.added)list.push('thumbs/'+c.id+'.webp');
  for(const p of c.prints||[]){if(p.pic)list.push(p.pic);if(p.tlang==='ja')list.push(...limitlessPics(p.tid));if(p.tlang==='en'&&!c.imgUrl)list.push(ptcgGuess(p.tid))}
  return [...new Set(list.filter(Boolean))];
}
function picHtml(c,attrs){
  const [first,...rest]=picsOf(c);
  return first?`<img src="${esc(first)}" data-pics="${esc(JSON.stringify(rest))}" ${attrs} loading="lazy">`:'<div class="noimg">No image yet</div>';
}
// A picture that fails tries the next source. One listener for all of them (an onerror="" in the
// HTML would be an inline script, which the site's security rules forbid).
document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.dataset.pics!==undefined)nextPic(img)},true);
function nextPic(img){
  const rest=JSON.parse(img.dataset.pics||'[]');
  if(rest.length){img.dataset.pics=JSON.stringify(rest.slice(1));img.src=rest[0];return}
  const box=document.createElement('div');box.className='noimg';box.textContent='No image yet';img.replaceWith(box);
}
// English prints TCGdex has no picture of: look the card up on pokemontcg.io by set name and number.
async function ptcgPic(d){
  const num=String(d.localId||'').replace(/^0+(?=\d)/,''),set=String(d.set?.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!num||!set)return null;
  for(let tries=0;tries<3;tries++){
    try{
      const r=await fetch('https://api.pokemontcg.io/v2/cards?q='+encodeURIComponent('number:'+num)+'&select=set,images&pageSize=250');
      if(!r.ok){await new Promise(ok=>setTimeout(ok,1200));continue}
      const hit=(await r.json()).data.find(x=>x.set.name.toLowerCase().replace(/[^a-z0-9]/g,'')===set);
      return hit?.images?.small||null;
    }catch{await new Promise(ok=>setTimeout(ok,1200))}
  }
  return null;
}
function toPrint(d,lang){
  const pm=d.pricing?.cardmarket||{};
  return{region:REGION[lang],set:d.set?.name||'',num:d.localId,pid:pm.idProduct||null,low:pm.low??pm['low-holo']??null,trend:pm.trend??pm['trend-holo']??null,
    url:directLink(d.id,lang),tid:d.id,tlang:lang};
}
async function artOf(img){
  const pic=new Image();pic.crossOrigin='anonymous';
  await new Promise((ok,no)=>{pic.onload=ok;pic.onerror=no;pic.src=img+'/low.webp'});
  const W=72,H=44,cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const g=cv.getContext('2d',{willReadFrequently:true}),w=pic.naturalWidth,h=pic.naturalHeight;
  g.drawImage(pic,w*.1,h*.1,w*.8,h*.38,0,0,W,H);
  const px=g.getImageData(0,0,W,H).data,out=new Float32Array(W*H);
  for(let i=0;i<out.length;i++)out[i]=px[i*4]*.3+px[i*4+1]*.59+px[i*4+2]*.11;
  return out;
}
function artScore(A,B){
  const W=72,H=44,pad=4,corr=(dx,dy)=>{let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
    for(let y=pad;y<H-pad;y++)for(let x=pad;x<W-pad;x++){const p=A[y*W+x],q=B[(y+dy)*W+x+dx];sa+=p;sb+=q;saa+=p*p;sbb+=q*q;sab+=p*q;n++}
    const d=Math.sqrt((saa-sa*sa/n)*(sbb-sb*sb/n));return d?(sab-sa*sb/n)/d:0};
  let best=corr(0,0);if(best<.4)return best;
  for(let dy=-pad;dy<=pad;dy+=2)for(let dx=-pad;dx<=pad;dx+=2)best=Math.max(best,corr(dx,dy));
  return best;
}
async function searchCards(q,allLangs,status){
  const translated=nameIndex.query(q);
  const responses=await Promise.allSettled([getJson(TCG+'en/cards?name='+encodeURIComponent(translated.en)),getJson(TCG+'de/cards?name='+encodeURIComponent(translated.de))]);
  if(responses.every(r=>r.status==='rejected'))throw new Error('The card search is unavailable');
  const searches=responses.map(r=>r.status==='fulfilled'?r.value:[]);
  const hits=[...new Map(searches.flat().map(c=>[c.id,c])).values()].filter(c=>!/^(A\d|P-A|B\d)/.test(c.id));
  const found=[],add=async(list,lang)=>{await pool(list.slice(0,300),8,async c=>{const d=await getJson(TCG+lang+'/cards/'+encodeURIComponent(c.id)).catch(()=>null);if(d)found.push({d,lang});status(`Reading card details: ${found.length}`)})};
  await add(hits,'en');
  // A tag team also names its partner, so only the Pokémon named most often counts.
  const count={};for(const x of found)if((x.d.dexId||[]).length===1)count[x.d.dexId[0]]=(count[x.d.dexId[0]]||0)+1;
  const main=Number(Object.entries(count).sort((a,b)=>b[1]-a[1])[0]?.[0]);
  if(allLangs&&main)for(const lang of Object.keys(REGION).filter(l=>l!=='en')){
    const list=await getJson(TCG+lang+'/cards?dexId=eq:'+main).catch(()=>[]);
    if(list.length)await add(list,lang);
  }
  status('Finding pictures…');
  await pool(found.filter(x=>x.lang==='en'&&!x.d.image),2,async x=>{x.pic=await ptcgPic(x.d)});
  status('Comparing artwork…');
  await pool(found.filter(x=>x.d.image),8,async x=>{x.art=await artOf(x.d.image).catch(()=>null)});
  await new Promise(r=>setTimeout(r));
  const par=found.map((_,i)=>i),root=i=>par[i]===i?i:par[i]=root(par[i]);
  const dexOf=x=>x.d.dexId||[],same=(a,b)=>dexOf(a).some(n=>dexOf(b).includes(n))||a.d.name.split(' ')[0]===b.d.name.split(' ')[0];
  for(let i=0;i<found.length;i++)for(let j=i+1;j<found.length;j++){
    const a=found[i],b=found[j];
    // TCGdex sometimes gives different cards one Cardmarket id, so the images decide whenever both exist.
    const pa=a.d.pricing?.cardmarket?.idProduct,pb=b.d.pricing?.cardmarket?.idProduct;
    if(a.art&&b.art?same(a,b)&&artScore(a.art,b.art)>=.8:pa&&pa===pb)par[root(i)]=root(j);
  }
  const groups={};found.forEach((x,i)=>(groups[root(i)]??=[]).push(x));
  const order=Object.keys(REGION);
  const known=new Set(cards.flatMap(c=>c.prints.map(p=>p.pid)).filter(Boolean));
  const species=q.trim().split(/\s+/)[0];
  // An id shared by separate artworks means its price may belong to the other card.
  const idOwners={};for(const [k,g] of Object.entries(groups))for(const x of g){const id=x.d.pricing?.cardmarket?.idProduct;if(id)(idOwners[id]??=new Set()).add(k)}
  return Object.values(groups).map(g=>{
    g.sort((a,b)=>order.indexOf(a.lang)-order.indexOf(b.lang));
    const prints=g.map(x=>x.pic?{...toPrint(x.d,x.lang),pic:x.pic}:toPrint(x.d,x.lang));
    return{id:'x'+g[0].lang+'-'+g[0].d.id,name:g[0].d.name,imgUrl:g.find(x=>x.d.image)?.d.image||null,prints,
      unchecked:!g.some(x=>x.art),verify:prints.some(p=>p.pid&&idOwners[p.pid]?.size>1)||undefined,
      species:dexOf(g[0]).length?species[0].toUpperCase()+species.slice(1).toLowerCase():null,
      have:prints.some(p=>p.pid&&known.has(p.pid))||cards.some(c=>c.id==='x'+g[0].lang+'-'+g[0].d.id)};
  }).sort((a,b)=>a.have-b.have||a.name.localeCompare(b.name));
}
function renderFound(){
  const f=ui.found;if(!f){$('add-results').innerHTML='';return}
  const n=f.filter(g=>ui.picked.has(g.id)).length;
  $('add-results').innerHTML=`<div class="tools">
     <label class="own-toggle">Add to list <input id="add-list" type="text" list="add-names" value="${esc(ui.listName||'')}" aria-label="List name"></label>
     <datalist id="add-names">${families().map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
     <button class="primary" id="add-go" ${n?'':'disabled'}>Add ${n} card${n===1?'':'s'}</button>
     <button class="linkish" id="add-select" data-on="1">Select all</button> <button class="linkish" id="add-select-none">Select none</button>
   </div>
   <div class="found">${f.map(g=>{const low=Math.min(...g.prints.map(p=>p.low??Infinity));return `<label>
     <input type="checkbox" data-found="${esc(g.id)}" ${ui.picked.has(g.id)?'checked':''}>
     ${picHtml(g,'alt=""')}
     <span><b>${esc(g.name)}</b><br>${esc(g.prints[0].set)} ${esc(g.prints[0].num)}${g.prints.length>1?` +${g.prints.length-1} more`:''}<br>
     ${[...new Set(g.prints.map(p=>LANGS.find(l=>l[0]===p.region)?.[1]))].join(', ')} · <span class="num">${isFinite(low)?eur(low):'no price'}</span>
     ${g.have?'<br><span class="tag" style="margin-left:0">Already in a list</span>':''}${g.unchecked?'<br><span class="tag warn" style="margin-left:0">May repeat a card</span>':''}${g.verify?'<br><span class="tag warn" style="margin-left:0">Price unsure</span>':''}</span></label>`}).join('')}</div>`;
}
// The daily seller job cannot read this browser, so a list joins it through one file in the site's repo.
function watchLink(fam){
  const list=(state.added||[]).filter(c=>c.family===fam).map(c=>[c.id,c.prints.map(p=>p.pid).filter(Boolean)]).filter(x=>x[1].length);
  const name=fam.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now().toString(36);
  return 'https://github.com/RyoTsushigawa/anime-schedule/new/main?filename='+encodeURIComponent('masterset/watch/'+name+'.json')+'&value='+encodeURIComponent(JSON.stringify(list));
}
function renderLists(){
  const x=state.exclude||{};
  $('add-lists').innerHTML=`<div class="scroll"><table><thead><tr><th>List</th><th class="r">Cards</th><th>Count it</th><th></th></tr></thead><tbody>
    ${families().filter(f=>f!=='Cameo').map(f=>{const list=cards.filter(c=>c.family===f),added=list.filter(c=>c.added);
      const waiting=added.filter(c=>!offerData?.cards[c.id]).length;
      return `<tr><td>${esc(f)}</td><td class="r">${list.length}</td>
      <td><label class="own-toggle"><input type="checkbox" data-count="${esc(f)}" ${x.fam?.[f]?'':'checked'}> Include</label></td>
      <td>${sharing?.editable&&added.length?`${waiting?`<a href="${esc(watchLink(f))}" target="_blank" rel="noopener">Add to seller check</a> · `:''}<button class="linkish" data-drop="${esc(f)}">${ui.dropping===f?'Click again to remove':'Remove added cards'}</button>`:''}</td></tr>`}).join('')}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">Lists that are off leave the cards, totals and orders. Added cards get sellers after you commit "Add to seller check" on GitHub and the next daily run finishes.</p>`;
}
function dropCards(ids){
  if(!sharing?.editable)return;
  state.added=(state.added||[]).filter(c=>!ids.includes(c.id));
  for(const id of ids){delete state.owned[id];delete state.pick[id]}
  save();renderAll();
}
async function refreshAdded(){
  const today=new Date().toISOString().slice(0,10);
  if(!state.added?.length||state.addedPriced===today)return;
  let changed=0;
  await pool(state.added.flatMap(c=>c.prints.filter(p=>p.tid).map(p=>[c,p])),6,async([c,p])=>{
    const d=await getJson(TCG+p.tlang+'/cards/'+encodeURIComponent(p.tid)).catch(()=>null);if(!d)return;
    const n=toPrint(d,p.tlang);if(n.low!==p.low)p.prevLow=p.low;
    p.low=n.low;p.trend=n.trend;p.pid=n.pid;changed++;
    // Pictures: take one TCGdex has added since, and look up English ones elsewhere once.
    if(d.image&&!c.imgUrl)c.imgUrl=d.image;
    if(!d.image&&p.tlang==='en'&&!p.pic&&!p.picTried){p.picTried=true;p.pic=await ptcgPic(d)||undefined}});
  if(changed){state.addedPriced=today;save();renderAll()}
}

function renderAll(){cards=[...baseCards,...(state.added||[])];$('lang').value=state.lang||'';
  const editable=!!sharing?.editable;
  $('ledger').hidden=!!sharing?.ready&&!sharing.published&&!sharing.key;
  $('hide').disabled=!!sharing?.ready&&!sharing.published;
  $('backup-original').hidden=!localStorage.getItem('masterset-before-sharing');
  $('add-form').hidden=!editable;$('add-owner-note').hidden=editable;$('backup-restore').disabled=!editable;
  $('tab-add').textContent=editable?'Add / Lists':'Lists';
  $('collection-owner').hidden=!!sharing?.key;
  const sets=[...new Set(cards.flatMap(c=>c.prints.map(p=>p.set)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  if(ui.expansion&&!sets.includes(ui.expansion))ui.expansion='';
  $('expansion').innerHTML='<option value="">All expansions</option>'+sets.map(s=>'<option'+(s===ui.expansion?' selected':'')+'>'+esc(s)+'</option>').join('');
  $('x-cameo').checked=!!state.exclude?.cameo;$('x-noprice').checked=!!state.exclude?.noPrice;
  $('x-cameo-label').textContent=`Leave out cameos (${cards.filter(isCameo).length})`;
  $('x-noprice-label').textContent=`Leave out cards with no price (${cards.filter(noPrice).length})`;
  renderLedger();renderFam();renderCards();renderOrders();renderShip();renderLists();renderFound();
  document.querySelectorAll('[data-drop],[data-remove]').forEach(b=>{b.hidden=!sharing?.editable;});
  $('fresh').textContent=guideDate?'Prices from Cardmarket, '+new Date(guideDate).toLocaleDateString('de-DE'):'';}

document.addEventListener('toggle',e=>{const id=e.target.dataset?.more;if(id){if(e.target.open)ui.open.add(id);else ui.open.delete(id)}},true);
document.addEventListener('click',e=>{
  const box=document.querySelector('.filters');if(box.open&&!box.contains(e.target))box.open=false;
  const f=e.target.closest('[data-fam]');if(f){ui.fam=f.dataset.fam;renderFam();renderCards();return}
  const t=e.target.closest('.tab');if(t){for(const n of ['cards','orders','ship','add','backup']){$('tab-'+n).setAttribute('aria-selected',t.id==='tab-'+n);$('view-'+n).hidden=t.id!=='tab-'+n}return}
  const rm=e.target.closest('[data-remove]');if(rm){dropCards([rm.dataset.remove]);return}
  const dr=e.target.closest('[data-drop]');if(dr){const fam=dr.dataset.drop;
    if(ui.dropping===fam){ui.dropping=null;dropCards((state.added||[]).filter(c=>c.family===fam).map(c=>c.id))}else{ui.dropping=fam;renderLists()}return}
  if(e.target.id==='add-select'){ui.picked=new Set(ui.found.filter(g=>!g.have).map(g=>g.id));renderFound();return}
  if(e.target.id==='add-select-none'){ui.picked=new Set();renderFound();return}
  if(e.target.id==='add-go'){
    if(!sharing?.editable)return;
    const fam=($('add-list').value||ui.listName||'Added').trim();
    const add=ui.found.filter(g=>ui.picked.has(g.id)).map(({have,unchecked,...g})=>({...g,family:fam,added:true}));
    state.added=[...(state.added||[]),...add];
    state.addedPriced=new Date().toISOString().slice(0,10);
    ui.found=null;$('add-status').textContent=`Added ${add.length} card${add.length===1?'':'s'} to ${fam}.`;
    save();renderAll();return}
  if(e.target.id==='a-apply'){
    const {items}=autoInputs(),a=planOrders(items,shipAuto);
    for(const it of items){state.pick[it.id]={vendor:a[it.id].seller,price:a[it.id].price};const sh=offerData.shipping?.[a[it.id].seller]?.cost;if(sh!=null)state.vendors[a[it.id].seller]={ship:sh}}
    save();renderLedger();renderCards();renderOrders();return}
  if(e.target.id==='backup-original'){const text=localStorage.getItem('masterset-before-sharing');if(text)navigator.clipboard.writeText(text).then(()=>{$('backup-msg').textContent='Original backup copied';}).catch(()=>{$('backup-text').value=text;});return;}
  if(e.target.id==='backup-copy'){const text=JSON.stringify(state);navigator.clipboard.writeText(text).then(()=>{$('backup-msg').textContent='Backup copied'}).catch(()=>{$('backup-text').value=text;$('backup-text').select();$('backup-msg').textContent='Press Ctrl+C to copy the selected text'})}
  if(e.target.id==='backup-restore'){
    if(!sharing?.editable)return;
    try{
      const d=JSON.parse($('backup-text').value);
      if(!d||typeof d.owned!=='object'||typeof d.pick!=='object')throw 0;
      state={...state,...d};save();renderAll();$('backup-text').value='';
      $('backup-msg').textContent=`Restored ${Object.keys(state.owned).length} owned cards`;
    }catch{$('backup-msg').textContent='That is not a tracker backup. Copy it again and paste the whole text.'}
  }
  if(e.target.id==='copy'){const a=$('wants');navigator.clipboard.writeText(a.value).then(()=>{$('copied').textContent='Copied'}).catch(()=>{a.select();$('copied').textContent='Press Ctrl+C to copy'})}
});
document.addEventListener('change',e=>{
  const el=e.target,cardEl=el.closest?.('.card');
  if(cardEl&&el.dataset.act){const id=cardEl.dataset.id;
    if(el.dataset.act==='own'){if(!sharing?.editable){el.checked=!!state.owned[id];return;}if(el.checked)state.owned[id]=true;else delete state.owned[id]}
    else{const p=state.pick[id]||{};if(el.dataset.act==='vendor')p.vendor=el.value.trim();else p.price=el.value===''?null:+el.value;state.pick[id]=p}
    save();renderLedger();renderCards();renderOrders();return}
  if(el.dataset.vendor!==undefined){const v=el.dataset.vendor;state.vendors[v]={ship:el.value===''?null:+el.value};save();renderLedger();renderOrders();return}
  if(el.id&&el.id.startsWith('s-')){state.ship[el.id.slice(2)]=+el.value||0;save();renderLedger();renderCards();renderOrders();return}
  if(el.dataset.found!==undefined){if(el.checked)ui.picked.add(el.dataset.found);else ui.picked.delete(el.dataset.found);renderFound();return}
  if(el.id==='add-list'){ui.listName=el.value;return}
  if(el.dataset.count!==undefined){const x=state.exclude||(state.exclude={});(x.fam??={})[el.dataset.count]=!el.checked;save();renderAll();return}
  if(el.id==='a-lang'||el.id==='a-cond'||el.id==='a-eu'){const f=state.auto||(state.auto={});
    if(el.id==='a-lang')f.lang=el.value;if(el.id==='a-cond')f.cond=el.value;if(el.id==='a-eu')f.eu=el.checked;
    save();renderCards();renderOrders();return}
  if(el.id==='lang'){state.lang=el.value;save();renderLedger();renderCards();renderOrders();return}
  if(el.id==='expansion'){ui.expansion=el.value;renderCards();return}
  if(el.id==='sort'){ui.sort=el.value;renderCards()}
  if(el.id==='hide'){ui.hide=el.checked;renderCards()}
  if(el.id==='x-cameo'||el.id==='x-noprice'){const x=state.exclude||(state.exclude={});
    if(el.id==='x-cameo'){x.cameo=el.checked;if(el.checked&&ui.fam==='Cameo')ui.fam='All'}else x.noPrice=el.checked;
    save();renderAll()}
});
$('q').addEventListener('input',e=>{ui.q=e.target.value;renderCards()});
$('add-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!sharing?.editable)return;
  const q=$('add-q').value.trim(),status=m=>{$('add-status').textContent=m};
  if(!q)return;
  ui.found=null;renderFound();status('Searching…');
  try{
    const groups=await searchCards(q,$('add-all').checked,status);
    ui.found=groups;ui.picked=new Set(groups.filter(g=>!g.have).map(g=>g.id));
    ui.listName=q[0].toUpperCase()+q.slice(1);
    const prints=groups.reduce((s,g)=>s+g.prints.length,0);
    status(groups.length?`Found ${groups.length} artworks from ${prints} prints. Untick anything you don't want.`:'Nothing found under that name. Try its German or English name.');
    renderFound();
  }catch{status('The card database could not be reached from this page. Try again, or use the site at ryotsushigawa.github.io/anime-schedule/masterset/.')}
});

(async()=>{
  loadLocal();
  try{
    const [c,p,n]=await Promise.all([fetch('cards.json').then(r=>r.json()),fetch('prices.json').then(r=>r.json()),fetch('pokemon-names.json').then(r=>r.json()).catch(()=>[])]);
    nameIndex=PokemonNames.create(n);
    baseCards=c;prices=p.prices;guideDate=p.guideDate;
    // Seller stock is optional: without it the page runs on the price guide alone.
    try{const r=await fetch('offers.json');if(r.ok)offerData=await r.json()}catch{}
  }catch(e){$('grid').innerHTML='<p class="note">The card data did not load. Reload the page to try again.</p>';return}
  sharing=new CollectionSharing.Client({getState:()=>state,setCollection:collection=>{
    state.owned=collection.owned;state.added=collection.added;
    try{localStorage.setItem(LS,JSON.stringify(state));}catch{}
    renderAll();
  },status:text=>{$('collection-status').textContent=text;}});
  renderAll();await sharing.initialize();renderAll();
  if(sharing.editable)refreshAdded();
  setInterval(()=>{if(document.visibilityState==='visible')sharing.refresh();},30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(sharing.key!==sharing.sessionKey)sharing.initialize().then(renderAll);else sharing.refresh();}});
  window.addEventListener('storage',e=>{if(e.key==='movesKey')sharing.initialize().then(renderAll);});
  $('collection-retry').onclick=async()=>{const b=$('collection-retry');b.disabled=true;try{if(!sharing.ready)await sharing.initialize();else if(sharing.key)await sharing.flush(true);else await sharing.refresh();}finally{b.disabled=false;}};

})();
