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
// "ballot:<season>:<person>" = { person, picks: { category: anime title }, at }. Before "Auflösen" only the names
// of who voted are given out; "meta:<season>" = { revealed: true, revealedAt } then shows everything and closes voting.
const AWARD_CATEGORIES=['best','surprise','animation','opening','ending','finale'];
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
async function awardsBallot(body,env){
 const season=awardSeason(body.season),person=str(body.person);
 if(!AWARD_NAME.test(person))fail(400,'Ungültiger Name.');
 const picks={};
 if(!body.picks||typeof body.picks!=='object'||Array.isArray(body.picks))fail(400,'Ungültiger Stimmzettel.');
 for(const [category,title] of Object.entries(body.picks)){
  if(!AWARD_CATEGORIES.includes(category))fail(400,'Unbekannte Kategorie.');
  const value=str(title);
  if(!value)continue;
  if(value.length>200||/[<>]/.test(value))fail(400,'Ungültiger Anime-Titel.');
  picks[category]=value;
 }
 if(!Object.keys(picks).length)fail(400,'Mindestens eine Kategorie wählen.');
 const store=awardsStore(env);
 const meta=JSON.parse(await store.get('meta:'+season)||'{}');
 if(meta.revealed)fail(409,'Die Awards dieser Season sind schon aufgelöst.');
 await store.put('ballot:'+season+':'+person,JSON.stringify({person,picks,at:new Date().toISOString()}));
 return {ok:true,season,person};
}
async function awardsReveal(body,env){
 const season=awardSeason(body.season);
 const {meta,ballots}=await awardsState(env,season);
 if(meta.revealed)return {ok:true,season,revealed:true};
 if(!ballots.length)fail(409,'Noch hat niemand abgestimmt.');
 await awardsStore(env).put('meta:'+season,JSON.stringify({revealed:true,revealedAt:new Date().toISOString()}));
 return {ok:true,season,revealed:true};
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
   if(request.method==='POST'&&(path==='/awards/ballot'||path==='/awards/reveal')){
    if(Number(request.headers.get('Content-Length')||0)>4096)fail(413,'Anfrage zu groß.');
    await authorized(request,env);
    const body=await request.json();
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Ungültige Anfrage.');
    return json(path==='/awards/ballot'?await awardsBallot(body,env):await awardsReveal(body,env),200,cors);
   }
   return json({error:'Nicht gefunden.'},404,cors);
  }catch(error){return json({error:error?.status?error.message:'Die Abstimmung konnte nicht verarbeitet werden.'},error?.status||500,cors);}
 }
};
