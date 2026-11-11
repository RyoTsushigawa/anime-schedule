'use strict';
// 'Default' denotes an untouched vote in Google Sheets; it is not a selectable choice.
const PV_OPTIONS = ['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist','Okinawa 3'];
const PV_SEASONS = /^(Winter|Frühling|Sommer|Herbst)\s+(20\d{2})$/i;
const PV_MONTHS = {winter:0,'frühling':3,sommer:6,herbst:9};
const pv = id => document.getElementById(id);
const clean = s => String(s || '').trim();
const safeText = s => clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seasonTabs = [], seasonIndex = {seasons:{}}, animeIndex = {seasons:{}}, current = null, shows = [], people = [];
let voteApi = '', member = null, memberError = '', votingToken = '', saving = new Set(), reloadTimer = 0;
function state(msg) {pv('previewStatus').textContent=msg;}
function seasonKey(tab){const m=tab.name.match(PV_SEASONS);return m ? m[1].toLowerCase()+'-'+m[2] : '';}
function parseSeasonRows(rows){
  const h = rows.findIndex(r=>r.some(c=>clean(c)==='Anime Titel'));
  if(h<0)throw Error('Die Season-Liste enthält keine Spalte „Anime Titel“.');
  const cols=rows[h].map(clean), title=cols.indexOf('Anime Titel'), english=cols.indexOf('Eng Anime Titel');
  const reserved=new Set(['Anime Titel','Eng Anime Titel','Wo','Tag','Uhrzeit','Startdatum','Sort','Slot','Genre','Studio','Staffel','Episode','Folgen']);
  const firstPerson=cols.indexOf('Uhrzeit')+1;
  const voters=cols.map((name,i)=>({name,i})).filter(x=>x.i>=firstPerson&&x.name&&!reserved.has(x.name));
  people=voters.map(v=>v.name);
  return rows.slice(h+1).filter(r=>clean(r[title])).map((r,i)=>({
    key:clean(r[title]).toLocaleLowerCase(),title:clean(r[title]),english:english<0?'':clean(r[english]),order:i+1,
    votes:voters.flatMap(({name,i})=>clean(r[i])?[{name,value:clean(r[i]).replace(/,$/,'')}]:[])
  }));
}
async function listSeasonTabs(){
 const response=await fetch(SHEET+'/htmlview',{cache:'no-cache'});
 if(!response.ok)throw Error('Season-Listen konnten nicht geladen werden.');
 const html=await response.text();
 const raw=[...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)];
 return raw.map(([,name,gid])=>({name:clean(name),gid})).filter(x=>PV_SEASONS.test(x.name))
 .sort((a,b)=>{const ma=a.name.match(PV_SEASONS),mb=b.name.match(PV_SEASONS);return (+mb[2]*12+PV_MONTHS[mb[1].toLowerCase()])-(+ma[2]*12+PV_MONTHS[ma[1].toLowerCase()]);});
}
// Teasers are permitted only after a documented search finds no suitable full trailer.
// Both trailer types require verified footage and a non-sequel classification.
function verifiedTrailer(entry) {
 if(!entry || Array.isArray(entry) || entry.verified!==true ||
    entry.sequelStatus!=='not_sequel' || entry.footageVerified!==true)return null;
 const teaser=entry.type==='teaser';
 if(entry.type!=='full_trailer' && !(teaser&&entry.fallbackApproved===true&&entry.fullTrailerUnavailable===true))return null;
 const id=clean(entry.youtubeId);
 return /^[a-zA-Z0-9_-]{11}$/.test(id)?{
  id,type:entry.type, subtitles:entry.subtitles==='de'?'DE':entry.subtitles==='en'?'EN':null,
  title:clean(entry.title)||(teaser?'Offizieller Teaser':'Offizieller Trailer')
 }:null;
}
function malLink(show){
 const key=seasonKey(current).replace(/^herbst-/,'fall-').replace(/^frühling-/,'spring-').replace(/^sommer-/,'summer-');
 const entries=animeIndex.seasons?.[key]||[];
 const normTitle=title=>clean(title).toLocaleLowerCase().normalize('NFKC');
 const title=normTitle(show.title),english=normTitle(show.english);
 const matched=entries.find(e=>normTitle(e.romaji)===title || (english && normTitle(e.english)===english));
 const direct=matched?.mal;
 if(typeof direct==='string' && /^https:\/\/myanimelist\.net\/anime\/\d+(?:\/[^?#]*)?$/.test(direct))return {url:direct,label:'MyAnimeList'};
 return {url:'https://myanimelist.net/anime.php?q='+encodeURIComponent(show.english||show.title)+'&cat=anime',label:'Auf MyAnimeList suchen'};
}
function detailsFor(show){
 const data=seasonIndex.seasons?.[seasonKey(current)] || {};
 return data.trailers?.[show.key] || null;
}
// The playlist still contains ONE canonical video per show. Alternate videos
// are verified options for viewers, not additional playlist entries.
function trailerCandidates(show){
 const entry=detailsFor(show);
 if(!entry || entry.sequelStatus==='sequel')return [];
 const all=[entry,...(Array.isArray(entry.candidates)?entry.candidates:[])];
 const seen=new Set();
 const videos=all.flatMap(item=>{
  const video=verifiedTrailer(item);
  if(!video||seen.has(video.id))return [];
  if(shows.some(s=>s!==show && verifiedTrailer(detailsFor(s))?.id===video.id))return [];
  seen.add(video.id);return [video];
 });
 // Full trailers always take precedence, regardless of source ordering or saved preference.
 const full=videos.filter(video=>video.type==='full_trailer');
 return full.length?full:videos.filter(video=>video.type==='teaser');
}
function pickedTrailer(show){
 const list=trailerCandidates(show);
 let saved='';
 try{saved=localStorage.getItem('seasonTrailerChoice:'+seasonKey(current)+':'+show.key)||'';}catch{}
 return list.find(v=>v.id===saved)||list[0]||null;
}
function trailerFor(show){return trailerCandidates(show)[0]||null;}
function trailerStatus(show){
 const entry=detailsFor(show);
 if(entry?.sequelStatus==='sequel')return 'Fortsetzung · kein Trailer';
 if(entry?.sequelStatus!=='not_sequel')return 'Einordnung noch offen · kein Trailer';
 if(entry.youtubeStatus==='not_found')return 'Kein passender Trailer auf YouTube gefunden';
 if(entry.youtubeStatus==='unavailable')return 'Auf YouTube nicht verfügbar';
 if(entry.youtubeStatus==='checking')return 'Trailer wird geprüft';
 return 'Trailer noch nicht geprüft';
}
// Personal alternative video links do not change the shared catalog or YouTube playlist.
function externalKey(show){return 'seasonExternalTrailer:'+seasonKey(current)+':'+show.key;}
function externalUrl(input){
 try {
  const url=new URL(clean(input));
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>1500||
     !host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
     /^(\d+\.){3}\d+$/.test(host))return '';
  return url.href;
 }catch{return '';}
}
function localExternal(show){
 if(detailsFor(show)?.sequelStatus==='sequel'||trailerFor(show))return '';
 try{return externalUrl(localStorage.getItem(externalKey(show)));}catch{return '';}
}
function voteValue(show,person){
 const vote=show.votes.find(v=>v.name===person)?.value||'';
 return !vote||vote.toLowerCase()==='default'?'Default':vote;
}
function validChoices(person){
 return PV_OPTIONS.filter(option=>option!=='Okinawa 3'||['quecks','rei','terra'].includes(person.toLowerCase()));
}
function currentVoter(){return pv('previewPerson').value||member?.person||'';}
function readAniListToken(){
 try{
  if(localStorage.getItem('listProvider')==='mal')return '';
  const accounts=JSON.parse(localStorage.getItem('anilistAccounts')||'[]');
  const selected=localStorage.getItem('anilistActive');
  const account=accounts.find(a=>a.name===selected && (a.provider||'anilist')==='anilist')||
    (!selected?accounts.find(a=>(a.provider||'anilist')==='anilist'):null);
  return account?.token && (!account.expires||account.expires>Date.now())?account.token:'';
 }catch{return '';}
}
function updateMemberUI(){
 const info=pv('previewVotingInfo'), selector=pv('previewPerson'), label=pv('previewPersonLabel');
 const allowed=member?[member.person,...(member.delegates||[])].filter((p,i,all)=>all.indexOf(p)===i&&people.includes(p)):[];
 const previous=selector.value;
 selector.replaceChildren(...allowed.map(p=>new Option(p+(p===member.person?'':' (Vertretung)'),p)));
 if(allowed.includes(previous))selector.value=previous;
 else if(allowed.includes(member?.person))selector.value=member.person;
 label.hidden=selector.hidden=allowed.length<2;
 info.textContent=member?'AniList: '+member.account+' · Deine Änderungen werden in Google Sheets gespeichert.':
  voteApi?'Bitte verbinde dein AniList-Konto über die Hauptseite. Nur freigeschaltete Mitglieder dürfen abstimmen.':
  'Abstimmen wird nach Einrichtung der sicheren Sheets-Verbindung freigeschaltet. Die Tabelle bleibt jederzeit bearbeitbar.';
 if(memberError && !member)info.textContent=memberError;
}
async function configureVoting(){
 const settings=await config();
 voteApi=typeof settings.previewVotesUrl==='string' && /^https:\/\//.test(settings.previewVotesUrl)?
  settings.previewVotesUrl.replace(/\/$/,''):'';
 votingToken=readAniListToken();
 member=null;memberError='';
 if(voteApi&&votingToken){
  try{
   const response=await fetch(voteApi+'/me',{headers:{Authorization:'Bearer '+votingToken},cache:'no-store'});
   if(!response.ok)throw new Error(response.status===403?'Dieses AniList-Konto ist noch nicht freigeschaltet.':'Anmeldung konnte nicht geprüft werden.');
   const verified=await response.json();
   if(typeof verified.account==='string'&&typeof verified.person==='string')member=verified;
  }catch(error){memberError='Anmeldung nicht verfügbar: '+error.message;}
 }
 updateMemberUI();
 if(current)render();
}
function votingControls(show){
 if(!member)return '<p class="preview-vote-note">Noch keine Abstimmung über die Website möglich. Die Stimmen aus Google Sheets bleiben sichtbar.</p>';
 const person=currentVoter();
 if(!person)return '';
 const picked=voteValue(show,person),disabled=saving.has(show.key);
 const buttons=validChoices(person).map(choice=>'<button type="button" class="preview-choice'+(picked===choice?' selected':'')+
  '" data-vote="'+safeText(choice)+'" data-anime="'+safeText(show.key)+'" aria-pressed="'+(picked===choice)+
  '"'+(disabled?' disabled':'')+'>'+safeText(choice)+'</button>').join('');
 return '<div class="preview-voting"><div class="preview-vote-title">Deine Auswahl für '+safeText(person)+
  ' · '+(picked==='Default'?'Noch nicht abgestimmt':safeText(picked))+'</div><div class="preview-choices">'+buttons+
  '<button type="button" class="preview-reset" data-vote="Default" data-anime="'+safeText(show.key)+
  '"'+(disabled||picked==='Default'?' disabled':'')+'>Zurücksetzen</button></div></div>';
}
async function refreshSheet(silent=false){
 if(!current||saving.size)return;
 const gid=current.gid;
 try{
  const latest=parseSeasonRows(await sheetRows(gid));
  if(current?.gid!==gid)return;
  shows=latest;
  if(!silent)state('Google Sheets aktualisiert.');
  updateMemberUI();render();
 }catch(error){if(!silent)state('Aktualisierung fehlgeschlagen: '+error.message);}
}
async function saveVote(show,choice){
 if(!member||!voteApi||!votingToken||saving.has(show.key))return;
 const person=currentVoter();
 if(!validChoices(person).includes(choice)&&choice!=='Default')return;
 const old=voteValue(show,person),gid=current.gid;
 if(old===choice)return;
 saving.add(show.key);render();
 state('Speichert '+person+' · '+show.title+' …');
 try{
  const response=await fetch(voteApi+'/vote',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+votingToken},
   body:JSON.stringify({gid,title:show.title,person,choice,expected:old})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||('Speichern fehlgeschlagen (HTTP '+response.status+')'));
  if(current?.gid===gid){
   const existing=show.votes.find(v=>v.name===person);
   if(existing)existing.value=choice;else show.votes.push({name:person,value:choice});
  }
  state('Gespeichert ✓ · '+person+' · '+show.title);
 }catch(error){state('Nicht gespeichert: '+error.message+' · Bitte erneut versuchen.');}
 finally{saving.delete(show.key);render();}
}
pv('previewList').addEventListener('submit',event=>{
 const form=event.target.closest('form[data-external-anime]');
 if(!form)return;
 event.preventDefault();
 const show=shows.find(s=>s.key===form.dataset.externalAnime);
 if(!show||detailsFor(show)?.sequelStatus==='sequel'||trailerFor(show))return;
 const link=externalUrl(form.querySelector('input[name="externalTrailer"]')?.value);
 if(!link){state('Bitte einen gültigen HTTPS-Link zu einem echten Trailer angeben.');return;}
 try{localStorage.setItem(externalKey(show),link);}
 catch{state('Der Browser konnte den Link nicht speichern.');return;}
 state('Dein alternativer Trailer-Link wurde für '+show.title+' gespeichert.');
 render();
});
pv('previewList').addEventListener('click',event=>{
 const remove=event.target.closest('button[data-remove-external]');
 if(remove){
  const show=shows.find(s=>s.key===remove.dataset.removeExternal);
  if(show){try{localStorage.removeItem(externalKey(show));}catch{}render();}
  return;
 }
 const vote=event.target.closest('button[data-vote]');
 if(vote){
  const show=shows.find(s=>s.key===vote.dataset.anime);
  if(show)saveVote(show,vote.dataset.vote);
  return;
 }
 const video=event.target.closest('button[data-trailer]');
 if(video){
  const show=shows.find(s=>s.key===video.dataset.anime);
  if(!show||!trailerCandidates(show).some(v=>v.id===video.dataset.trailer))return;
  try{localStorage.setItem('seasonTrailerChoice:'+seasonKey(current)+':'+show.key,video.dataset.trailer);}catch{}
  render();
 }
});
pv('previewPerson').addEventListener('change',render);
pv('previewRefresh').addEventListener('click',()=>refreshSheet(false));
function render(){
 const q=clean(pv('previewSearch').value).toLocaleLowerCase(),filter=pv('previewFilter').value;
 const data=seasonIndex.seasons?.[seasonKey(current)]||{}, trailers=shows.filter(x=>trailerFor(x)).length;
 pv('previewTitle').textContent=current?.name||'Season Preview';
 pv('previewIntro').textContent='Reihenfolge aus der Google-Sheets-Season-Liste · '+shows.length+' Serien';
 pv('previewStats').hidden=false;
 pv('previewStats').innerHTML='<span class="preview-stat"><b>'+shows.length+'</b> Serien</span><span class="preview-stat"><b>'+trailers+'</b> geprüfte Trailer</span><span class="preview-stat"><b>'+(shows.length-trailers)+'</b> ohne bestätigten YouTube-Trailer</span><span class="preview-stat"><b>'+shows.filter(s=>['not_found','unavailable'].includes(detailsFor(s)?.youtubeStatus)&&!trailerFor(s)).length+'</b> auf YouTube fehlend</span>';
 const playlistId=clean(data.youtubePlaylistId),playlist=pv('previewPlaylist');
 playlist.hidden=!/^[\w-]{20,}$/.test(playlistId);
 if(!playlist.hidden)playlist.href='https://www.youtube.com/playlist?list='+encodeURIComponent(playlistId);
 const shown=shows.filter(s=>(!q||(s.title+' '+s.english).toLocaleLowerCase().includes(q))&&(filter==='all'||(filter==='ready')===!!trailerFor(s)));
 const parent=pv('previewList');parent.replaceChildren();
 if(!shown.length){const empty=document.createElement('p');empty.className='preview-empty';empty.textContent='Keine passenden Serien gefunden.';parent.append(empty);return;}
 for(const s of shown){
  const trailer=pickedTrailer(s),candidates=trailerCandidates(s),mal=malLink(s),external=localExternal(s),article=document.createElement('article');article.className='preview-item';
  const links=trailer?'<a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/watch?v='+trailer.id+'">▶ '+(trailer.type==='teaser'?'Teaser ansehen (Ersatz)':'Vollständigen Trailer ansehen')+'</a>':'';
  const choices=candidates.length>1?'<div class="preview-alternates"><div class="preview-vote-title">Trailer auswählen · nur für deine Ansicht</div>'+candidates.map(v=>'<button type="button" data-trailer="'+v.id+'" data-anime="'+safeText(s.key)+'" class="preview-choice'+(trailer.id===v.id?' selected':'')+'" aria-pressed="'+(trailer.id===v.id)+'">'+safeText(v.title)+(v.type==='teaser'?' · Teaser (Ersatz)':'')+(v.subtitles?' · '+v.subtitles:'')+'</button>').join('')+'</div>':'';
  const fallback=!trailer&&detailsFor(s)?.sequelStatus!=='sequel'?'<div class="preview-external">'+
  (external?'<p>Eigener Trailer (ungeprüft): <a href="'+safeText(external)+'" target="_blank" rel="noopener noreferrer">Trailer öffnen</a> <button type="button" class="preview-reset" data-remove-external="'+safeText(s.key)+'">Entfernen</button></p>':'')+
  '<form data-external-anime="'+safeText(s.key)+'"><label>Trailer von einer anderen Seite (nur für dich)<input type="url" name="externalTrailer" required placeholder="https://…" value="'+safeText(external)+'"></label><button type="submit" class="preview-choice">Link speichern</button></form><small>Nur echte Trailer mit Szenen des Anime. Der Link wird in diesem Browser gespeichert, nicht veröffentlicht oder der YouTube-Playlist hinzugefügt.</small></div>':'';
  const decided=s.votes.filter(v=>v.value&&v.value.toLowerCase()!=='default');
  const votes=decided.length?decided.map(v=>'<span>'+safeText(v.name)+': '+safeText(v.value)+'</span>').join(''):'<span>Noch keine Stimmen</span>';
  article.innerHTML='<div class="preview-order">'+s.order+'</div><div><h2>'+safeText(s.title)+'</h2>'+(s.english&&s.english!==s.title?'<p class="preview-eng">'+safeText(s.english)+'</p>':'')+
  '<div class="preview-meta"><span class="preview-chip '+(trailer?'ready':'')+'">'+(trailer?(trailer.type==='teaser'?'Nur Teaser verfügbar · Ersatz':'Vollständiger Trailer verfügbar'):trailerStatus(s))+'</span>'+(trailer&&trailer.subtitles?'<span class="preview-chip">Untertitel: '+trailer.subtitles+'</span>':'')+'</div>'+
  '<div class="preview-links">'+links+'<a target="_blank" rel="noopener noreferrer" href="'+safeText(mal.url)+'">'+mal.label+'</a></div>'+choices+fallback+
  '<div class="preview-votes"><div class="preview-vote-title">Gruppen-Entscheidung · aus Google Sheets</div><div class="preview-vote-chips">'+votes+'</div>'+votingControls(s)+'</div></div>';
  parent.append(article);
 }
}
async function selectSeason(gid){
 current=seasonTabs.find(t=>t.gid===gid);if(!current)return;
 state('Lade '+current.name+' …');
 try{
  const rows=await sheetRows(current.gid);
  shows=parseSeasonRows(rows);
  state('Live aus der Season-Liste · Google Sheets ist die gemeinsame Datenquelle.');
  updateMemberUI();
  render();
 }catch(e){shows=[];pv('previewList').replaceChildren();pv('previewStats').hidden=true;state('Season konnte nicht geladen werden: '+e.message);}
}
async function start(){
 try{
  const [tabs,metadata,animeData]=await Promise.all([
   listSeasonTabs(),
   fetch('season-trailers.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{seasons:{}}).catch(()=>({seasons:{}})),
   fetch('seasons.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{seasons:{}}).catch(()=>({seasons:{}}))
  ]);
  seasonTabs=tabs;seasonIndex=metadata&&typeof metadata==='object'?metadata:{seasons:{}};
  animeIndex=animeData&&typeof animeData==='object'?animeData:{seasons:{}};
  const sel=pv('previewSeason');
  if(!tabs.length){state('Noch keine eigenständige Season-Liste gefunden. Sobald z. B. „Winter 2027“ im Google Sheet angelegt wird, erscheint sie hier.');return;}
  for(const t of tabs){const opt=document.createElement('option');opt.value=t.gid;opt.textContent=t.name;sel.append(opt);}
  const future=tabs.filter(t=>{const m=t.name.match(PV_SEASONS);return m&&(+m[2]*12+PV_MONTHS[m[1].toLowerCase()])>=(new Date().getFullYear()*12+new Date().getMonth());});
  const chosen=future.length?future.at(-1):tabs[0];sel.value=chosen.gid;await selectSeason(chosen.gid);
  await configureVoting();
  sel.addEventListener('change',()=>selectSeason(sel.value));
 }catch(e){state('Season-Listen sind gerade nicht verfügbar: '+e.message);}
}
pv('previewSearch').addEventListener('input',()=>{if(current)render();});
pv('previewFilter').addEventListener('change',()=>{if(current)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSheet(true);});
reloadTimer=setInterval(()=>{if(!document.hidden)refreshSheet(true);},90000);
start();
