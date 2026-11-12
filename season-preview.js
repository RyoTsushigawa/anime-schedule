'use strict';
// 'Default' denotes an untouched vote in Google Sheets; it is not a selectable choice.
const INFO = 'Ein Trailer pro neuer Serie, automatisch gewählt: bevorzugt offizielle Trailer (Crunchyroll, Netflix & Co.), mit Untertiteln, wenn es sie gibt. Sequels bekommen keinen Trailer, Serien aus der vorherigen Season erscheinen hier nicht.';
const PV_OPTIONS = ['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist','Okinawa 3'];
const PV_SEASONS = /^(Winter|Frühling|Sommer|Herbst)\s+(20\d{2})$/i;
const PV_MONTHS = {winter:0,'frühling':3,sommer:6,herbst:9};
const pv = id => document.getElementById(id);
const clean = s => String(s || '').trim();
const safeText = s => clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seasonTabs = [], seasonIndex = {seasons:{}}, animeIndex = {seasons:{}}, current = null, shows = [], people = [];
let voteApi = '', member = null, memberError = '', groupCode = '', saving = new Set();
let carryoverNotice = '', seasonRequest = 0;
const pendingVotes = new Map(); // show key → the choice being saved (shown right away)
const checkedNewTitles = new Map();
const voteFeedback = new Map();
const voteFeedbackKey = (gid,key,person)=>gid+'|'+key+'|'+person;
function state(msg) {pv('previewStatus').textContent=msg;pv('previewStatus').hidden=!msg;}
function seasonKey(tab){const m=tab?.name.match(PV_SEASONS);if(!m)return '';const name={winter:'winter','frühling':'spring',sommer:'summer',herbst:'fall'}[m[1].toLowerCase()];return name+'-'+m[2];}
function parseSeasonRows(rows, updatePeople=true){
  const h = rows.findIndex(r=>r.some(c=>clean(c)==='Anime Titel'));
  if(h<0)throw Error('Die Season-Liste enthält keine Spalte „Anime Titel“.');
  const cols=rows[h].map(clean), title=cols.indexOf('Anime Titel'), english=cols.indexOf('Eng Anime Titel'), startCol=cols.indexOf('Startdatum');
  const reserved=new Set(['Anime Titel','Eng Anime Titel','Wo','Tag','Uhrzeit','Startdatum','Sort','Slot','Genre','Studio','Staffel','Episode','Folgen']);
  const firstPerson=cols.indexOf('Uhrzeit')+1;
  const voters=cols.map((name,i)=>({name,i})).filter(x=>x.i>=firstPerson&&x.name&&!reserved.has(x.name));
  if(updatePeople)people=voters.map(v=>v.name);
  return rows.slice(h+1).filter(r=>{const name=clean(r[title]);return name && !(name.toLowerCase()==='amount'&&/^\d+$/.test(clean(r[english])));}).map((r,i)=>({
    key:clean(r[title]).toLocaleLowerCase(),title:clean(r[title]),english:english<0?'':clean(r[english]),order:i+1,start:startCol<0?null:startDate(r[startCol]),
    votes:voters.flatMap(({name,i})=>clean(r[i])?[{name,value:clean(r[i]).replace(/,$/,'')}]:[])
  }));
}
// "07.01.2027" → that day (local), or null
function startDate(text){
 const m=clean(text).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
 return m?new Date(+m[3],+m[2]-1,+m[1]):null;
}
// Start-Leiste: one pill per start week (Monday–Sunday) and one for shows without a date; a pill filters the list
let startFilter='';
const weekOf=d=>{const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;};
const weekKey=d=>{const x=weekOf(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const shortDate=(d,opts)=>d.toLocaleDateString('de-DE',opts);
function drawStarts(){
 const box=pv('previewStarts');
 const weeks=new Map();let none=0;
 for(const s of shows){if(!s.start){none++;continue;}const k=weekKey(s.start);weeks.set(k,[...(weeks.get(k)||[]),s]);}
 box.hidden=!weeks.size;
 if(!weeks.size){startFilter='';return;}
 if(startFilter&&startFilter!=='none'&&!weeks.has(startFilter))startFilter='';
 const pill=(key,label,list,title)=>'<button type="button" class="preview-start-week" data-start-week="'+key+'" aria-pressed="'+(startFilter===key)+'" title="'+safeText(title)+'"><b>'+list+'</b><span>'+safeText(label)+'</span></button>';
 box.innerHTML='<span class="preview-starts-label">Start</span>'+[...weeks].sort(([a],[b])=>a.localeCompare(b)).map(([k,list])=>{
  const from=weekOf(list[0].start),to=new Date(from);to.setDate(to.getDate()+6);
  const label=from.getMonth()===to.getMonth()?from.getDate()+'.–'+shortDate(to,{day:'numeric',month:'short'}):shortDate(from,{day:'numeric',month:'short'})+' – '+shortDate(to,{day:'numeric',month:'short'});
  return pill(k,label,list.length,list.map(s=>s.english||s.title).join('\n'));
 }).join('')+(none?pill('none','ohne Termin',none,none+' Serien ohne Startdatum in der Liste'):'');
}
async function listSeasonTabs(){
 const response=await fetch(SHEET+'/htmlview',{cache:'no-cache'});
 if(!response.ok)throw Error('Season-Listen konnten nicht geladen werden.');
 const html=await response.text();
 const raw=[...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)];
 return raw.map(([,name,gid])=>({name:clean(name),gid})).filter(x=>PV_SEASONS.test(x.name))
 .sort((a,b)=>{const ma=a.name.match(PV_SEASONS),mb=b.name.match(PV_SEASONS);return (+mb[2]*12+PV_MONTHS[mb[1].toLowerCase()])-(+ma[2]*12+PV_MONTHS[ma[1].toLowerCase()]);});
}
// Trailers are picked automatically by tools/trailers.mjs (auto: true) and only for new shows (no sequels).
// Older hand-checked entries (verified + footageVerified) still count.
function verifiedTrailer(entry) {
 if(!entry || Array.isArray(entry) || entry.sequelStatus!=='not_sequel' ||
    !(entry.auto===true || (entry.verified===true && entry.footageVerified===true)))return null;
 const teaser=entry.type==='teaser';
 if(entry.type!=='full_trailer' && !(teaser&&entry.fallbackApproved===true&&entry.fullTrailerUnavailable===true))return null;
 const id=clean(entry.youtubeId);
 return /^[a-zA-Z0-9_-]{11}$/.test(id)?{
  id,type:entry.type, subtitles:entry.subtitles==='de'?'DE':entry.subtitles==='en'?'EN':null,
  title:clean(entry.title)||(teaser?'Offizieller Teaser':'Offizieller Trailer')
 }:null;
}
// Covers (idea 87): from AniList, by the show's MyAnimeList ID where known, else by title; kept for a week
let covers=new Map();
// A blank URL does not count as successfully cached: retries must be allowed.
const hasCover=(key)=>typeof covers.get(key)==='string' && /^https:\/\//.test(covers.get(key));
async function loadCovers(tab,list){
 const cacheKey='previewCovers:'+tab.gid;
 covers=new Map(); // Never reuse a different season's covers while loading.
 try{
  const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');
  if(saved && Date.now()-saved.time<7*86400000 && Array.isArray(saved.covers))
   covers=new Map(saved.covers.filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&typeof x[1]==='string'&&/^https:\/\//.test(x[1])));
 }catch{}
 const want=list.filter(s=>!hasCover(s.key));
 if(!want.length)return;
 const malId=s=>malLink(s).url.match(/myanimelist\.net\/anime\/(\d+)/)?.[1];
 const byMal=want.filter(malId),byTitle=want.filter(s=>!malId(s));
 // A MAL entry can be missing in AniList; fall back to the English title
 // instead of permanently treating that title as coverless.
 for(let i=0;i<byMal.length;i+=50){
  const part=byMal.slice(i,i+50);
  try{
   const data=await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { idMal coverImage { medium } } } }',
    {ids:part.map(s=>Number(malId(s)))},undefined,{retries:0,timeout:10000});
   for(const show of part){
    const url=data.Page?.media?.find(m=>String(m.idMal)===malId(show))?.coverImage?.medium;
    if(url)covers.set(show.key,url);
    else byTitle.push(show);
   }
  }catch{byTitle.push(...part);}
 }
 // A failed batch must not prevent later batches from succeeding.
 for(let i=0;i<byTitle.length;i+=10){
  const part=byTitle.slice(i,i+10);
  const query='query ('+part.map((_,j)=>'$t'+j+': String').join(', ')+') {'+
   part.map((_,j)=>' s'+j+': Page(perPage: 1) { media(search: $t'+j+', type: ANIME, sort: SEARCH_MATCH) { coverImage { medium } } }').join('')+' }';
  try{
   // "Sekiro: No Defeat (TV)" → "Sekiro: No Defeat": an ending in brackets keeps AniList's search from finding it
   const term=show=>String(show.english||show.title||'').trim().replace(/\s*\((?:TV|ONA|OVA|Movie|\d{4})\)\s*$/i,'');
   const data=await anilist(query,Object.fromEntries(part.map((show,j)=>['t'+j,term(show)])),
    undefined,{retries:0,timeout:10000});
   for(const [j,show] of part.entries()){
    const url=data['s'+j]?.media?.[0]?.coverImage?.medium;
    if(url)covers.set(show.key,url);
   }
  }catch{} // A later visit can retry only the missing covers.
 }
 try{localStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),covers:[...covers].filter(([,url])=>/^https:\/\//.test(url))}));}catch{}
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
function carryoverStatus(show){
 // false: checked against the previous season's list and new; null: not checked
 return checkedNewTitles.get(current?.gid)?.has(show.key)?false:null;
}
// Hide continuing titles from the preview, not from the Google Sheet.
function previousTab(tab){
 const match=tab?.name.match(PV_SEASONS);
 if(!match)return null;
 const month=PV_MONTHS[match[1].toLowerCase()],year=Number(match[2]);
 const previousMonth=(month+9)%12,previousYear=year-(month===0?1:0);
 return seasonTabs.find(t=>{
  const candidate=t.name.match(PV_SEASONS);
  return candidate&&Number(candidate[2])===previousYear&&PV_MONTHS[candidate[1].toLowerCase()]===previousMonth;
 })||null;
}
function comparableTitles(show){
 return [show.title,show.english].map(s=>clean(s).normalize('NFKC').toLocaleLowerCase()
  .replace(/[\s\p{P}\p{S}]+/gu,' ').trim()).filter(Boolean);
}
function catalogIds(tab,show){
 if(!tab)return [];
 const season=seasonKey(tab);
 const entries=animeIndex.seasons?.[season]||[];
 const names=new Set(comparableTitles(show));
 return entries.filter(e=>[e.romaji,e.english].some(name=>comparableTitles({title:name}).some(value=>names.has(value))))
  .map(e=>String(e.mal||'').match(/^https:\/\/myanimelist\.net\/anime\/(\d+)/)?.[1])
  .filter(Boolean);
}
function withoutCarryovers(items,previous,tab,priorTab){
 const oldTitles=new Set(previous.flatMap(comparableTitles));
 const oldIds=new Set(previous.flatMap(show=>catalogIds(priorTab,show)));
 return items.filter(item=>{
  if(comparableTitles(item).some(name=>oldTitles.has(name)))return false;
  return !catalogIds(tab,item).some(id=>oldIds.has(id));
 });
}
async function prepareShows(tab){
 const oldTab=previousTab(tab);
 const [items,previous]=await Promise.all([
  sheetRows(tab.gid).then(parseSeasonRows),
  oldTab?sheetRows(oldTab.gid).then(rows=>parseSeasonRows(rows,false)).catch(error=>{
   console.warn('Previous season list unavailable:',error);
   return null;
  }):Promise.resolve(null)
 ]);
 // without the previous season's list nothing is hidden: that isn't proof a show is new or old
 const eligible=previous?withoutCarryovers(items,previous,tab,oldTab):items;
 const excluded=items.length-eligible.length;
 if(previous)checkedNewTitles.set(tab.gid,new Set(eligible.map(item=>item.key)));
 else checkedNewTitles.delete(tab.gid);
 carryoverNotice=previous===null?'vorherige Season nicht abgeglichen':
  excluded?excluded+' aus '+oldTab.name+' ausgeblendet':'';
 return eligible.map((show,i)=>({...show,order:i+1}));
}
function detailsFor(show){
 const data=seasonIndex.seasons?.[seasonKey(current)] || {};
 return data.trailers?.[show.key] || null;
}
// The playlist still contains ONE canonical video per show. Alternate videos
// are verified options for viewers, not additional playlist entries.
function trailerCandidates(show){
 const entry=detailsFor(show);
 if(carryoverStatus(show)!==false || !entry || entry.sequelStatus==='sequel')return [];
 const all=[entry,...(Array.isArray(entry.candidates)?entry.candidates:[])];
 const seen=new Set();
 const videos=all.flatMap(item=>{
  const video=verifiedTrailer(item);
  const availability=seasonIndex.seasons?.[seasonKey(current)]?.videoStatus?.[video?.id];
  if(!video||availability?.available===false||seen.has(video.id))return [];
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
function voteValue(show,person){
 const vote=show.votes.find(v=>v.name===person)?.value||'';
 return !vote||vote.toLowerCase()==='default'?'Default':vote;
}
function validChoices(person){
 return PV_OPTIONS.filter(option=>option!=='Okinawa 3'||['quecks','rei','terra'].includes(person.toLowerCase()));
}
function currentVoter(){return pv('previewPerson').value||member?.person||'';}
// A shared code unlocks group voting, without pretending to identify individual voters.
// Keep the code in session storage, not in public scripts or URLs.
function storedGroupCode(){
 try{return sessionStorage.getItem('previewGroupCode')||'';}catch{return '';}
}
// the name chosen here before, else the person from the schedule's Solo view
function selectedGroupPerson(){
 try{return localStorage.getItem('previewVotePerson')||localStorage.getItem('ownPerson')||localStorage.getItem('soloPerson')||'';}catch{return '';}
}
function updateMemberUI(){
 const info=pv('previewVotingInfo'),selector=pv('previewPerson'),label=pv('previewPersonLabel');
 const form=pv('previewAccessForm'),lock=pv('previewLock');
 // open voting (no group code on the service) or unlocked with the code
 const unlocked=!!member;
 const previous=selector.value||selectedGroupPerson();
 const available=unlocked?people:[];
 selector.replaceChildren(...available.map(p=>new Option(p,p)));
 if(available.includes(previous))selector.value=previous;
 else if(available.length)selector.value=available[0];
 label.hidden=selector.hidden=!available.length;
 form.hidden=!voteApi||unlocked;
 lock.hidden=!unlocked||!groupCode;
 const filter=pv('previewVoteFilter');
 filter.hidden=!unlocked;
 if(!unlocked)pv('previewVoteFilter').value='all';
 // without the voting service there is nothing to show: votes still go into the Google Sheet directly
 pv('previewMember').hidden=!voteApi;
 info.textContent='';
 if(memberError&&!unlocked)info.textContent=memberError;
}
async function checkGroupAccess(code){
 const response=await fetch(voteApi+'/access',{headers:{'X-Group-Code':code},cache:'no-store'});
 if(!response.ok)throw Error(response.status===401?'Gruppencode ungültig.':response.status===503?'Gruppenzugang noch nicht eingerichtet.':'Verbindung fehlgeschlagen (HTTP '+response.status+').');
 return true;
}
async function configureVoting(){
 const settings=await config();
 voteApi=typeof settings.previewVotesUrl==='string' && /^https:\/\//.test(settings.previewVotesUrl)?
  settings.previewVotesUrl.replace(/\/$/,''):'';
 groupCode=voteApi?storedGroupCode():'';
 member=null;memberError='';
 if(voteApi){
  // first without a code: if the service has none, voting is open right away
  try{await checkGroupAccess(groupCode);member={account:'Gruppe'};}
  catch(error){
   if(groupCode){groupCode='';try{sessionStorage.removeItem('previewGroupCode');}catch{}memberError=error.message;}
  }
 }
 updateMemberUI();
 if(current)render();
}
function votingControls(show){
 if(!member)return '';
 const person=currentVoter();
 if(!person)return '';
 // while saving, the clicked choice shows at once and the control only dims: its size never changes
 const disabled=saving.has(show.key),picked=disabled&&pendingVotes.has(show.key)?pendingVotes.get(show.key):voteValue(show,person);
 const feedback=voteFeedback.get(voteFeedbackKey(current.gid,show.key,person));
 const allChoices=validChoices(person),quick=['Ja','Vielleicht','Nein'];
 const button=(choice,label=choice)=>'<button type="button" class="'+(picked===choice?'on':'')+'" data-vote="'+safeText(choice)+'" data-anime="'+safeText(show.key)+'" aria-pressed="'+(picked===choice)+'"'+(disabled?' disabled':'')+'>'+safeText(label)+'</button>';
 const more=allChoices.filter(c=>!quick.includes(c));
 const moreOn=more.includes(picked);
 const error=!disabled&&feedback?.error;
 const status=disabled?'Wird gespeichert':error?feedback.message:picked==='Default'?'Noch offen':picked;
 return '<div class="preview-vote'+(disabled?' saving':'')+(error?' error':'')+'" role="group" title="'+(error?safeText(feedback.message):'')+'" aria-label="Stimme von '+safeText(person)+' für '+safeText(show.english||show.title)+': '+safeText(status)+'">'+
  quick.filter(c=>allChoices.includes(c)).map(c=>button(c)).join('')+
  '<span class="preview-more"><button type="button" class="'+(moreOn?'on':'')+'" data-more aria-expanded="false" title="Weitere Optionen"'+(disabled?' disabled':'')+'>'+(moreOn?safeText(picked):'…')+'</button><span class="preview-more-menu" hidden>'+more.map(c=>button(c)).join('')+(picked!=='Default'?button('Default','Zurücksetzen'):'')+'</span></span></div>';
}
// the group's votes from the sheet, counted ("3 Ja · 1 Vielleicht"), names on hover
function voteSummary(show){
 const counts=new Map();
 for(const v of show.votes){const value=v.value&&v.value.toLowerCase()!=='default'?v.value:'';if(value)counts.set(value,[...(counts.get(value)||[]),v.name]);}
 // always one line, so a first vote doesn't make the card taller
 if(!counts.size)return '<p class="preview-tally">Noch keine Stimmen</p>';
 const order=['Ja','Vielleicht','Nein'];
 return '<p class="preview-tally">'+[...counts].sort((a,b)=>(order.indexOf(a[0])+1||9)-(order.indexOf(b[0])+1||9)).map(([value,names])=>'<span title="'+safeText(names.join(', '))+'">'+names.length+' '+safeText(value)+'</span>').join(' · ')+'</p>';
}
async function refreshSheet(silent=false){
 if(!current||saving.size)return;
 const gid=current.gid;
 try{
  const latest=await prepareShows(current);
  if(current?.gid!==gid)return;
  shows=latest;
  if(!silent)state('Google Sheets aktualisiert.');
  updateMemberUI();render();
 }catch(error){if(!silent)state('Aktualisierung fehlgeschlagen: '+error.message);}
}
async function saveVote(show,choice){
 if(!member||!voteApi||saving.has(show.key))return;
 const person=currentVoter();
 if(!validChoices(person).includes(choice)&&choice!=='Default')return;
 const old=voteValue(show,person),gid=current.gid;
 if(old===choice)return;
 const feedbackKey=voteFeedbackKey(gid,show.key,person);
 voteFeedback.delete(feedbackKey);
 saving.add(show.key);pendingVotes.set(show.key,choice);render();
 let conflict=false;
 try{
  const response=await fetch(voteApi+'/vote',{
   method:'POST',headers:{'Content-Type':'application/json','X-Group-Code':groupCode},
   body:JSON.stringify({gid,title:show.title,person,choice,expected:old})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){conflict=response.status===409;if(response.status===401){groupCode='';member=null;try{sessionStorage.removeItem('previewGroupCode');}catch{}updateMemberUI();}throw new Error(data.error||('Speichern fehlgeschlagen (HTTP '+response.status+')'));}
  if(current?.gid===gid){
   const existing=show.votes.find(v=>v.name===person);
   if(existing)existing.value=choice;else show.votes.push({name:person,value:choice});
  }
  voteFeedback.set(feedbackKey,{success:true,message:choice==='Default'?'Stimme zurückgesetzt.':'Stimme gespeichert.'});
  state(''); // the highlighted button on the card shows it; no box that pushes the list down
 }catch(error){
  voteFeedback.set(feedbackKey,{error:true,message:'Nicht gespeichert: '+error.message});
  state('Nicht gespeichert: '+error.message+' · Bitte erneut versuchen.');
 }
 finally{
  saving.delete(show.key);pendingVotes.delete(show.key);
  render();
  if(conflict&&current?.gid===gid){
   await refreshSheet(true);
   voteFeedback.set(feedbackKey,{error:true,message:'Zwischenzeitlich geändert. Bitte erneut abstimmen.'});
   render();
   state('Die Stimme wurde in Google Sheets inzwischen geändert. Neuester Stand geladen – bitte erneut wählen.');
  }
 }
}
pv('previewList').addEventListener('submit',event=>{
 const form=event.target.closest('form[data-external-anime]');
 if(!form)return;
 event.preventDefault();
 const show=shows.find(s=>s.key===form.dataset.externalAnime);
 if(!show||carryoverStatus(show)===true||detailsFor(show)?.sequelStatus==='sequel'||trailerFor(show))return;
 const link=externalUrl(form.querySelector('input[name="externalTrailer"]')?.value);
 if(!link){state('Bitte einen gültigen HTTPS-Link zu einem echten Trailer angeben.');return;}
 try{localStorage.setItem(externalKey(show),link);}
 catch{state('Der Browser konnte den Link nicht speichern.');return;}
 state('Dein alternativer Trailer-Link wurde für '+show.title+' gespeichert.');
 render();
});
pv('previewList').addEventListener('click',event=>{
 // "…": the special vote options in a small menu; any other click closes open menus
 const more=event.target.closest('button[data-more]');
 for(const menu of pv('previewList').querySelectorAll('.preview-more-menu:not([hidden])'))if(menu.previousElementSibling!==more){menu.hidden=true;menu.previousElementSibling.setAttribute('aria-expanded','false');}
 if(more){const menu=more.nextElementSibling;menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));return;}
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
pv('previewPerson').addEventListener('change',()=>{
 try{localStorage.setItem('previewVotePerson',pv('previewPerson').value);}catch{}
 render();
});
pv('previewAccessForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!voteApi)return;
 const form=pv('previewAccessForm'),code=pv('previewGroupCode').value.trim();
 const button=form.querySelector('button[type="submit"]');
 if(!code||button.disabled)return;
 button.disabled=true;
 memberError='';
 try{
  await checkGroupAccess(code);
  groupCode=code;
  member={account:'Gruppe'};
  try{sessionStorage.setItem('previewGroupCode',code);}catch{}
  pv('previewGroupCode').value='';
  state('Gruppenabstimmung freigeschaltet.');
 }catch(error){memberError=error.message;state('Nicht freigeschaltet: '+error.message);}
 finally{button.disabled=false;updateMemberUI();if(current)render();}
});
pv('previewLock').addEventListener('click',()=>{
 if(saving.size)return;
 groupCode='';member=null;voteFeedback.clear();
 try{sessionStorage.removeItem('previewGroupCode');}catch{}
 updateMemberUI();if(current)render();
 state('Gruppenzugang für diese Browser-Sitzung geschlossen.');
});
pv('previewVoteFilter').addEventListener('change',()=>{if(current)render();});
pv('previewRefresh').addEventListener('click',()=>refreshSheet(false));
function render(){
 const q=clean(pv('previewSearch').value).toLocaleLowerCase();
 const voter=member?currentVoter():'';
 const voteFilter=voter?pv('previewVoteFilter').value:'all';
 const data=seasonIndex.seasons?.[seasonKey(current)]||{}, trailers=shows.filter(x=>trailerFor(x)).length;
 pv('previewTitle').textContent=current?.name||'Season Preview';
 // sequels get no trailer on purpose; the rest without one is what is really missing
 const sequels=shows.filter(s=>!trailerFor(s)&&(detailsFor(s)?.sequelStatus==='sequel')).length;
 // one line: counts, carry-overs, and a "?" with how the trailers are picked
 const missing=shows.length-trailers-sequels;
 pv('previewIntro').innerHTML=[shows.length+' Serien',trailers+' Trailer',sequels+' Sequels',...(missing?['<span title="Neue Serien, für die noch kein passender Trailer gefunden wurde">'+missing+' fehlend</span>']:[]),...(carryoverNotice?[safeText(carryoverNotice)]:[])].join(' · ')+
  ' <button type="button" class="preview-help" title="'+safeText(INFO)+'" aria-label="So werden die Trailer gewählt">?</button>';
 // voting progress for the chosen name
 const open=voter?shows.filter(x=>voteValue(x,voter)==='Default').length:0;
 pv('previewOpen').hidden=!voter;
 pv('previewOpen').textContent=open?'noch '+open+' offen':'alles abgestimmt ✓';
 const playlistId=clean(data.youtubePlaylistId),playlist=pv('previewPlaylist');
 playlist.hidden=!/^[\w-]{10,}$/.test(playlistId);
 if(!playlist.hidden)playlist.href='https://www.youtube.com/playlist?list='+encodeURIComponent(playlistId);
 let ghKey='';try{ghKey=localStorage.getItem('movesKey')||'';}catch{}
 pv('previewTrailerRefresh').hidden=playlist.hidden||!ghKey;
 drawStarts();
 const inWeek=s=>!startFilter||(startFilter==='none'?!s.start:!!s.start&&weekKey(s.start)===startFilter);
 const shown=shows.filter(s=>inWeek(s)&&(!q||(s.title+' '+s.english).toLocaleLowerCase().includes(q))&&
  (voteFilter==='all'||(voteFilter==='open')===(voteValue(s,voter)==='Default')));
 const hasFilter=!!q||voteFilter!=='all'||!!startFilter;
 pv('previewResults').textContent=hasFilter?shown.length+' von '+shows.length+' Serien angezeigt':'';pv('previewResults').parentElement.hidden=!hasFilter;
 pv('previewClear').hidden=!hasFilter;
 const parent=pv('previewList');parent.replaceChildren();
 if(!shown.length){const empty=document.createElement('p');empty.className='preview-empty';empty.textContent=hasFilter?'Keine passenden Serien. Suche oder Filter zurücksetzen.':'Keine Serien in dieser Season gefunden.';parent.append(empty);return;}
 for(const s of shown){
  // compact card: number, title (romaji below), and why a show has no trailer
  const trailer=pickedTrailer(s),mal=malLink(s),article=document.createElement('article');article.className='preview-item'+(voter&&voteValue(s,voter)==='Default'?' open':'');
  const sequel=detailsFor(s)?.sequelStatus==='sequel';
  // the trailers are streamed as one playlist; a card only notes when a show has none
  // above the title, so the vote buttons line up on every card
  const start=s.start?'ab '+shortDate(s.start,{weekday:'short',day:'numeric',month:'short'}):'';
  const note=trailer&&!start?'':'<span class="preview-none">'+[trailer?'':(sequel?'Sequel':'Noch kein Trailer'),start].filter(Boolean).join(' · ')+'</span>';
  const cover=covers.get(s.key);
  article.innerHTML=(cover?'<div class="preview-order has-cover"><img src="'+safeText(cover)+'" alt="" loading="lazy"><span>'+s.order+'</span></div>':'<div class="preview-order">'+s.order+'</div>')+'<div>'+note+'<h2><a class="preview-title-link" href="'+safeText(mal.url)+'" target="_blank" rel="noopener noreferrer" title="'+(mal.label==='MyAnimeList'?'MyAnimeList-Seite öffnen':'Auf MyAnimeList nach diesem Anime suchen')+'">'+safeText(s.english||s.title)+'</a></h2>'+(s.english&&s.english!==s.title?'<p class="preview-eng">'+safeText(s.title)+'</p>':'')+voteSummary(s)+'</div><div class="preview-side">'+votingControls(s)+'</div>';
  parent.append(article);
 }
}
async function selectSeason(gid){
 const next=seasonTabs.find(t=>t.gid===gid);if(!next)return;
 current=next;
 startFilter='';
 const request=++seasonRequest;
 state('Lade '+next.name+' …');
 try{
  const latest=await prepareShows(next);
  if(request!==seasonRequest||current?.gid!==gid)return;
  shows=latest;
  state('');
  updateMemberUI();
  render();
  loadCovers(next,latest).then(()=>{if(current?.gid===gid)render();});
 }catch(e){
  if(request!==seasonRequest)return;
  shows=[];pv('previewList').replaceChildren();
  state('Season konnte nicht geladen werden: '+e.message);
 }
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
pv('previewStarts').addEventListener('click',e=>{
 const b=e.target.closest('[data-start-week]');if(!b||!current)return;
 startFilter=startFilter===b.dataset.startWeek?'':b.dataset.startWeek;render();
});
pv('previewClear').addEventListener('click',()=>{
 pv('previewSearch').value='';
 pv('previewVoteFilter').value='all';
 startFilter='';
 if(current)render();
 pv('previewSearch').focus();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSheet(true);});
setInterval(()=>{if(!document.hidden)refreshSheet(true);},90000);
start();

// "Trailer neu suchen" (only with the site's GitHub key): writing .github/trailer-refresh.txt starts the
// trailer workflow with refresh (the key may change files, not start workflows directly)
pv('previewTrailerRefresh').addEventListener('click',async()=>{
 const button=pv('previewTrailerRefresh');let key='';try{key=localStorage.getItem('movesKey')||'';}catch{}
 if(!key)return;
 const api='https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/.github/trailer-refresh.txt';
 const headers={Authorization:'Bearer '+key,Accept:'application/vnd.github+json'};
 button.disabled=true;
 try{
  const old=await fetch(api+'?ref=main&_='+Date.now(),{headers,cache:'no-store'});
  const sha=old.ok?(await old.json()).sha:undefined;
  const res=await fetch(api,{method:'PUT',headers,body:JSON.stringify({message:'Search trailers again',branch:'main',content:btoa(new Date().toISOString()+'\n'),...(sha&&{sha})})});
  if(!res.ok)throw new Error('GitHub '+res.status);
  state('Trailer werden neu gesucht. Die Playlist ist in ein paar Minuten aktuell.');
 }catch(error){state('Trailer-Suche konnte nicht gestartet werden: '+error.message);button.disabled=false;}
});
