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
   return json({error:'Nicht gefunden.'},404,cors);
  }catch(error){return json({error:error?.status?error.message:'Die Abstimmung konnte nicht verarbeitet werden.'},error?.status||500,cors);}
 }
};
