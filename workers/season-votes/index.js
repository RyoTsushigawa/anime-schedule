// Cloudflare Worker for Season Preview voting.
// No browser-supplied member mapping, sheet range or anime row is trusted.
const OPTIONS = ['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist','Okinawa 3','Default'];
const SEASON_TAB = /^(Winter|Frühling|Sommer|Herbst) (20\d{2})$/i;
const DEFAULT_ORIGIN='https://ryotsushigawa.github.io';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const str=v=>typeof v==='string'?v.trim():'';
const fail=(status,error)=>{throw Object.assign(new Error(error),{status});};
function originHeaders(origin,env){
 const allowed=env.SITE_ORIGIN||DEFAULT_ORIGIN;
 if(origin!==allowed)return null;
 return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':'X-Group-Code, Content-Type','Vary':'Origin'};
}
// Shared access code is a group-level permission, NOT verified individual identity.
// Never expose GROUP_ACCESS_CODE or Google service-account credentials to the static site.
async function authorized(request,env){
 const expected=str(env.GROUP_ACCESS_CODE);
 // No code set: voting is open (the owner's choice for a small friend group). Writes stay limited to the
 // season lists' existing name columns and valid choices.
 if(!expected)return true;
 if(expected.length<16)fail(503,'Gruppenzugang wurde noch nicht eingerichtet.');
 const supplied=str(request.headers.get('X-Group-Code'));
 if(supplied.length<16||supplied.length>256)fail(401,'Gruppencode fehlt oder ist ungültig.');
 const bytes=new TextEncoder();
 const [a,b]=await Promise.all([expected,supplied].map(s=>crypto.subtle.digest('SHA-256',bytes.encode(s))));
 const left=new Uint8Array(a),right=new Uint8Array(b);
 let diff=0;
 for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 if(diff!==0)fail(401,'Gruppencode fehlt oder ist ungültig.');
 return true;
}
function base64url(data){
 const bytes=data instanceof Uint8Array?data:new TextEncoder().encode(data);
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pemToBytes(pem){
 const raw=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const binary=atob(raw);
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function googleToken(env){
 // The sheet owner's own Google login (client ID/secret + refresh token with the Sheets permission, made once
 // with tools/youtube-login.mjs --sheets). Google blocks service-account key files by default, so this is the usual way.
 if(env.GOOGLE_REFRESH_TOKEN){
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)fail(503,'Google Sheets-Zugang noch nicht konfiguriert.');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'refresh_token',refresh_token:env.GOOGLE_REFRESH_TOKEN,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET})});
  if(!response.ok)fail(503,'Google-Zugang konnte nicht bestätigt werden.');
  return (await response.json()).access_token;
 }
 // or a service account (key file), if the organisation allows one
 if(!env.GOOGLE_SERVICE_ACCOUNT_EMAIL||!env.GOOGLE_PRIVATE_KEY)fail(503,'Google Sheets-Zugang noch nicht konfiguriert.');
 const now=Math.floor(Date.now()/1000);
 const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const payload=base64url(JSON.stringify({iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',
  iat:now,exp:now+1800}));
 const unsigned=header+'.'+payload;
 const key=await crypto.subtle.importKey('pkcs8',pemToBytes(env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n')),
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned)));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+base64url(sig)})});
 if(!response.ok)fail(503,'Google-Zugang konnte nicht bestätigt werden.');
 const data=await response.json();return data.access_token;
}
async function google(path,token,options={}){
 const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{
  ...options,headers:{Authorization:'Bearer '+token,...options.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)fail(response.status===403?503:502,'Google Sheets konnte die Anfrage nicht ausführen.');
 return data;
}
const columnName=index=>{
 let letters='';for(let n=index;n>0;n=Math.floor((n-1)/26))letters=String.fromCharCode(65+(n-1)%26)+letters;return letters;
};
async function saveVote(body,env){
 const gid=str(body.gid),title=str(body.title),person=str(body.person),choice=str(body.choice);
 if(!/^\d{1,12}$/.test(gid)||!title||title.length>250||!person||person.length>100||
    !OPTIONS.includes(choice)||!['string','undefined'].includes(typeof body.expected))
  fail(400,'Ungültige Abstimmung.');
 if(title.toLowerCase()==='amount')fail(403,'Die Summenzeile ist keine Anime-Abstimmung.');
 if(choice==='Okinawa 3'&&!['quecks','rei','terra'].includes(person.toLowerCase()))
  fail(403,'Okinawa 3 ist nur für Quecks, Rei und Terra erlaubt.');
 if(!env.SHEET_ID)fail(503,'Google Sheet ist noch nicht konfiguriert.');
 const token=await googleToken(env);
 const metadata=await google(encodeURIComponent(env.SHEET_ID)+'?fields=sheets(properties(sheetId,title))',token);
 const tab=metadata.sheets?.find(s=>String(s.properties?.sheetId)===gid)?.properties;
 if(!tab||!SEASON_TAB.test(tab.title))fail(403,'Abstimmungen sind nur in eigenständigen Season-Listen erlaubt.');
 const quoted="'"+tab.title.replace(/'/g,"''")+"'";
 const range=quoted+'!A1:AZ2000';
 const content=await google(encodeURIComponent(env.SHEET_ID)+'/values/'+encodeURIComponent(range),token);
 const rows=content.values||[];
 const headerRow=rows.findIndex(row=>row.some(v=>str(v)==='Anime Titel'));
 if(headerRow<0)fail(409,'Spaltenüberschriften fehlen.');
 const header=rows[headerRow],animeCol=header.findIndex(v=>str(v)==='Anime Titel');
 const timeCol=header.findIndex(v=>str(v)==='Uhrzeit');
 const personCol=header.findIndex((v,i)=>i>timeCol&&str(v)===person);
 if(timeCol<0||personCol<0)fail(409,'Die Person ist nicht als Abstimmungsspalte eingetragen.');
 const matching=[];
 for(let i=headerRow+1;i<rows.length;i++){
  if(str(rows[i]?.[animeCol])===title)matching.push(i);
 }
 if(matching.length!==1)fail(409,'Anime-Titel wurde nicht eindeutig in dieser Season gefunden.');
 const index=matching[0],current=str(rows[index]?.[personCol]).replace(/,$/,'')||'Default';
 if(body.expected!==undefined&&(str(body.expected).replace(/,$/,'')||'Default')!==current)
  fail(409,'Die Stimme wurde inzwischen im Google Sheet geändert. Bitte aktualisieren.');
 const cell=quoted+'!'+columnName(personCol+1)+(index+1);
 const endpoint=encodeURIComponent(env.SHEET_ID)+'/values/'+encodeURIComponent(cell);
 const written=await google(endpoint+'?valueInputOption=RAW',token,{
  method:'PUT',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({range:cell,majorDimension:'ROWS',values:[[choice]]})
 });
 if(written.updatedCells!==1)
  fail(502,'Google Sheets hat die Stimme nicht bestätigt. Bitte aktualisieren.');
 const confirmed=await google(endpoint,token);
 if(str(confirmed.values?.[0]?.[0])!==choice)
  fail(409,'Die gespeicherte Stimme stimmt nicht mit der Tabelle überein. Bitte aktualisieren.');
 return {ok:true,person,choice};
}
// Seasonal Anime Awards (awards.html): one secret ballot per person and season in KV (binding AWARDS),
// "ballot:<season>:<person>" = { person, picks: { category: [12 points, 10 points, 8 points] }, at } (a pick from
// before the points system is one title: it counts as 12 points). Before "Auflösen" only the names of who voted
// are given out; "meta:<season>" = { revealed: true, revealedAt } then shows everything and closes voting.
// "ceddl:<season>" = [{ id, name, anime, by, at }]: the Ceddl of the Year candidates, collected over the season.
const AWARD_CATEGORIES=['best','new','sequel','surprise','finale','action','comedy','romance','drama','fantasy','sliceoflife',
 'protagonist','supporting','villain','couple','animation','soundtrack','design','fight','opening','ending','ceddl'];
const AWARD_PLACES=3;
const AWARD_SEASON=/^(Winter|Frühling|Sommer|Herbst) 20\d{2}$/;
const AWARD_NAME=/^[\p{L}\p{N} ._'-]{1,40}$/u;
function awardSeason(value){
 const season=str(value);
 if(!AWARD_SEASON.test(season))fail(400,'Ungültige Season.');
 return season;
}
function awardsStore(env){
 if(!env.AWARDS)fail(503,'Die Awards-Abstimmung ist noch nicht eingerichtet.');
 return env.AWARDS;
}
async function awardsState(env,season){
 const store=awardsStore(env);
 const meta=JSON.parse(await store.get('meta:'+season)||'{}');
 const ballots=[];
 let cursor;
 do{
  const page=await store.list({prefix:'ballot:'+season+':',cursor});
  for(const key of page.keys){
   const value=await store.get(key.name);
   try{const ballot=JSON.parse(value||'null');if(ballot?.person&&ballot.picks)ballots.push(ballot);}catch{}
  }
  cursor=page.list_complete?undefined:page.cursor;
 }while(cursor);
 ballots.sort((a,b)=>a.person.localeCompare(b.person,'de'));
 return {meta,ballots};
}
async function awardsGet(url,env){
 const season=awardSeason(url.searchParams.get('season'));
 const {meta,ballots}=await awardsState(env,season);
 const revealed=meta.revealed===true;
 return {season,revealed,...(revealed&&{revealedAt:meta.revealedAt}),voters:ballots.map(b=>b.person),
  ...(revealed&&{ballots:ballots.map(b=>({person:b.person,picks:b.picks}))})};
}
const awardTitle=v=>{const t=str(v);if(t.length>200||/[<>]/.test(t))fail(400,'Ungültiger Anime-Titel.');return t;};
async function awardsBallot(body,env){
 const season=awardSeason(body.season),person=str(body.person);
 if(!AWARD_NAME.test(person))fail(400,'Ungültiger Name.');
 const picks={};
 if(!body.picks||typeof body.picks!=='object'||Array.isArray(body.picks))fail(400,'Ungültiger Stimmzettel.');
 for(const [category,value] of Object.entries(body.picks)){
  if(!AWARD_CATEGORIES.includes(category))fail(400,'Unbekannte Kategorie.');
  // 12, 10 and 8 points: up to three different picks in order (an empty place stays empty)
  const list=(Array.isArray(value)?value:[value]).map(awardTitle);
  if(list.length>AWARD_PLACES)fail(400,'Höchstens drei Plätze pro Kategorie.');
  const set=list.filter(Boolean);
  if(new Set(set).size!==set.length)fail(400,'Ein Anime kann pro Kategorie nur einmal Punkte bekommen.');
  if(set.length)picks[category]=list.slice(0,list.findLastIndex(Boolean)+1);
 }
 if(!Object.keys(picks).length)fail(400,'Mindestens eine Kategorie wählen.');
 const store=awardsStore(env);
 const meta=JSON.parse(await store.get('meta:'+season)||'{}');
 if(meta.revealed)fail(409,'Die Awards dieser Season sind schon aufgelöst.');
 await store.put('ballot:'+season+':'+person,JSON.stringify({person,picks,at:new Date().toISOString()}));
 return {ok:true,season,person};
}
// Ceddl of the Year: the group collects candidates over the season; the ballot's Ceddl category offers only these
async function ceddlList(env,season){return JSON.parse(await awardsStore(env).get('ceddl:'+season)||'[]');}
async function ceddlChange(body,env,remove){
 const season=awardSeason(body.season);
 const meta=JSON.parse(await awardsStore(env).get('meta:'+season)||'{}');
 if(meta.revealed)fail(409,'Die Awards dieser Season sind schon aufgelöst.');
 let list=await ceddlList(env,season);
 if(remove){
  const id=str(body.id);
  if(!list.some(c=>c.id===id))fail(404,'Kandidat nicht gefunden.');
  list=list.filter(c=>c.id!==id);
 }else{
  const name=awardTitle(body.name),anime=awardTitle(body.anime),by=str(body.by);
  if(!name||name.length>80)fail(400,'Name der Figur angeben.');
  if(anime.length>120)fail(400,'Anime-Titel zu lang.');
  if(by&&!AWARD_NAME.test(by))fail(400,'Ungültiger Name.');
  const key=(name+'|'+anime).toLowerCase();
  if(list.some(c=>(c.name+'|'+c.anime).toLowerCase()===key))return {ok:true,duplicate:true,candidates:list};
  if(list.length>=60)fail(429,'Schon 60 Kandidaten.');
  list.push({id:crypto.randomUUID().slice(0,8),name,anime,...(by&&{by}),at:new Date().toISOString()});
 }
 await awardsStore(env).put('ceddl:'+season,JSON.stringify(list));
 return {ok:true,candidates:list};
}
async function awardsReveal(body,env){
 const season=awardSeason(body.season);
 const {meta,ballots}=await awardsState(env,season);
 if(meta.revealed)return {ok:true,season,revealed:true};
 if(!ballots.length)fail(409,'Noch hat niemand abgestimmt.');
 await awardsStore(env).put('meta:'+season,JSON.stringify({revealed:true,revealedAt:new Date().toISOString()}));
 return {ok:true,season,revealed:true};
}
// Anime-Börse (boerse.html): play money for the season's real anime, traded the whole season at the day's close
// (boerse-prices.json on the site, written daily by tools/boerse-prices.mjs; rules as in boerse-core.mjs).
// Everyone starts with 1000 Taler; a trade costs a 1-Taler fee; a sale's money arrives the next day (T+1);
// selling more than you hold is a short sale, up to 1000 Taler in shorts; a show whose price fell 7 % or more
// today is halted for the day (circuit breaker). "stock:<season>:<person>" = { person, cash, pending: [{ amount,
// on }], holdings: { title: shares }, trades: [...] }. Holdings stay private until the season is over; the
// ranking by value is open to all.
const STOCK_CASH=1000,STOCK_FEE=1,STOCK_SHORT=1000,STOCK_DAYS=14*86400000;
const SEASON_MONTH={Winter:0,'Frühling':3,Sommer:6,Herbst:9};
function stockWindow(season,now=Date.now()){
 const [name,year]=season.split(' ');
 const start=Date.UTC(Number(year),SEASON_MONTH[name],1)-3600000;
 const end=new Date(start+3600000);end.setUTCMonth(end.getUTCMonth()+3);
 const from=start-STOCK_DAYS,to=end.getTime()-3600000;
 return {from:new Date(from).toISOString(),to:new Date(to).toISOString(),open:now>=from&&now<to,over:now>=to};
}
const berlinDay=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(t));
const dayAfter=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10);};
const cents=n=>Math.round(n*100)/100;
let pricesCache=null;
async function stockPrices(env,season){
 const url=(env.SITE_URL||'https://ryotsushigawa.github.io/anime-schedule/')+'boerse-prices.json';
 if(!pricesCache||pricesCache.url!==url||Date.now()-pricesCache.at>120000){
  const res=await fetch(url+'?'+Date.now());
  if(!res.ok)fail(503,'Die Kurse sind gerade nicht erreichbar.');
  pricesCache={url,at:Date.now(),file:await res.json()};
 }
 return pricesCache.file.seasons?.[season]||{days:[],shows:{}};
}
const latest=s=>new Map(Object.entries(s.shows||{}).map(([t,x])=>[t,x.closes?.[x.closes.length-1]??100]));
function settled(a,today){
 const ready=(a.pending||[]).filter(p=>p.on<=today);
 return {...a,cash:cents((a.cash??STOCK_CASH)+ready.reduce((n,p)=>n+p.amount,0)),pending:(a.pending||[]).filter(p=>p.on>today)};
}
const accountValue=(a,prices)=>cents((a.cash??STOCK_CASH)+(a.pending||[]).reduce((n,p)=>n+p.amount,0)+Object.entries(a.holdings||{}).reduce((n,[t,c])=>n+c*(prices.get(t)??100),0));
async function stockAccounts(env,season){
 const store=awardsStore(env),list=[];let cursor;
 do{const page=await store.list({prefix:'stock:'+season+':',cursor});
  for(const key of page.keys){try{const p=JSON.parse(await store.get(key.name)||'null');if(p?.person)list.push(p);}catch{}}
  cursor=page.list_complete?undefined:page.cursor;}while(cursor);
 return list;
}
async function stocksGet(url,env,now){
 const season=awardSeason(url.searchParams.get('season')),window=stockWindow(season,now),today=berlinDay(now);
 const [accounts,priced]=await Promise.all([stockAccounts(env,season),stockPrices(env,season)]);
 const prices=latest(priced),person=str(url.searchParams.get('person'));
 const ranking=accounts.map(a=>({person:a.person,value:accountValue(a,prices)})).sort((x,y)=>y.value-x.value||x.person.localeCompare(y.person,'de'));
 const mine=person&&AWARD_NAME.test(person)?accounts.find(a=>a.person===person):null;
 return {season,...window,today,cash:STOCK_CASH,fee:STOCK_FEE,shortLimit:STOCK_SHORT,ranking,
  account:mine?settled(mine,today):null,
  ...(window.over&&{portfolios:accounts.map(a=>({person:a.person,holdings:a.holdings||{},trades:a.trades||[]}))})};
}
async function stocksTrade(body,env,now){
 const season=awardSeason(body.season),person=str(body.person),title=awardTitle(body.title),qty=body.qty;
 if(!AWARD_NAME.test(person))fail(400,'Ungültiger Name.');
 if(!stockWindow(season,now).open)fail(409,'Für diese Season wird gerade nicht gehandelt.');
 if(!Number.isInteger(qty)||qty===0||Math.abs(qty)>50)fail(400,'Ungültige Anzahl.');
 const priced=await stockPrices(env,season),show=priced.shows?.[title];
 if(!show?.closes?.length)fail(400,'Diese Serie wird nicht gehandelt.');
 const today=berlinDay(now),price=show.closes[show.closes.length-1];
 if(show.halted===today)fail(409,'Handel ausgesetzt: Kurs heute um 7 % oder mehr gefallen (Circuit Breaker).');
 const store=awardsStore(env),key='stock:'+season+':'+person;
 const a=settled(JSON.parse(await store.get(key)||'null')||{person,cash:STOCK_CASH,pending:[],holdings:{},trades:[]},today);
 const holdings={...(a.holdings||{})},after=(holdings[title]||0)+qty;
 if(qty>0){
  const cost=cents(qty*price+STOCK_FEE);
  if(cost>a.cash+1e-9)fail(400,'Nicht genug verfügbare Taler (Verkäufe werden erst am nächsten Tag gutgeschrieben).');
  a.cash=cents(a.cash-cost);
 }else a.pending=[...a.pending,{amount:cents(-qty*price-STOCK_FEE),on:dayAfter(today)}];
 if(after)holdings[title]=after;else delete holdings[title];
 const prices=latest(priced);
 const shorts=Object.entries(holdings).reduce((n,[t,c])=>n+(c<0?-c*(prices.get(t)??100):0),0);
 if(shorts>STOCK_SHORT+1e-9)fail(400,'Leerverkäufe höchstens bis 1000 Taler.');
 const next={...a,person,holdings,trades:[...(a.trades||[]),{day:today,title,qty,price,fee:STOCK_FEE}].slice(-200)};
 await store.put(key,JSON.stringify(next));
 return {ok:true,account:next,price};
}
// Wrong streaming links (U45, reported from the weekly plan; the repair queue N55 reads them), in KV (binding
// AWARDS, prefix "report:"): { id, at, status: 'pending' | 'fixed' | 'rejected', anilistId, title, service, url,
// suggestion?, note?, resolvedAt?, resolution? }. POST /reports adds one, GET /reports[?status=] lists them
// (newest first), POST /reports/resolve { id, status, resolution? } closes one.
const REPORT_STATUS=['pending','fixed','rejected'];
const httpsUrl=v=>{const u=str(v);if(!u)return '';if(u.length>400||!/^https:\/\/[^\s<>"]+$/.test(u))fail(400,'Ungültiger Link.');return u;};
const shortText=(v,max,what)=>{const t=str(v);if(t.length>max||/[<>]/.test(t))fail(400,'Ungültige Angabe: '+what+'.');return t;};
async function reportsList(env,status){
 const store=awardsStore(env),out=[];let cursor;
 do{const page=await store.list({prefix:'report:',cursor});
  for(const key of page.keys){try{const r=JSON.parse(await store.get(key.name)||'null');if(r&&(!status||r.status===status))out.push(r);}catch{}}
  cursor=page.list_complete?undefined:page.cursor;}while(cursor);
 return out.sort((a,b)=>b.at.localeCompare(a.at));
}
async function reportAdd(body,env){
 const anilistId=Number(body.anilistId);
 if(!Number.isSafeInteger(anilistId)||anilistId<=0)fail(400,'Ungültige Serie.');
 const report={id:crypto.randomUUID().slice(0,12),at:new Date().toISOString(),status:'pending',anilistId,
  title:shortText(body.title,200,'Titel'),service:shortText(body.service,40,'Dienst'),url:httpsUrl(body.url)};
 if(!report.title||!report.service||!report.url)fail(400,'Serie, Dienst und Link angeben.');
 const suggestion=httpsUrl(body.suggestion),note=shortText(body.note,300,'Notiz');
 if(suggestion)report.suggestion=suggestion;if(note)report.note=note;
 const pending=await reportsList(env,'pending');
 if(pending.length>=200)fail(429,'Zu viele offene Meldungen.');
 if(pending.some(r=>r.anilistId===anilistId&&r.url===report.url&&(r.suggestion||'')===(report.suggestion||'')))return {ok:true,duplicate:true};
 await awardsStore(env).put('report:'+report.id,JSON.stringify(report));
 return {ok:true,id:report.id};
}
async function reportResolve(body,env){
 const id=str(body.id),status=str(body.status);
 if(!/^[a-f0-9-]{6,40}$/.test(id)||!REPORT_STATUS.includes(status))fail(400,'Ungültige Angabe.');
 const store=awardsStore(env),old=JSON.parse(await store.get('report:'+id)||'null');
 if(!old)fail(404,'Meldung nicht gefunden.');
 const resolution=shortText(body.resolution,300,'Lösung');
 const next={...old,status,...(status==='pending'?{}:{resolvedAt:new Date().toISOString()}),...(resolution&&{resolution})};
 await store.put('report:'+id,JSON.stringify(next));
 return {ok:true,report:next};
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const cors=originHeaders(origin,env);
  if(!cors)return json({error:'Origin nicht zugelassen.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const path=new URL(request.url).pathname.replace(/\/$/,'');
  try{
   if(request.method==='GET'&&path==='/health')return json({ok:true},200,cors);
   if(request.method==='GET'&&path==='/access'){
    await authorized(request,env);
    return json({ok:true},200,cors);
   }
   if(request.method==='POST'&&path==='/vote'){
    if(Number(request.headers.get('Content-Length')||0)>2048)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(await saveVote(body,env),200,cors);
   }
   if(request.method==='GET'&&path==='/awards'){
    await authorized(request,env);
    return json(await awardsGet(new URL(request.url),env),200,cors);
   }
   if(request.method==='GET'&&path==='/awards/ceddl'){
    return json({candidates:await ceddlList(env,awardSeason(new URL(request.url).searchParams.get('season')))},200,cors);
   }
   if(request.method==='POST'&&(path==='/awards/ceddl'||path==='/awards/ceddl/remove')){
    if(Number(request.headers.get('Content-Length')||0)>2048)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(await ceddlChange(body,env,path==='/awards/ceddl/remove'),200,cors);
   }
   if(request.method==='POST'&&(path==='/awards/ballot'||path==='/awards/reveal')){
    // a full ballot: 22 categories × 3 places
    if(Number(request.headers.get('Content-Length')||0)>32768)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(path==='/awards/ballot'?await awardsBallot(body,env):await awardsReveal(body,env),200,cors);
   }
   if(request.method==='GET'&&path==='/stocks'){
    await authorized(request,env);
    return json(await stocksGet(new URL(request.url),env,Number(env.TEST_NOW)||Date.now()),200,cors);
   }
   if(request.method==='POST'&&path==='/stocks/trade'){
    if(Number(request.headers.get('Content-Length')||0)>2048)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(await stocksTrade(body,env,Number(env.TEST_NOW)||Date.now()),200,cors);
   }
   if(request.method==='GET'&&path==='/reports'){
    await authorized(request,env);
    const status=new URL(request.url).searchParams.get('status');
    if(status&&!REPORT_STATUS.includes(status))fail(400,'Ungültiger Status.');
    return json({reports:await reportsList(env,status)},200,cors);
   }
   if(request.method==='POST'&&(path==='/reports'||path==='/reports/resolve')){
    if(Number(request.headers.get('Content-Length')||0)>4096)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(path==='/reports'?await reportAdd(body,env):await reportResolve(body,env),200,cors);
   }
   return json({error:'Nicht gefunden.'},404,cors);
  }catch(error){return json({error:error?.status?error.message:'Die Abstimmung konnte nicht verarbeitet werden.'},error?.status||500,cors);}
 }
};
