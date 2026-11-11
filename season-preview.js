'use strict';
const PV_OPTIONS = ['Ja','Nein','Vielleicht','Demons','Allein','Default','Wenn Belly dabei ist','Okinawa 3'];
const PV_SEASONS = /^(Winter|Frühling|Sommer|Herbst)\s+(20\d{2})$/i;
const PV_MONTHS = {winter:0,'frühling':3,sommer:6,herbst:9};
const pv = id => document.getElementById(id);
const clean = s => String(s || '').trim();
const safeText = s => clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seasonTabs = [], seasonIndex = {seasons:{}}, current = null, shows = [];
function state(msg) {pv('previewStatus').textContent=msg;}
function seasonKey(tab){const m=tab.name.match(PV_SEASONS);return m ? m[1].toLowerCase()+'-'+m[2] : '';}
function parseSeasonRows(rows){
  const h = rows.findIndex(r=>r.some(c=>clean(c)==='Anime Titel'));
  if(h<0)throw Error('Die Season-Liste enthält keine Spalte „Anime Titel“.');
  const cols=rows[h].map(clean), title=cols.indexOf('Anime Titel'), english=cols.indexOf('Eng Anime Titel');
  const reserved=new Set(['Anime Titel','Eng Anime Titel','Wo','Tag','Uhrzeit','Startdatum','Sort','Slot','Genre','Studio','Staffel','Episode','Folgen']);
  const firstPerson=cols.indexOf('Uhrzeit')+1;
  const voters=cols.map((name,i)=>({name,i})).filter(x=>x.i>=firstPerson&&x.name&&!reserved.has(x.name));
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
function verifiedTrailer(entry) {
 if(!entry || entry.type!=='full_trailer' || entry.verified!==true)return null;
 const id=clean(entry.youtubeId);
 return /^[a-zA-Z0-9_-]{11}$/.test(id) ? {id,subtitles:entry.subtitles==='de'?'DE':entry.subtitles==='en'?'EN':null}:null;
}
function detailsFor(show){
 const data=seasonIndex.seasons?.[seasonKey(current)] || {};
 return data.trailers?.[show.key] || null;
}
function render(){
 const q=clean(pv('previewSearch').value).toLocaleLowerCase(),filter=pv('previewFilter').value;
 const data=seasonIndex.seasons?.[seasonKey(current)]||{}, trailers=shows.filter(x=>verifiedTrailer(detailsFor(x))).length;
 pv('previewTitle').textContent=current?.name||'Season Preview';
 pv('previewIntro').textContent='Reihenfolge aus der Google-Sheets-Season-Liste · '+shows.length+' Serien';
 pv('previewStats').hidden=false;
 pv('previewStats').innerHTML='<span class="preview-stat"><b>'+shows.length+'</b> Serien</span><span class="preview-stat"><b>'+trailers+'</b> geprüfte Trailer</span><span class="preview-stat"><b>'+(shows.length-trailers)+'</b> noch offen</span>';
 const playlistId=clean(data.youtubePlaylistId),playlist=pv('previewPlaylist');
 playlist.hidden=!/^[\w-]{20,}$/.test(playlistId);
 if(!playlist.hidden)playlist.href='https://www.youtube.com/playlist?list='+encodeURIComponent(playlistId);
 const shown=shows.filter(s=>(!q||(s.title+' '+s.english).toLocaleLowerCase().includes(q))&&(filter==='all'||(filter==='ready')===!!verifiedTrailer(detailsFor(s))));
 const parent=pv('previewList');parent.replaceChildren();
 if(!shown.length){const empty=document.createElement('p');empty.className='preview-empty';empty.textContent='Keine passenden Serien gefunden.';parent.append(empty);return;}
 for(const s of shown){
  const trailer=verifiedTrailer(detailsFor(s)),article=document.createElement('article');article.className='preview-item';
  const links=trailer?'<a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/watch?v='+trailer.id+'">▶ Vollständigen Trailer ansehen</a>':'';
  const votes=s.votes.length?s.votes.map(v=>'<span>'+safeText(v.name)+': '+safeText(v.value)+'</span>').join(''):'<span>Noch keine Einträge</span>';
  article.innerHTML='<div class="preview-order">'+s.order+'</div><div><h2>'+safeText(s.title)+'</h2>'+(s.english&&s.english!==s.title?'<p class="preview-eng">'+safeText(s.english)+'</p>':'')+
  '<div class="preview-meta"><span class="preview-chip '+(trailer?'ready':'')+'">'+(trailer?'Vollständiger Trailer verfügbar':'Trailer noch nicht bestätigt')+'</span>'+(trailer&&trailer.subtitles?'<span class="preview-chip">Untertitel: '+trailer.subtitles+'</span>':'')+'</div>'+
  '<div class="preview-links">'+links+'<a target="_blank" rel="noopener noreferrer" href="https://www.livechart.me/">LiveChart öffnen</a></div>'+
  '<div class="preview-votes"><div class="preview-vote-title">Gruppen-Entscheidung · aus Google Sheets</div><div class="preview-vote-chips">'+votes+'</div><p class="preview-vote-note">Bearbeiten nur mit verifiziertem Gruppenzugang (noch nicht aktiviert).</p></div></div>';
  parent.append(article);
 }
}
async function selectSeason(gid){
 current=seasonTabs.find(t=>t.gid===gid);if(!current)return;
 state('Lade '+current.name+' …');
 try{
  const rows=await sheetRows(current.gid);
  shows=parseSeasonRows(rows);
  state('Live aus der Season-Liste · Abstimmungen derzeit nur lesbar.');
  render();
 }catch(e){shows=[];pv('previewList').replaceChildren();pv('previewStats').hidden=true;state('Season konnte nicht geladen werden: '+e.message);}
}
async function start(){
 try{
  const [tabs,metadata]=await Promise.all([listSeasonTabs(),fetch('season-trailers.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{seasons:{}}).catch(()=>({seasons:{}}))]);
  seasonTabs=tabs;seasonIndex=metadata&&typeof metadata==='object'?metadata:{seasons:{}};
  const sel=pv('previewSeason');
  if(!tabs.length){state('Noch keine eigenständige Season-Liste gefunden. Sobald z. B. „Winter 2027“ im Google Sheet angelegt wird, erscheint sie hier.');return;}
  for(const t of tabs){const opt=document.createElement('option');opt.value=t.gid;opt.textContent=t.name;sel.append(opt);}
  const future=tabs.filter(t=>{const m=t.name.match(PV_SEASONS);return m&&(+m[2]*12+PV_MONTHS[m[1].toLowerCase()])>=(new Date().getFullYear()*12+new Date().getMonth());});
  const chosen=future.length?future.at(-1):tabs[0];sel.value=chosen.gid;await selectSeason(chosen.gid);
  sel.addEventListener('change',()=>selectSeason(sel.value));
 }catch(e){state('Season-Listen sind gerade nicht verfügbar: '+e.message);}
}
pv('previewSearch').addEventListener('input',()=>{if(current)render();});
pv('previewFilter').addEventListener('change',()=>{if(current)render();});
start();
