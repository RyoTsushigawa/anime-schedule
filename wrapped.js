// A separate read-only recap, so Wrapped never gets in the way of the schedule.
// Jahres-Wrapped: besides the seasons, one entry per year ("year:2026") with that year's season tabs
let wrappedYears = [];
const wrappedTab = value => wrappedYears.find(y => y.gid === value) || wrappedTabs.find(t => t.gid === value);
// a year reads "Jahr" where a season reads "Season" (with the right article)
const WRAPPED_YEAR_WORDS = [['Eure Season.', 'Euer Jahr.'], ['Deine Season.', 'Dein Jahr.'], ['eure gemeinsame Season', 'euer gemeinsames Jahr'],
  ['deine Season', 'dein Jahr'], ['eurer Season', 'eurem Jahr'], ['deiner Season', 'deinem Jahr'], ['letzte Season', 'letztes Jahr'],
  ['dieser Season', 'diesem Jahr'], ['diese Season', 'dieses Jahr'], ['der gewählten Season', 'dem gewählten Jahr'], ['Momentaufnahme der Season', 'Momentaufnahme des Jahres']];
const wrappedYearText = text => WRAPPED_YEAR_WORDS.reduce((t, [a, b]) => t.split(a).join(b), String(text ?? ''));
let wrappedTabs = [], wrappedPlan = null, wrappedRecords = [], wrappedProfiles = {}, wrappedAccounts = [];
let wrappedTabNote = '', wrappedPlanNote = '';
let wrappedCards = [], wrappedIndex = 0, wrappedGeneration = 0, wrappedLoadGeneration = 0;
try { wrappedProfiles = JSON.parse(localStorage.getItem('wrappedProfiles') || '{}') || {}; } catch {}
for (const storage of ['anilistAccounts','malAccounts']) {
  try { wrappedAccounts.push(...JSON.parse(localStorage.getItem(storage) || '[]')); } catch {}
}
wrappedAccounts = wrappedAccounts.filter(a => a?.name && (!a.expires || a.expires > Date.now()));
// Shared defaults contain only identities explicitly supplied by the group owner.
if (!wrappedProfiles.MaRyo) wrappedProfiles.MaRyo = [{provider:'anilist',name:'RyoTsushigawa'},{provider:'anilist',name:'MilkyWay95'}];
const wrappedSafe = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wrappedTitle = show => show.english || show.romaji;
const wrappedHours = minutes => new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(minutes/60);
const wrappedMetrics = items => `<div class="metrics">${items.map(([n,label])=>`<div class="metric"><b>${wrappedSafe(n)}</b><span>${wrappedSafe(label)}</span></div>`).join('')}</div>`;
const wrappedRank = items => `<ol class="rank">${items.map(([label,n],i)=>`<li><small>${String(i+1).padStart(2,'0')}</small><span>${wrappedSafe(label)}</span><b>${wrappedSafe(n)}</b></li>`).join('')}</ol>`;
const wrappedAccountKey = a => `${a.provider || 'anilist'}:${String(a.name).toLowerCase()}`;
const wrappedQuery = `query ($user:String) { MediaListCollection(userName:$user,type:ANIME) {
  lists { entries { status progress score:score(format:POINT_100) completedAt { year month day }
    media { id idMal episodes duration genres season seasonYear title { romaji english } } } }
} }`;
async function wrappedReadProfiles() {
  try {
    const response=await fetch('wrapped-profiles.json',{cache:'no-cache'});if(!response.ok)return;
    const data=await response.json(), defaults={};
    for(const [person,profiles] of Object.entries(data)){
      if(['__proto__','constructor','prototype'].includes(person)||!Array.isArray(profiles))continue;
      const valid=profiles.filter(p=>p?.provider==='anilist'&&/^[-\w]{1,50}$/.test(p.name));
      if(valid.length)defaults[person]=valid.map(p=>({provider:p.provider,name:p.name}));
    }
    let local={};try{local=JSON.parse(localStorage.getItem('wrappedProfiles')||'{}')||{};}catch{}
    // Upgrade the old single-account default once, without undoing later personal choices.
    const version='group-map-2026-11';
    if(localStorage.getItem('wrappedProfileMappingVersion')!==version){
      const old=local.MaRyo;
      if(defaults.MaRyo&&old?.length===1&&old[0].provider==='anilist'&&old[0].name.toLowerCase()==='ryotsushigawa'){
        delete local.MaRyo;localStorage.setItem('wrappedProfiles',JSON.stringify(local));
      }
      localStorage.setItem('wrappedProfileMappingVersion',version);
    }
    wrappedProfiles={...defaults,...local};
  }catch{} // Previously linked/local identities remain usable offline.
}
async function wrappedSheetApi(path) {
  const {sheetsKey}=await config();if(!sheetsKey)throw new Error('kein Sheets-API-Schlüssel');
  const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+path+(path.includes('?')?'&':'?')+'key='+encodeURIComponent(sheetsKey),{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Sheets-API antwortet '+response.status);
  return response.json();
}
async function wrappedReadTabs() {
  const cacheKey='wrappedTabs:'+SHEET_ID;wrappedTabNote='';
  try {
    const data=await wrappedSheetApi('?fields=sheets(properties(sheetId,title))');
    const all=new Map(data.sheets.map(s=>[s.properties.title,String(s.properties.sheetId)]));
    const tabs=[];
    for(const [name,gid] of all){
      const m=name.match(/^Guckplan\s+(\S+)\s+(\d{4})/i),month=m&&SEASON_MONTH[m[1].toLowerCase()];
      if(month===undefined||month===null)continue;
      tabs.push({name,gid,start:new Date(+m[2],month,1).getTime(),catalogGid:all.get(name.replace(/^Guckplan\s+/,''))});
    }
    if(!tabs.length)throw new Error('keine Guckplan-Tabs');
    tabs.sort((a,b)=>b.start-a.start);try{localStorage.setItem(cacheKey,JSON.stringify(tabs));}catch{}return tabs;
  }catch{}
  try {
    const tabs=await guckplanTabs();if(!tabs.length)throw new Error('keine Guckplan-Tabs');
    try{localStorage.setItem(cacheKey,JSON.stringify(tabs));}catch{}return tabs;
  }catch(error){
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(!cached&&SHEET_ID==='1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ')cached=JSON.parse(localStorage.getItem('tabs')||'null');
    }catch{}
    if(Array.isArray(cached)&&cached.length){wrappedTabNote='Season-Auswahl aus der gespeicherten Kopie.';return cached;}
    throw new Error('Die Season-Auswahl konnte nicht geladen werden. Bitte neu laden.');
  }
}
async function wrappedReadPlan(tab) {
  const key='wrappedPlan:'+SHEET_ID+':'+tab.gid+':'+(tab.catalogGid||'');wrappedPlanNote='';
  const remember=plan=>{try{localStorage.setItem(key,JSON.stringify({time:Date.now(),plan}));}catch{}return plan;};
  try{
    const range=name=>'/values/'+encodeURIComponent("'"+name.replace(/'/g,"''")+"'!A1:AZ300");
    const [data,hidden,colors,catalog]=await Promise.all([
      wrappedSheetApi(range(tab.name)),hiddenRows(tab),headerColors(tab).catch(()=>({})),
      tab.catalogGid?wrappedSheetApi(range(tab.name.replace(/^Guckplan\s+/,''))).catch(()=>null):null
    ]);
    if(!Array.isArray(data.values))throw new Error('keine Tabellenwerte');
    const plan=sheetFromRows(data.values,hidden);plan.colors=colors;
    plan.catalog=catalog?.values?sheetFromRows(catalog.values).shows:[];
    return remember(plan);
  }catch{}
  try{return remember(await loadPlan(tab,true));}catch(error){
    let snapshot=null;
    try{snapshot=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    if(snapshot?.plan?.people&&snapshot.plan.shows){wrappedPlanNote='Gespeicherter Guckplan vom '+new Date(snapshot.time).toLocaleString('de-DE')+'.';return snapshot.plan;}
    let saved=null;
    if(SHEET_ID==='1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ')try{saved=JSON.parse(localStorage.getItem('sheet:'+tab.gid+':'+(tab.catalogGid||''))||'null');}catch{}
    if(saved?.people&&saved.shows){wrappedPlanNote='Guckplan wie zuletzt im Zeitplan gespeichert; Live-Daten nicht erreichbar.';return saved;}
    throw error;
  }
}
async function wrappedList(profile, fresh) {
  const key='wrappedList2:'+wrappedAccountKey(profile);   // 2: with each show's season (watch time)
  let cached=null;
  try { cached=JSON.parse(localStorage.getItem(key)); } catch {}
  if (!fresh && cached && Date.now()-cached.time<3600000) return {...cached,stale:false};
  try {
    let entries;
    if (profile.provider==='mal') {
      const account=wrappedAccounts.find(a=>a.provider==='mal'&&a.name===profile.name);
      if (!account) throw new Error('MAL-Konto in diesem Browser nicht verbunden');
      const result=await MAL.list(account,!!fresh);
      if (result.stale) throw new Error('MyAnimeList nicht erreichbar');
      entries=result.entries.map(e=>({...e,score:e.score*10}));
    } else {
      const data=await anilist(wrappedQuery,{user:profile.name},undefined,{retries:0,timeout:12000});
      // Custom AniList lists can contain the same entry more than once.
      entries=[...new Map(data.MediaListCollection.lists.flatMap(l=>l.entries).map(e=>[e.media.id,e])).values()];
    }
    const snapshot={time:Date.now(),entries};
    try { localStorage.setItem(key,JSON.stringify(snapshot)); } catch {}
    return {...snapshot,stale:false};
  } catch(error) {
    if (cached) return {...cached,stale:true};
    throw error;
  }
}
// A playful food translation of seasonal plans and, when available, favourite genres.
// These are fictional Subway-style orders, never real menu availability claims.
function wrappedFoodTaste(stats, genre='') {
 const g=String(genre).toLowerCase();
 const options=[
  [/action|adventure|sports/,'gegartes Hähnchen','Chili-Joghurt-Sauce'],
  [/fantasy|supernatural|sci-fi|mystery/,'Falafel','Kräuter-Joghurt-Sauce'],
  [/romance|drama/,'Mozzarella','Basilikum-Pesto'],
  [/comedy|slice of life/,'Hummus','milde Joghurt-Sauce'],
  [/thriller|horror|psychological/,'gegartes Hähnchen','rauchige BBQ-Sauce']
 ];
 const match=options.find(o=>o[0].test(g));
 const late=stats.night?.minutes>=1320;
 const selected=match||options[late?4:stats.parallel?1:stats.exclusive.length?2:3];
 const title=late?'Night-Owl Sub':stats.parallel?'Multiverse Sub':stats.exclusive.length?'Hidden-Gem Sub':'Season-Favoriten Sub';
 return {title,bread:stats.shows>=12?'Vollkornbrot':'Italian-Brot',
  protein:selected[1],sauce:selected[2],cheese:stats.exclusive.length?'Cheddar':'Gouda',
  vegetables:stats.parallel?'Salat, Tomaten und rote Zwiebeln':'Salat, Gurke und Tomaten',
  why:match?'Häufigstes Genre der Season-Abschlüsse: '+genre+'.':late?'Ein später Start im Plan sorgt für kräftige Würze.':stats.parallel?'Parallele Serien bringen Abwechslung.':stats.exclusive.length?'Eure Geheimtipps geben dem Sub seinen Charakter.':'Eine gemütliche Mischung aus dem Guckplan.'};
}
function wrappedFoodCards(stats,genre,season,name) {
 const f=wrappedFoodTaste(stats,genre);
 const fillings=f.protein+', '+f.cheese+', '+f.vegetables;
 return [{
  kicker:season+' · Anime trifft Sandwich',title:'Dein Anime-Geschmack als Sub: '+f.title,color:'#ffc764',
  html:'<p><b>Brot:</b> '+wrappedSafe(f.bread)+'</p><p><b>Belag:</b> '+wrappedSafe(fillings)+'</p><p><b>Sauce:</b> '+wrappedSafe(f.sauce)+'</p><p>'+wrappedSafe(f.why)+'</p>',
  note:'Spielerischer Subway-inspirierter Vorschlag für '+name+'. Keine offizielle Bestellung oder Garantie für ein erhältliches Menü.'
 },{
  kicker:season+' · Anime Wrap für zu Hause',title:'Mach den '+f.title+' als Wrap!',color:'#94dce0',
  html:'<p><b>Zutaten für 1 Wrap:</b> 1 große Tortilla, ca. 100 g '+wrappedSafe(f.protein)+', '+wrappedSafe(f.vegetables)+', 2 EL '+wrappedSafe(f.cheese)+', 1–2 EL '+wrappedSafe(f.sauce)+'.</p>'+
   '<p><b>1.</b> Belag vorbereiten: Gemüse waschen und schneiden; Hähnchen vollständig durchgaren oder Falafel nach Packungsangabe erwärmen.</p>'+
   '<p><b>2.</b> Tortilla kurz erwärmen, Sauce darauf verstreichen und Gemüse, Belag und Käse darauf verteilen.</p>'+
   '<p><b>3.</b> Seiten einklappen, fest einrollen und nach Wunsch kurz in einer Pfanne anrösten.</p>',
  note:'Einfaches selbstgemachtes Rezept, kein offizielles Subway-Produkt. Fertige Falafel oder Hummus funktionieren als Alternative.'
 }];
}
function wrappedShow(index) {
  wrappedIndex=Math.max(0,Math.min(wrappedCards.length-1,index));
  for(const [i,card] of [...$('stories').children].entries()) {
    card.hidden=i!==wrappedIndex;
    card.classList.toggle('story-enter',i===wrappedIndex);
  }
  for(const [i,dot] of [...$('dots').children].entries()) dot.setAttribute('aria-current',String(i===wrappedIndex));
  $('previous').disabled=wrappedIndex===0;
  $('next').disabled=wrappedIndex===wrappedCards.length-1;
}
function wrappedDraw(cards) {
  if(wrappedTab($('season').value)?.parts)cards=cards.map(c=>({...c,kicker:wrappedYearText(c.kicker),title:wrappedYearText(c.title),html:wrappedYearText(c.html),note:wrappedYearText(c.note)}));
  wrappedCards=cards;
  $('stories').innerHTML=cards.map((c,i)=>`<article class="story" style="--card:${c.color};--ink:${c.ink||'#20201c'}" aria-label="${i+1} von ${cards.length}"><p class="kicker">${wrappedSafe(c.kicker)}</p><h2>${wrappedSafe(c.title)}</h2>${c.html}<p class="caption">${wrappedSafe(c.note||'')}</p></article>`).join('');
  $('dots').replaceChildren(...cards.map((c,i)=>{
    const b=document.createElement('button');b.className='dot';b.setAttribute('aria-label',`Karte ${i+1}: ${c.title}`);b.onclick=()=>wrappedShow(i);return b;
  }));
  $('stories').hidden=$('actions').hidden=false;
  wrappedShow(0);
}
async function wrappedRender(fresh=false) {
  if(!wrappedPlan)return;
  const generation=++wrappedGeneration, person=$('person').value, tab=wrappedTab($('season').value);
  const season=tab.name.replace(/^Guckplan\s+/,'');
  const selected=person?[person]:wrappedPlan.people;
  const stats=WrappedStats.plan(wrappedRecords,wrappedPlan.people,person||null);
  const name=person||'Die ganze Gruppe';
  const max=Math.max(1,...stats.days.map(d=>d[1]));
  const shared=!!person&&WrappedStats.shared(person);
  const plural=!person||shared;
  const yours=plural?'eurem':'deinem', you=plural?'ihr':'du';
  const activeDays=stats.days.filter(([,n])=>n>0).length;
  const days={'Mo.':'Montag','Di.':'Dienstag','Mi.':'Mittwoch','Do.':'Donnerstag','Fr.':'Freitag','Sa.':'Samstag','So.':'Sonntag'};
  const biggestDay=days[stats.busiest?.[0]]||'Abend';
  const allowLists=WrappedStats.listsAllowed(tab);
  $('profileButton').hidden=!allowLists;
  $('introHeading').innerHTML=(tab.parts?(plural?'Euer Jahr.':'Dein Jahr.'):(plural?'Eure Season.':'Deine Season.'))+'<br><em>Eine Menge Anime.</em>';
  $('introText').textContent=shared?'MaRyo: zwei Menschen, ein gemeinsamer Guckplan. Hier geht es um eure Auswahl zusammen.':person?'Ein kleiner Rückblick auf deine Auswahl — und die Leute, mit denen sie sich überschneidet.':'Ein kleiner Rückblick auf eure Pläne, gemeinsamen Serien und gut gefüllten Abende.';
  const cards=[{
    kicker:season+' · '+name+(shared?' · euer gemeinsamer Plan':''),
    title:person?(shared?'Zwei Menschen. Ein Guckplan.':'Das war dein Anime-Programm.'):'Da kam einiges zusammen.',color:'#d6ff79',
    html:'<div class="big">'+stats.shows+'</div><p>Serien standen auf '+yours+' Plan. '+(shared?'Eure gemeinsame Auswahl zählt dabei einmal — schließlich teilt ihr euch den Plan.':person?'Von den gemeinsamen Runden bis zu deinen eigenen kleinen Entdeckungen.':'Manche für die große Runde, andere nur für ein paar von euch.')+'</p>'+wrappedMetrics(person?[[wrappedHours(stats.minutes)+' h','geplant pro Woche'],[activeDays,'Tage mit Anime im Plan'],[shared?2:stats.slots,shared?'Menschen, ein Plan':'Slots pro Woche']]:[[wrappedHours(stats.minutes)+' h','geplant pro Woche'],[wrappedPlan.people.length,'Plan-Einträge'],[WrappedStats.peopleCount(wrappedPlan.people),'Menschen · MaRyo zählt zwei']]),
    note:'Aus dem Guckplan, nicht aus gemessener Watchtime. Pro Slot sind 30 Minuten angesetzt; parallele Serien zählen zeitlich einmal.'
  }];
  if(tab.parts){
    // Jahres-Wrapped: shows per season, and the ones that stayed for more than one
    const mineRecords=wrappedRecords.filter(r=>selected.includes(r.person));
    const perSeason=tab.parts.map(t=>t.name.replace(/^Guckplan\s+/,'')).reverse().map(n=>[n,new Set(mineRecords.filter(r=>r.season===n).map(r=>r.key)).size]);
    const seasonsOf=new Map();for(const r of mineRecords)seasonsOf.set(r.key,new Set([...(seasonsOf.get(r.key)||[]),r.season]));
    const stayed=[...seasonsOf.values()].filter(x=>x.size>1).length;
    cards.push({kicker:season+' · Season für Season',title:stayed?(stayed===1?'Eine Serie blieb über mehrere Seasons.':stayed+' Serien blieben über mehrere Seasons.'):'Jede Season ein neues Programm.',color:'#ffc764',
      html:wrappedRank(perSeason.map(([n,c])=>[n,c+' Serien'])),note:'Aus den Guckplänen der Seasons dieses Jahres. Eine Serie, die in mehreren Guckplänen steht, zählt im Jahr einmal.'});
  }
  if(stats.shows)cards.push({kicker:person?(shared?'Eure Woche':'Deine Woche'):'Eure Woche',title:'Am '+biggestDay+' war am meisten geplant.',color:'#c8a6ff',
    html:'<p>'+stats.busiest[1]+' Slots, also ungefähr '+wrappedHours(stats.busiest[1]*30)+' Stunden Anime. '+(stats.busiest[1]>=5?'Da konnte man es sich ruhig etwas länger gemütlich machen.':'Ein guter Anlass, es sich zusammen gemütlich zu machen.')+'</p><div class="bars">'+stats.days.map(([d,n])=>'<div class="bar-item"><b>'+n+'</b><div class="bar-fill" style="--height:'+Math.round(n/max*100)+'px"></div>'+d+'</div>').join('')+'</div>',
    note:'Geplante Slots pro Woche. Das sagt nichts darüber aus, wie viele Folgen tatsächlich geschaut wurden.'});
  if(stats.partner)cards.push({kicker:person?(shared?'Oft an eurer Seite':'Oft an deiner Seite'):'Besonders viel gemeinsam',title:stats.partner[0],color:'#ffb78d',
    html:'<div class="big">'+stats.partner[1]+'</div><p>gemeinsame Serien im Plan. '+(person?'Da gab es einige Gelegenheiten für ein „Schauen wir die zusammen?“':'Diese beiden Pläne lagen oft auf derselben Wellenlänge. Gute Voraussetzungen für gemeinsame Anime-Abende.')+'</p>',note:'Verglichen werden Serien in den Plänen, keine Anwesenheitslisten. MaRyo ist hier ein gemeinsamer Plan für zwei Menschen.'});
  if(stats.popular&&(!person||stats.popular.count>1))cards.push({kicker:person?(shared?'Eure größte Runde':'Deine größte Runde'):'Hier kamen viele zusammen',title:stats.popular.title,color:'#94dce0',
    html:'<div class="big">'+stats.popular.count+'</div><p>Plan-Einträge hatten diese Serie dabei. '+(person?'Eine von '+(shared?'euren':'deinen')+' Serien mit besonders viel Gesellschaft.':'Das war eine eurer großen gemeinsamen Runden.')+'</p>',note:'Gezählt werden Plan-Einträge. MaRyo ist ein Eintrag für zwei Menschen; Vielleicht und bedingte Zusagen sind eingeschlossen.'});
  if(!person&&stats.parallel)cards.push({kicker:'Alle haben etwas gefunden',title:'Zusammen da. Unterschiedliche Serien.',color:'#f4a9d1',html:'<div class="big">'+stats.parallel+'</div><p>Slots mit parallelen Serien. So war für verschiedene Geschmäcker Platz, ohne dass der Abend für alle länger werden musste.</p>',note:'Parallelität laut Guckplan. Ein Slot ohne Uhrzeit wird nur mit expliziter Slotnummer zusammengelegt.'});
  if(stats.exclusive.length)cards.push({kicker:person?(shared?'Nur auf eurem Plan':'Nur auf deinem Plan'):'Die kleinen Eigenprogramme',title:person?'Ein bisschen was nur für '+(shared?'euch.':'dich.'):'Nicht alles muss die ganze Runde schauen.',color:'#f4a9d1',html:'<div class="big">'+stats.exclusive.length+'</div><p>Serien standen auf genau einem Gruppenplan. '+(person?'Auch schön, etwas ganz Eigenes dabei zu haben.':'Für persönliche Vorlieben war also ebenfalls Platz.')+'</p>'+wrappedRank(stats.exclusive.slice(0,3).map(s=>[s.title,'ein Plan'])),note:shared?'Diese Auswahl gehört eurem gemeinsamen MaRyo-Plan — das sind keine Einzelpicks nur einer Person.':'Verglichen wird nur diese Gruppe, nicht die allgemeine Beliebtheit der Serien.'});
  if(stats.night)cards.push({kicker:stats.night.minutes>=1320?'Für die späte Runde':'Der letzte geplante Start',title:stats.night.minutes>=1320?'Eine ging noch.':'So klang der Abend aus.',color:'#c8a6ff',html:'<div class="big">'+stats.night.time.split(':').map(v=>v.padStart(2,'0')).join(':')+'</div><p>'+wrappedSafe(stats.night.title)+' war '+(stats.night.minutes>=1320?'für die späte Runde':'als spätester Start')+' eingetragen ('+wrappedSafe(stats.night.day)+'). '+(stats.night.minutes>=1320?'Wer noch wach war, hatte also noch etwas vor.':'Ein schöner Punkt, um den Abend ausklingen zu lassen.')+'</p>',note:'Späteste Startzeit im Plan. Serien ohne Uhrzeit zählen hier nicht; eine tatsächliche Schlafenszeit wird nicht erfasst.'});
  if(person){const total=WrappedStats.plan(wrappedRecords,wrappedPlan.people).shows;cards.push({kicker:shared?'Eure eigene Mischung':'Deine eigene Mischung',title:shared?'Ein Plan nach eurem Geschmack.':'Ein Plan nach deinem Geschmack.',color:'#94dce0',html:wrappedMetrics([[stats.shows,shared?'Serien auf eurem Plan':'Serien auf deinem Plan'],[total,'Serien in der ganzen Gruppe'],[stats.partners,'andere Pläne mit Überschneidungen']])+'<p>'+ (shared?'Euer gemeinsamer Plan':'Deine Auswahl')+' muss keine Rangliste gewinnen. Hauptsache, es ist etwas dabei, auf das '+you+(plural?' Lust habt.':' Lust hast.')+'</p>',note:'Es geht um die Auswahl im Plan, nicht darum, wer mehr geschafft hat.'});}
  else cards.push({kicker:'Für jeden etwas dabei',title:'Viele Pläne. Nicht alle gleich voll.',color:'#94dce0',html:wrappedRank(stats.perPerson.map(([n,count])=>[n,count+' Serien']))+'<p>Eine kleine Übersicht eurer Auswahl. MaRyo ist ein gemeinsamer Plan für zwei Menschen und wird einmal aufgeführt.</p>',note:'Serien pro Plan-Eintrag, keine persönliche Leistungsrangliste und keine tatsächlich gesehenen Folgen.'});
  const months=tab.parts?12:3;
  const seasonStart=tab.start || new Date().getTime(), endDate=new Date(seasonStart);endDate.setMonth(endDate.getMonth()+months);
  wrappedDraw(cards);
  $('status').textContent='Plan geladen · Listen-Statistiken werden gelesen…';
  if(!allowLists){
    cards.push({kicker:season+' · zum Schluss',title:person?(shared?'Das war eure gemeinsame Season.':'Das war deine Season.'):'So unterschiedlich. Trotzdem eine Runde.',color:'#d6ff79',html:'<p>'+(person?'Ob gemeinsame Serien oder die eigene Auswahl: Schön, dass '+(shared?'ihr':'du')+' dabei '+(shared?'seid.':'bist.'):'Zehn verschiedene Geschmäcker müssen nicht denselben Anime mögen, um einen schönen gemeinsamen Abend zu haben.').replace('Zehn verschiedene',WrappedStats.peopleCount(wrappedPlan.people)+' verschiedene')+'</p><p>Für '+wrappedSafe(season)+' bleiben wir bewusst beim Guckplan. Listen-Statistiken kommen erst ab Winter 2027 dazu.</p>',note:'Keine AniList- oder MAL-Daten für diesen Rückblick. Der Plan ist eine Momentaufnahme der Season.'});
    cards.push(...wrappedFoodCards(stats,'',season,name));
    const index=wrappedIndex;wrappedDraw(cards);wrappedShow(index);
    $('status').textContent=wrappedTabNote||wrappedPlanNote?'Gespeicherter Guckplan · Neu laden versucht es erneut.':season+' · nur aus eurem Guckplan.';
    $('sources').textContent=(wrappedTabNote+' '+wrappedPlanNote+' Dieser Rückblick basiert auf dem aktuellen Guckplan, einschließlich Vielleicht und bedingter Zusagen. MaRyo zählt als zwei Menschen mit einem gemeinsamen Plan. Keine Listen- oder Watch-Historie; keine temporären Wochenverschiebungen.').trim();
    return;
  }
  let profiles=[...new Map(selected.flatMap(p=>Array.isArray(wrappedProfiles[p])?wrappedProfiles[p]:[]).filter(p=>p?.name).map(p=>[wrappedAccountKey(p),p])).values()];
  // Explicitly synced AniList/MAL accounts represent one list, not two people.
  let sync={};try{sync=JSON.parse(localStorage.getItem('listSyncPairs')||'{}');}catch{}
  const present=new Set(profiles.map(wrappedAccountKey));
  profiles=profiles.filter(profile=>{
    if(profile.provider!=='mal')return true;
    const id=wrappedAccountKey(profile);
    return !Object.entries(sync).some(([source,pair])=>pair?.enabled &&
      ((source.toLowerCase()===id && String(pair.target).toLowerCase().startsWith('anilist:') && present.has(String(pair.target).toLowerCase())) ||
      (String(pair.target).toLowerCase()===id && source.toLowerCase().startsWith('anilist:') && present.has(source.toLowerCase()))));
  });
  const covered=selected.filter(p=>(wrappedProfiles[p]||[]).length).length;
  const results=[],failures=[];let undated=0,foodGenre='';
  // Keep public APIs happy: one list at a time, each at most once per group.
  for(const profile of profiles) {
    if(generation!==wrappedGeneration)return;
    try {const data=await wrappedList(profile,fresh);results.push({profile,...data});} catch {failures.push(profile.name);}
  }
  if(generation!==wrappedGeneration)return;
  if(results.length) {
    const entries=results.flatMap(r=>r.entries.map(e=>({...e,media:{...e.media,id:wrappedAccountKey(r.profile)+':'+e.media.id}})));
    const summary=WrappedStats.list(entries,seasonStart,endDate.getTime());
    const coverage=person?`${results.map(r=>r.profile.name).join(', ')}`:`${covered} von ${selected.length} Plan-Personen zugeordnet · ${results.length} Konten lesbar`;
    cards.push({kicker:`Listen-Rückblick · ${coverage}`,title:summary.completed?(plural?'Diese Geschichten habt ihr abgeschlossen.':'Diese Geschichten hast du abgeschlossen.'):'Ein paar Geschichten laufen noch.',color:'#d6ff79',html:`<div class="big">${summary.completed}</div><p>Serien mit Abschlussdatum in ${wrappedSafe(season)}.</p>${wrappedMetrics([[summary.current,'aktuell Watching / Rewatching'],[summary.episodes,'Folgen dieser abgeschlossenen Serien'],['≈ '+wrappedHours(summary.minutes)+' h','Laufzeit der abgeschlossenen Serien']])}`,note:'Abschlussdatum aus der Liste. Laufzeit ≠ in dieser Season verbrachte Zeit; Folgen können früher gesehen worden sein. Fehlende Laufzeit: 24 Min. geschätzt.'});
    if(summary.rated)cards.push({kicker:'Die Kritikerloge',title:summary.mean>=80?'Da waren viele schöne Treffer dabei.':summary.mean>=60?'Eine Season mit Licht und Schatten.':'Nicht jede Serie konnte überzeugen.',color:'#ffc764',html:'<div class="big">'+(summary.mean/10).toLocaleString('de-DE',{maximumFractionDigits:1})+'</div><p>von 10 Punkten im Schnitt. Basierend auf '+summary.rated+' bewerteten Abschlüssen in dieser Season.</p>',note:'Nur zugeordnete Listen mit vollständigem Abschlussdatum. Unbewertete Serien zählen nicht als 0.'});
    if(summary.finishDay){const [date,count]=summary.finishDay;const [y,m,d]=date.split('-').map(Number);cards.push({kicker:'Tag der Endings',title:'An diesem Tag gingen Geschichten zu Ende.',color:'#f4a9d1',html:'<div class="big">'+count+'</div><p>Listen-Abschlüsse am '+new Date(y,m-1,d).toLocaleDateString('de-DE')+'. Vielleicht war da auch ein Lieblings-Ending dabei.</p>',note:'Der Tag mit den meisten eingetragenen Abschlüssen, keine Messung eines Binges. Gruppenwerte zählen Abschlüsse pro verknüpfter Person.'});}
    if(!person&&summary.debate)cards.push({kicker:'Geschmacksgericht',title:summary.debate.title,color:'#ffb78d',html:'<div class="big">'+(summary.debate.gap/10).toLocaleString('de-DE')+'</div><p>Punkte Unterschied zwischen der höchsten und niedrigsten Bewertung. Da hattet ihr offenbar unterschiedliche Eindrücke.</p>',note:'Größte Bewertungsdifferenz bei derselben in dieser Season abgeschlossenen Serie. Nur die zugeordneten Konten mit Wertung zählen.'});
    foodGenre=summary.genre?.[0]||'';
    if(summary.genre)cards.push({kicker:plural?'Euer häufigstes Genre':'Dein häufigstes Genre',title:summary.genre[0],color:'#c8a6ff',html:`<div class="big">${summary.genre[1]}</div><p>abgeschlossene Serien mit diesem Genre. Das hat diese Season einen guten Teil der Auswahl ausgemacht.</p>`,note:'Aus Serien mit Abschlussdatum in der gewählten Season. Serien können mehrere Genres haben; fehlende Metadaten zählen nicht.'});
    if(summary.favourites.length)cards.push({kicker:'Die Favoritenliste',title:plural?'Die kamen bei euch besonders gut an.':'Die kamen bei dir besonders gut an.',color:'#ffb78d',html:wrappedRank(summary.favourites.map(f=>[f.title,(f.score/10).toLocaleString('de-DE')+'/10'])),note:'Bewertungen der in dieser Season abgeschlossenen Serien. AniList/MAL auf 10 Punkte umgerechnet; gleich bewertete Serien sind gleichauf.'});
    // Watch time this season, and the comparison with the season before (same lists, the three months before)
    if(summary.watchEpisodes)cards.push({kicker:'Watch-Time',title:plural?'So viel Zeit steckt in eurer Season.':'So viel Zeit steckt in deiner Season.',color:'#94dce0',
      html:`<div class="big">≈ ${wrappedHours(summary.watchMinutes)} Std.</div><p>${summary.watchEpisodes} Folgen aus ${summary.watchShows} Serien.</p>${summary.watchMinutes>=1440?wrappedMetrics([[new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(summary.watchMinutes/1440),'Tage am Stück']]):''}`,
      note:'Abgeschlossene Serien dieser Season mit allen Folgen, dazu der Fortschritt bei laufenden, pausierten und abgebrochenen Serien aus dieser Season. Ältere Serien ohne Abschluss zählen nicht; fehlende Folgenlängen als 24 Min. Bei MAL nur Abschlüsse.'});
    const before=new Date(seasonStart);before.setMonth(before.getMonth()-months);
    const prev=WrappedStats.list(entries,before.getTime(),seasonStart);
    if(prev.completed||prev.watchEpisodes){
      const prevName=tab.parts?'Jahr '+before.getFullYear():['Winter','Frühling','Sommer','Herbst'][Math.floor(before.getMonth()/3)]+' '+before.getFullYear();
      const delta=(now,then,fmt=n=>String(n))=>now===then?'gleich':(now>then?'+':'−')+fmt(Math.abs(now-then));
      const hours=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(n/60);
      const more=summary.watchMinutes-prev.watchMinutes, change=prev.watchMinutes?more/prev.watchMinutes:1;
      const metrics=[[`${hours(summary.watchMinutes)} Std. (${delta(summary.watchMinutes,prev.watchMinutes,n=>hours(n)+' Std.')})`,'Watch-Time'],
        [`${summary.completed} (${delta(summary.completed,prev.completed)})`,'Abschlüsse']];
      if(summary.rated&&prev.rated)metrics.push([`${(summary.mean/10).toLocaleString('de-DE',{maximumFractionDigits:1})} (${delta(Math.round(summary.mean),Math.round(prev.mean),n=>(n/10).toLocaleString('de-DE',{maximumFractionDigits:1}))})`,'Punkte im Schnitt']);
      const genre=summary.genre&&prev.genre&&summary.genre[0]!==prev.genre[0]?`<p>Häufigstes Genre: ${wrappedSafe(summary.genre[0])} statt ${wrappedSafe(prev.genre[0])}.</p>`:'';
      cards.push({kicker:'Im Vergleich zu '+prevName,title:change>0.1?'Mehr Anime als letzte Season.':change<-0.1?'Etwas ruhiger als letzte Season.':'Ungefähr wie letzte Season.',color:'#ffc764',
        html:wrappedMetrics(metrics)+genre,note:`Dieselben Listen, gezählt für ${prevName} wie für diese Season.`});
    }
    undated=summary.undated;
  } else cards.push({kicker:'Noch mehr Wrapped?',title:'Dein Plan kennt nur die halbe Story.',color:'#f4a9d1',html:'<p>Ordne unter <button class="inline-action" data-open-profiles>Profile</button> einer Person ihre AniList- oder MAL-Konten zu. Dann kommen Abschlüsse, Favoriten und Genres dazu.</p>',note:'Persönliche Plan-Statistiken funktionieren auch ohne Konto. Gruppen-Listenstatistiken sind nur so vollständig wie die zugeordneten Konten.'});
  cards.push(...wrappedFoodCards(stats,foodGenre,season,name));
  const index=wrappedIndex;
  wrappedDraw(cards);wrappedShow(index);
  $('status').textContent=failures.length?`Teilweise Daten: ${failures.join(' · ')}`:(wrappedTabNote||wrappedPlanNote?'Gespeicherte Daten · Neu laden versucht es erneut.':'Dein Wrapped ist bereit.');
  const stale=results.filter(r=>r.stale);
  $('sources').textContent=`${wrappedTabNote} ${wrappedPlanNote} Guckplan-Snapshot: ${new Date().toLocaleDateString('de-DE')}. Season: ${season}. Plan-Daten sind keine Watch-Historie; temporäre Wochenverschiebungen sind nicht eingerechnet. ${person?'Persönliche Serienauswahl.':'Konten zählen einmal; ausdrücklich gekoppelte AniList/MAL-Listen werden nicht doppelt gezählt.'} ${undated?undated+' undatierte Abschlüsse aus der gesamten Liste wurden nicht dieser Season zugeordnet. ':''}${stale.length?'Gespeicherte Listen statt Live-Daten: '+stale.map(r=>r.profile.name+' ('+new Date(r.time).toLocaleDateString('de-DE')+')').join(', '):''}`;
}
async function wrappedLoad(fresh = false) {
  const loadGeneration=++wrappedLoadGeneration; ++wrappedGeneration;
  const previous=$('person').value;
  $('status').textContent='Guckplan wird geladen…';$('refresh').disabled=true;
  try {
    const tab=wrappedTab($('season').value);
    // a year: every season's Guckplan, people and records together (each record knows its season)
    const parts=tab.parts||[tab];
    const plans=await Promise.all(parts.map(wrappedReadPlan)); if(loadGeneration!==wrappedLoadGeneration)return;
    wrappedPlan=plans.length===1?plans[0]:{people:[...new Set(plans.flatMap(p=>p.people))],shows:plans.flatMap(p=>p.shows),colors:Object.assign({},...plans.map(p=>p.colors||{})),catalog:[]};
    wrappedRecords=[];
    plans.forEach((plan,i)=>{const seasonName=parts[i].name.replace(/^Guckplan\s+/,'');
    for(const person of plan.people)for(const [show,slot] of picks(plan,person))wrappedRecords.push({season:seasonName,person,key:WrappedStats.key(show.romaji||show.english),title:wrappedTitle(show),day:WrappedStats.days?.find(d=>norm(d).slice(0,2)===norm(slot.tag).slice(0,2))||slot.tag,time:parseTime(slot.time)?.join(':')||'',slot:slot.slot});});
    $('person').replaceChildren(new Option('Die ganze Gruppe',''),...wrappedPlan.people.map(p=>new Option(p,p)));
    if(wrappedPlan.people.includes(previous))$('person').value=previous;
    $('profilePerson').replaceChildren(...wrappedPlan.people.map(p=>new Option(p,p)));
    await wrappedRender(fresh);
  }catch(error){if(loadGeneration!==wrappedLoadGeneration)return;$('status').textContent='Wrapped konnte nicht geladen werden: '+error.message;$('stories').hidden=$('actions').hidden=true;}
  finally{if(loadGeneration===wrappedLoadGeneration)$('refresh').disabled=false;}
}
function wrappedFillProfiles() {
  const linked=wrappedProfiles[$('profilePerson').value]||[];
  $('profileNames').value=linked.filter(p=>p.provider!=='mal').map(p=>p.name).join(', ');
  const accounts=wrappedAccounts.filter(a=>a.provider==='mal');
  $('malChoices').replaceChildren(...accounts.map(a=>{
    const label=document.createElement('label');label.className='mal-choice';
    const input=document.createElement('input');input.type='checkbox';input.value=a.name;input.checked=linked.some(p=>p.provider==='mal'&&p.name===a.name);
    label.append(input,document.createTextNode('MyAnimeList · '+a.name));return label;
  }));
  $('profileMessage').textContent='';
}
function wrappedOpenProfiles() {
  if(!wrappedPlan)return;
  if($('person').value)$('profilePerson').value=$('person').value;
  wrappedFillProfiles();$('profiles').showModal();
}
$('profilePerson').onchange=wrappedFillProfiles;
$('profileButton').onclick=wrappedOpenProfiles;
$('stories').onclick=e=>{if(e.target.closest('[data-open-profiles]'))wrappedOpenProfiles();};
$('saveProfiles').onclick=()=>{
  const names=$('profileNames').value.split(',').map(n=>n.trim()).filter(Boolean);
  if(names.some(n=>!/^[-\w]{1,50}$/.test(n))){$('profileMessage').textContent='Bitte gültige AniList-Namen eingeben.';return;}
  const linked=names.map(name=>({provider:'anilist',name}));
  for(const input of $('malChoices').querySelectorAll('input:checked'))linked.push({provider:'mal',name:input.value});
  wrappedProfiles[$('profilePerson').value]=[...new Map(linked.map(p=>[wrappedAccountKey(p),p])).values()];
  try{localStorage.setItem('wrappedProfiles',JSON.stringify(wrappedProfiles));}catch{$('profileMessage').textContent='Browser-Speicher nicht verfügbar.';return;}
  $('profiles').close();wrappedRender();
};
$('season').onchange=()=>wrappedLoad();
$('person').onchange=()=>wrappedRender();
$('refresh').onclick=async()=>{if($('refresh').disabled)return;await wrappedInitialize(true);};
$('previous').onclick=()=>wrappedShow(wrappedIndex-1);
$('next').onclick=()=>wrappedShow(wrappedIndex+1);
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,dialog')||$('profiles').open)return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();wrappedShow(wrappedIndex+(e.key==='ArrowLeft'?-1:1));}
});
// Local image generation contains no account tokens, usernames beyond those on the shown card,
// or remote images. Nothing is sent or posted anywhere.
$('download').onclick=()=>{
  const card=$('stories').children[wrappedIndex],data=wrappedCards[wrappedIndex];if(!card||!data)return;
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');ctx.fillStyle=data.color;ctx.fillRect(0,0,1080,1350);ctx.fillStyle=data.ink||'#20201c';
  const ink=data.ink||'#20201c';
  ctx.save();ctx.globalAlpha=.07;ctx.strokeStyle=ink;ctx.lineWidth=100;ctx.beginPath();ctx.arc(1050,100,290,0,Math.PI*2);ctx.stroke();ctx.restore();
  const draw=(value,x,y,width,size,bold=false,maxLines=4)=>{
    ctx.font=(bold?'700':'400')+' '+size+'px sans-serif';
    const lines=[];let line='';
    for(const word of String(value).split(/\s+/)){
      if(ctx.measureText(line+' '+word).width>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);
    const shown=lines.slice(0,maxLines);
    if(lines.length>maxLines)shown[maxLines-1]=shown[maxLines-1].replace(/\s+\S*$/,'')+'…';
    shown.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.25));
    return y+shown.length*size*1.25;
  };
  draw('ANIME WRAPPED',80,90,920,25,true,1);
  draw(data.kicker,80,140,920,22,false,2);
  let y=draw(data.title,80,240,920,62,true,4)+40;
  const number=card.querySelector('.big');
  if(number){y+=135;draw(number.textContent,75,y,940,170,true,1);y+=75;}
  for(const p of card.querySelectorAll('p:not(.kicker):not(.caption)'))y=draw(p.textContent,80,y,920,32,false,4)+28;
  const metrics=[...card.querySelectorAll('.metric')];
  if(metrics.length){
    const top=Math.max(800,y+30);
    metrics.forEach((metric,i)=>{
      const x=80+i*315;ctx.globalAlpha=.25;ctx.fillRect(x,top-25,275,2);ctx.globalAlpha=1;
      draw(metric.querySelector('b').textContent,x,top+50,275,50,true,1);
      draw(metric.querySelector('span').textContent,x,top+95,275,23,false,3);
    });
  }
  const bars=[...card.querySelectorAll('.bar-item')];
  if(bars.length){
    const values=bars.map(b=>Number(b.querySelector('b').textContent));const max=Math.max(1,...values);
    bars.forEach((bar,i)=>{const x=80+i*133,h=values[i]/max*230;ctx.globalAlpha=.7;ctx.fillRect(x,940-h,100,h||3);ctx.globalAlpha=1;draw(values[i],x,910-h,100,25,true,1);draw(bar.childNodes[bar.childNodes.length-1].textContent,x,985,110,25,false,1);});
  }
  for(const row of card.querySelectorAll('.rank li')){
    y=Math.max(y,430);if(y>1020)break;
    ctx.globalAlpha=.25;ctx.fillRect(80,y-25,920,2);ctx.globalAlpha=1;
    draw(row.querySelector('span').textContent,80,y+22,700,29,false,2);
    draw(row.querySelector('b').textContent,820,y+22,180,28,true,1);y+=115;
  }
  draw(data.note||'',80,1160,920,20,false,4);
  draw('Simulcast-Plan · '+$('season').selectedOptions[0].textContent,80,1290,920,22,false,1);
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='anime-wrapped.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
};
async function wrappedInitialize(fresh = false){
  const selectedTab=$('season').value;
  $('refresh').disabled=true;
  try{
    await wrappedReadProfiles();
    wrappedTabs=await wrappedReadTabs();
    const years=new Map();for(const t of wrappedTabs){const y=new Date(t.start).getFullYear();years.set(y,[...(years.get(y)||[]),t]);}
    wrappedYears=[...years].sort((a,b)=>b[0]-a[0]).map(([y,parts])=>({gid:'year:'+y,name:'Jahr '+y,start:new Date(y,0,1).getTime(),parts:parts.sort((a,b)=>b.start-a.start)}));
    const group=(label,list)=>{const g=document.createElement('optgroup');g.label=label;g.append(...list.map(t=>new Option(t.name.replace(/^Guckplan\s+/,''),t.gid)));return g;};
    $('season').replaceChildren(group('Season',wrappedTabs),group('Ganzes Jahr',wrappedYears));
    $('season').value=wrappedTab(selectedTab)?selectedTab:tabFor(wrappedTabs,new Date()).gid;
    await wrappedLoad(fresh);
  }catch(error){$('status').textContent='Wrapped konnte nicht geladen werden: '+error.message;}
  finally{$('refresh').disabled=false;}
}
wrappedInitialize();
