// Titel-Rätsel: English words from Guckplan titles, or public group AniLists
// in Hard mode. Daily puzzles are independent of endlessly replayable rounds.
import {englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,hardHintError,hashWord,pickEntry,pickFreshEntry,pickEndlessEntry} from './games-logic.mjs';

const $ = id => document.getElementById(id);
const TRIES = 6;
const ROWS = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
const SHEET_ID = '1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ';
const berlinDay = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
const dayNumber = (day,start) => Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);
const load = (key,fallback) => {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
async function json(url,options) {
  const res=await fetch(url,options);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}
const wordMap = entries => new Map(entries.map(e=>[e.word,e]));
const mergeEntries = (...sets) => [...wordMap(sets.flat()).values()];
const sourceWordSet = entries => new Set(entries.map(e=>e.word));
// Both modes: any common English word of the right length counts as a guess (SCOWL list,
// see games-guesses.json); without it you could only guess words from someone's titles.
let guessWords=null;
async function dictionaryWords(length) {
  try{guessWords??=(await json('games-guesses.json')).words||{};}catch{return [];}
  return String(guessWords[length]||'').split(' ').filter(Boolean);
}
let dailyData=null, sheetPool=null, hardUsers=null;
const hardCache=new Map();
let puzzle=null,state=null,typing='',allowed=new Set(),generation=0;
let gameMode=load('titleGameMode','daily')==='endless'?'endless':'daily';
let difficulty=['hard','extreme'].includes(load('titleGameDifficulty','normal'))?load('titleGameDifficulty','normal'):'normal';
// Schwer and Extrem share the rules: use every hint, two optional hints
const strict = level => level==='hard'||level==='extreme';

async function fetchSheetPool() {
  if(sheetPool) return sheetPool;
  // Use English titles in the actual Guckplan; the checked list bundled
  // with the game is a safe fallback if the Sheet API is unavailable.
  // The generated seasonal catalog covers hundreds of real English anime
  // titles, including shows outside the selected watch-plan tab.
  const found=[];
  try {
    const catalog=await json('seasons.json');
    for(const [season,shows] of Object.entries(catalog.seasons||{}))
      for(const show of shows||[])if(show.english)
        found.push({title:show.english,from:'Season '+season});
  } catch {}
  // Live Google Sheet tabs add any newer English titles missing in the catalog.
  let tabs=[],config={};
  try{[tabs,config]=await Promise.all([json('tabs.json'),json('config.json')]);}catch{}
  if(!config.sheetsKey || !Array.isArray(tabs)){
    sheetPool=titleEntries(found,'Guckplan');
    return sheetPool;
  }
  for(const tab of tabs.slice(0,8)) {
    if(!tab?.name) continue;
    const range=encodeURIComponent("'"+tab.name.replace(/'/g,"''")+"'!A1:AZ500");
    const url='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/'+range+
      '?key='+encodeURIComponent(config.sheetsKey);
    try {
      const rows=(await json(url)).values||[];
      const header=rows.find(r=>r.includes('Anime Titel') && r.includes('Eng Anime Titel'));
      if(!header) continue;
      const col=header.indexOf('Eng Anime Titel');
      const start=rows.indexOf(header)+1;
      for(const row of rows.slice(start)){
        const title=String(row[col]||'').trim();
        if(title) found.push({title,from:tab.name});
      }
    }catch{} // A single missing sheet must not break the game.
  }
  sheetPool=titleEntries(found,'Guckplan');
  return sheetPool;
}
async function normalEntries() {
  dailyData ||= await json('games-words.json');
  const curated=approvedDailyEntries(dailyData.words);
  if(!curated.length) throw new Error('Keine geprüften englischen Wörter im Guckplan.');
  let extra=[], endless=[];
  try {extra=await fetchSheetPool();}catch{}
  // endless answers: every English word from the group's anime titles (tools/games-endless.mjs, daily)
  try {endless=((await json('games-endless.json')).words||[]).filter(e=>e&&/^[A-Z]{5,8}$/.test(e.word)&&e.title);}catch{}
  return {daily:curated,pool:mergeEntries(curated,extra,endless)};
}
async function users() {
  if(hardUsers) return hardUsers;
  const profiles=await json('wrapped-profiles.json');
  const seen=new Set();
  hardUsers=Object.values(profiles).flat().filter(profile=>{
    if(profile?.provider!=='anilist' || typeof profile.name!=='string' ||
      !/^[a-z0-9_-]{2,40}$/i.test(profile.name)) return false;
    const key=profile.name.toLowerCase();
    if(seen.has(key))return false;seen.add(key);return true;
  }).map(profile=>profile.name);
  if(!hardUsers.length) throw new Error('Keine Gruppen-AniLists eingerichtet.');
  return hardUsers;
}
// One request per person (the whole list at once) instead of up to 30 pages, and each list is kept
// for a day, so hard mode stays under AniList's rate limit. A list saved earlier stands in when
// AniList can't be reached (rate limit, blocker, network).
const LIST_DAY=24*60*60*1000;
const savedList=username=>load('titleGameAniList:'+username.toLowerCase(),null);
async function anilistEntries(username) {
  if(hardCache.has(username)) return hardCache.get(username);
  const kept=savedList(username);
  const usable=titles=>{
    const pool=titleEntries(titles.map(title=>({title,from:'AniList · '+username})),'AniList · '+username);
    if(pool.length) hardCache.set(username,pool);
    return pool;
  };
  if(kept && Array.isArray(kept.titles) && Date.now()-kept.at<LIST_DAY) return usable(kept.titles);
  const query='query ($user:String){MediaListCollection(userName:$user,type:ANIME){lists{entries{media{title{english}}}}}}';
  try {
    let res;
    for(let attempt=0;attempt<2;attempt++){
      res=await fetch('https://graphql.anilist.co',{
        method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({query,variables:{user:username}})
      });
      if(res.status!==429)break;
      const wait=Math.min(5,Number(res.headers.get('Retry-After'))||2);
      await new Promise(r=>setTimeout(r,wait*1000));
    }
    if(!res.ok) throw new Error(res.status===429?'AniList: zu viele Anfragen':'AniList: HTTP '+res.status);
    const result=await res.json();
    if(result.errors?.length) throw new Error('AniList: '+result.errors[0].message);
    const titles=[...new Set((result.data?.MediaListCollection?.lists||[])
      .flatMap(list=>list?.entries||[]).map(item=>item?.media?.title?.english).filter(Boolean))];
    save('titleGameAniList:'+username.toLowerCase(),{at:Date.now(),titles});
    return usable(titles);
  } catch(e) {
    if(kept && Array.isArray(kept.titles)) return usable(kept.titles);
    throw e;
  }
}
// hard mode also draws from the 500 most popular anime on AniList (games-endless.json "popular")
let popularPool=null;
async function popularEntries(){
  if(popularPool) return popularPool;
  try{popularPool=((await json('games-endless.json')).popular||[]).filter(e=>e&&/^[A-Z]{5,8}$/.test(e.word)&&e.title).map(e=>({...e,from:'Top 500 auf AniList'}));}
  catch{popularPool=[];}
  return popularPool;
}
// Extrem: words from every anime on AniList (games-endless.json "extreme": [word, title], unchecked names left out),
// plus the Top 500 and the endless words, so it works before the first weekly list is there
let extremePool=null;
async function extremeEntries(){
  if(extremePool) return extremePool;
  let file={};
  try{file=await json('games-endless.json');}catch{}
  const all=(file.extreme||[]).filter(e=>Array.isArray(e)&&e.length===2&&/^[A-Z]{5,8}$/.test(e[0])&&e[1]).map(([word,title])=>({word,title,from:'AniList'}));
  extremePool=mergeEntries(all,(file.popular||[]).map(e=>({...e,from:'AniList'})),(file.words||[]).filter(e=>e&&/^[A-Z]{5,8}$/.test(e.word)&&e.title).map(e=>({...e,from:'AniList'})));
  return extremePool;
}
async function hardEntries(round) {
  const popular=await popularEntries();
  const names=await users();
  const first=hashWord(round)%names.length;
  let error;
  for(let i=0;i<names.length;i++){
    const user=names[(first+i)%names.length];
    try {
      const pool=await anilistEntries(user);
      if(pool.length) return {pool:mergeEntries(pool,popular),user};
    }catch(e){error=e;}
  }
  throw new Error('Keine öffentliche Gruppen-AniList mit passenden englischen Titeln erreichbar.'+
    (error?' ('+error.message+')':''));
}
const currentKey = () => 'titleGame:v2:'+difficulty+':'+gameMode;
const roundNumber = () => gameMode==='daily' ? 0 : Math.max(0,Number(load(currentKey()+':index',0))||0);
const recentKey = () => currentKey()+':recent';
const recentAnswers = () => (load(recentKey(),[])||[]).filter(w=>typeof w==='string').slice(-60);
function rememberAnswer(word){
  const recent=recentAnswers().filter(w=>w!==word);
  recent.push(word);
  save(recentKey(),recent.slice(-60));
}
// this player's own order for endless rounds (kept in this browser)
function playerSeed(){
  let seed=load('titleGameSeed','');
  if(typeof seed!=='string'||!seed){seed=Math.random().toString(36).slice(2,10);save('titleGameSeed',seed);}
  return seed;
}

// Spiele-Übersicht (idea 139): today's state of the three daily games, from what each keeps in this browser
function drawToday() {
  const today = berlinDay();
  const daily = level => load('titleGame:v2:' + level + ':daily:' + level + ':daily:' + today, null);
  const title = [daily('normal'), daily('hard'), daily('extreme')].find(x => x?.guesses?.length) || null;
  const stats = load('titleGameStats:v2:normal:daily', {});
  const cover = load('animeCoverQuizV2', null), syn = load('synopsisPuzzleV1', null), quiz = load('animeQuizV1', null);
  const t = !title ? ['open', 'Noch offen'] : !title.done ? ['open', `${title.guesses.length} von ${TRIES} Versuchen`]
    : title.won ? ['won', `Gelöst in ${title.guesses.length}/${TRIES}`] : ['lost', 'Nicht gelöst'];
  const c = cover?.day !== today || !cover.answers?.length ? ['open', 'Noch offen']
    : cover.total && cover.answers.length < cover.total ? ['open', `${cover.answers.length} von ${cover.total} Covern`]
    : ['won', Number.isFinite(cover.score) ? `${cover.score} / ${(cover.total || 5) * 100} Punkte` : 'Gespielt'];
  const y = syn?.day !== today || !syn.tries?.length ? ['open', 'Noch offen'] : !syn.done ? ['open', '1 Versuch übrig']
    : syn.solved ? ['won', syn.tries.length === 1 ? 'Gelöst im 1. Versuch' : 'Gelöst im 2. Versuch'] : ['lost', 'Nicht gelöst'];
  const q = quiz?.day !== today || !quiz.answers?.length ? ['open', 'Noch offen']
    : !quiz.done ? ['open', `${quiz.answers.length} von ${quiz.total || 5} Fragen`] : ['won', `${quiz.score} / ${quiz.total || 5} richtig`];
  const played = [t, c, y, q].filter(([, text]) => text !== 'Noch offen').length;
  const card = (href, name, [state, text], extra = '') => `<a class="games-card ${state}" href="${href}"><b>${name}</b><span>${text}</span>${extra}</a>`;
  $('gamesToday').innerHTML = `<div class="games-today-head"><b>Heute</b><span>${played} von 4 gespielt</span></div><div class="games-cards">`
    + card('#board', 'Titel-Rätsel', t, stats.streak ? `<small>Serie: ${stats.streak}</small>` : '')
    + card('cover-game.html', 'Anime Cover Quiz', c) + card('synopsis.html', 'Inhalts-Rätsel', y) + card('trivia.html', 'Anime-Quiz', q) + '</div>';
}
async function start() {
  const turn=++generation;
  const mode=gameMode,level=difficulty,day=berlinDay(),round=roundNumber();
  puzzle=null;state=null;typing='';allowed=new Set();
  $('gameHardHints').hidden=true;
  $('gameEnd').hidden=true;$('board').innerHTML='';$('keyboard').innerHTML='';
  $('gameNumber').textContent='Titel-Rätsel';
  $('gameHint').textContent='Lädt…';message('');
  try {
    const basic=await normalEntries();
    if(turn!==generation)return;
    let entry,source=basic.pool;
    const id=level+':'+mode+':'+(mode==='daily'?day:round);
    const saved=load(currentKey()+':'+id,null);
    let hard=null,offline='',extreme=null;
    if(level==='extreme'){
      extreme=await extremeEntries();
      if(turn!==generation)return;
      if(!extreme.length)throw new Error('Die Extrem-Liste ist noch nicht da.');
    }
    if(level==='hard'){
      try{hard=await hardEntries(mode==='daily'?day:round);}
      catch(e){offline=e.message;}
      if(turn!==generation)return;
    }
    if(extreme){
      source=mergeEntries(basic.pool,extreme);
      entry=mode==='daily'?pickEntry(extreme,0,day+':extreme')
        :pickEndlessEntry(extreme,round,'extreme:'+playerSeed(),recentAnswers());
    } else if(hard){
      source=mergeEntries(basic.pool,hard.pool);
      entry=mode==='daily'?pickEntry(hard.pool,0,day+':hard:'+hard.user)
        :pickEndlessEntry(hard.pool,round,'endless:'+hard.user+':'+playerSeed(),recentAnswers());
    } else if(offline) {
      // AniList can't be reached from this browser: a hard puzzle from the Guckplan instead of no game.
      entry=mode==='daily'?pickEntry(basic.pool,0,day+':hard-guckplan')
        :pickEndlessEntry(basic.pool,round,'hard:guckplan:'+playerSeed(),recentAnswers());
    } else entry=mode==='daily'
      ?basic.daily[Math.max(0,dayNumber(day,dailyData.start))%basic.daily.length]
      :pickEndlessEntry(basic.pool,round,'normal:endless:'+playerSeed(),recentAnswers());
    // A new catalog release may reorder the answer pool. Never change a
    // started puzzle, otherwise its saved guesses may become impossible.
    if(saved?.id===id && typeof saved.word==='string'){
      const old=source.find(e=>e.word===saved.word);
      if(old)entry=old;
    }
    if(turn!==generation)return;
    allowed=sourceWordSet(source);
    allowed.add(entry.word);
    const extra=await dictionaryWords(entry.word.length);
    if(turn!==generation)return;
    for(const w of extra)allowed.add(w);
    puzzle={...entry,id,day,number:mode==='daily'?Math.max(0,dayNumber(day,dailyData.start))+1:round+1,
      mode,level};
    state=saved?.id===id && saved?.word===entry.word ? saved
      :{id,word:entry.word,guesses:[],done:false,won:false};
    state.hints = Math.max(0,Math.min(2,Number(state.hints)||0));
    $('gameNumber').textContent=(level==='hard'?'Schwer · ':level==='extreme'?'Extrem · ':'')+
      (mode==='daily'?'Titel-Rätsel #':'Endlos #')+puzzle.number;
    $('gameHint').textContent=puzzle.word.length+' Buchstaben · '+allowed.size+' gültige Wörter';
    draw();
    refreshHardHints();
    drawTitlePick();
    if(offline && !state.done) message('AniList ist von diesem Browser aus gerade nicht erreichbar (Werbeblocker oder Tracking-Schutz?). '+
      'Dieses Rätsel kommt deshalb aus dem Guckplan und ist nicht dasselbe wie bei den anderen.');
    if(state.done) finish(false);
  }catch(e){
    if(turn===generation){$('gameHint').textContent='Nicht verfügbar';message('Rätsel konnte nicht geladen werden: '+e.message);}
  }
}
// Optional Hard-only hints: first identify whose AniList supplied the title;
// second reveal one deterministic position. Never expose the whole title, since
// the answer itself is a word in that title.
function hardHintText() {
  if(!puzzle || !state || !strict(puzzle.level) || !state.hints)return '';
  if(puzzle.level==='extreme'){
    // the title itself would give the answer away: only how long it is and how it starts
    const words=String(puzzle.title||'').split(/\s+/).filter(Boolean);
    const label='Der Titel hat '+words.length+' '+(words.length===1?'Wort':'Wörter')+' und beginnt mit „'+(words[0]||'?')[0].toUpperCase()+'“.';
    if(state.hints===1)return label;
    const index=hashWord(puzzle.id+':hint')%puzzle.word.length;
    return label+' Buchstabe '+(index+1)+' ist '+puzzle.word[index]+'.';
  }
  const owner = (puzzle.from || '').replace(/^AniList\s*·\s*/, '');
  const label = /^Top 500/.test(puzzle.from || '') ? 'Aus den 500 beliebtesten Anime auf AniList.' : !/^AniList/.test(puzzle.from || '') ? 'Aus dem Guckplan.' : owner ? 'Aus der AniList von ' + owner + '.' : 'Aus einer Gruppen-AniList.';
  if(state.hints===1)return label;
  const index=hashWord(puzzle.id+':hint')%puzzle.word.length;
  return label + ' Buchstabe ' + (index+1) + ' ist ' + puzzle.word[index] + '.';
}
function refreshHardHints(){
  const show=!!puzzle && !!state && strict(puzzle.level) && !state.done && !state.wordFound;
  $('gameHardHints').hidden=!show;
  $('gameHintText').textContent=show?hardHintText():'';
  $('gameHintButton').textContent=state?.hints===1?'Zweiter Hinweis': 'Hinweis anzeigen';
  $('gameHintButton').hidden=!show || (state?.hints||0)>=2;
}
$('gameHintButton').onclick=()=>{
  if(!puzzle || !state || !strict(puzzle.level) || state.done || state.hints>=2)return;
  state.hints++;
  save(currentKey()+':'+puzzle.id,state);
  refreshHardHints();
};
function message(text){$('gameMsg').textContent=text;}
function draw(){
  if(!puzzle||!state)return;
  const len=puzzle.word.length;
  $('board').style.setProperty('--len',len);
  $('board').innerHTML=Array.from({length:TRIES},(_,r)=>{
    const guess=state.guesses[r],current=!state.done && r===state.guesses.length;
    const marks=guess?scoreGuess(guess,puzzle.word):[];
    return '<div class="board-row'+(current?' current':'')+'" role="row">'+
      Array.from({length:len},(_,i)=>{
        const letter=guess?guess[i]:current?typing[i]||'':'';
        return '<span class="tile'+(guess?' '+marks[i]:letter?' typed':'')+
          '" role="gridcell">'+letter+'</span>';
      }).join('')+'</div>';
  }).join('');
  const best={},rank={hit:3,near:2,miss:1};
  for(const guess of state.guesses) scoreGuess(guess,puzzle.word).forEach((mark,i)=>{
    if((rank[mark]||0)>(rank[best[guess[i]]]||0)) best[guess[i]]=mark;
  });
  $('keyboard').innerHTML=ROWS.map((row,i)=>'<div class="key-row">'+
    (i===2?'<button type="button" class="key wide" data-key="Enter">Raten</button>':'')+
    [...row].map(letter=>'<button type="button" class="key '+(best[letter]||'')+
      '" data-key="'+letter+'">'+letter+'</button>').join('')+
    (i===2?'<button type="button" class="key wide" data-key="Backspace" aria-label="Löschen">⌫</button>':'')+
    '</div>').join('');
}
// Extrem: the word alone isn't enough, the anime it comes from has to be named too (4 titles to choose from;
// the others are other titles from the list that don't contain the word, the same for everyone on the same puzzle)
function titleChoices(){
  const word=puzzle.word, own=String(puzzle.title||'');
  const titles=[...new Set((extremePool||[]).map(e=>e.title))].filter(t=>t&&t!==own&&!t.toUpperCase().split(/[^A-Z]+/).includes(word));
  const others=titles.sort((a,b)=>hashWord(puzzle.id+':'+a)-hashWord(puzzle.id+':'+b)||a.localeCompare(b)).slice(0,3);
  return [own,...others].sort((a,b)=>hashWord(puzzle.id+':order:'+a)-hashWord(puzzle.id+':order:'+b)||a.localeCompare(b));
}
function drawTitlePick(){
  const show=!!puzzle&&!!state&&puzzle.level==='extreme'&&state.wordFound&&!state.done;
  $('gameTitlePick').hidden=!show;
  if(!show)return;
  $('gameTitleWord').textContent=puzzle.word;
  $('gameTitleChoices').innerHTML=titleChoices().map(t=>'<button type="button" class="pill" data-title-pick="'+t.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')+'">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</button>').join('');
}
$('gameTitleChoices').addEventListener('click',e=>{
  const b=e.target.closest('[data-title-pick]');
  if(!b||!puzzle||!state||state.done||!state.wordFound)return;
  state.titlePick=b.dataset.titlePick;
  state.done=true;state.won=state.titlePick===puzzle.title;
  save(currentKey()+':'+puzzle.id,state);draw();drawTitlePick();refreshHardHints();
  if(puzzle.mode==='endless')rememberAnswer(puzzle.word);
  finish(true);
});
function press(key){
  if(!puzzle||!state||state.done||state.wordFound)return;
  const len=puzzle.word.length;
  if(key==='Enter'){
    if(typing.length<len)return message('Das Wort hat '+len+' Buchstaben.');
    if(!allowed.has(typing))return message('Nur echte englische Wörter sind erlaubt.');
    if(strict(puzzle.level)){
      const hint=hardHintError(typing,state.guesses,puzzle.word);
      if(hint)return message((puzzle.level==='extreme'?'Extrem: ':'Schwerer Modus: ')+hint);
    }
    state.guesses.push(typing);typing='';
    if(state.guesses[state.guesses.length-1]===puzzle.word){
      if(puzzle.level==='extreme')state.wordFound=true; // now name the anime
      else state.done=state.won=true;
    }
    else if(state.guesses.length>=TRIES)state.done=true;
    message('');save(currentKey()+':'+puzzle.id,state);draw();
    refreshHardHints();drawTitlePick();
    if(state.done){if(puzzle.mode==='endless')rememberAnswer(puzzle.word);finish(true);}
    return;
  }
  if(key==='Backspace')typing=typing.slice(0,-1);
  else if(/^[A-Z]$/.test(key)&&typing.length<len)typing+=key;
  message('');draw();
}
function finish(fresh){
  const key='titleGameStats:v2:'+puzzle.level+':'+puzzle.mode;
  const stats=load(key,{played:0,won:0,streak:0,best:0,tries:[0,0,0,0,0,0],last:'',lastWon:false});
  if(fresh && stats.last!==puzzle.id){
    stats.played++;
    if(state.won){stats.won++;stats.tries[state.guesses.length-1]++;}
    const yesterday=new Date(Date.parse(puzzle.day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
    const consecutive=puzzle.mode==='daily' ? stats.last?.endsWith(':'+yesterday)
      :stats.last===puzzle.level+':endless:'+(puzzle.number-2);
    stats.streak=state.won?(consecutive&&stats.lastWon?stats.streak+1:1):0;
    stats.best=Math.max(stats.best,stats.streak);
    stats.last=puzzle.id;stats.lastWon=state.won;save(key,stats);
  }
  $('gameEnd').hidden=false;
  const answer=$('gameAnswer');answer.replaceChildren();
  answer.append(document.createTextNode(state.won?'Richtig! Gesucht war ':state.wordFound?'Das Wort stimmte, aber der Anime nicht. Gesucht war ':'Leider nicht. Gesucht war '));
  const bold=document.createElement('b');bold.textContent=puzzle.word;answer.append(bold);
  answer.append(document.createTextNode(' aus '));
  const title=document.createElement('i');title.textContent=puzzle.title;answer.append(title,document.createTextNode('.'));
  $('gameStats').innerHTML=[['Gespielt',stats.played],
    ['Gewonnen',stats.played?Math.round(stats.won/stats.played*100)+' %':'–'],
    ['Serie',stats.streak],['Beste',stats.best]]
    .map(([label,value])=>'<span><b>'+value+'</b>'+label+'</span>').join('');
  $('gameNext').textContent=puzzle.mode==='daily'?'Morgen gibt es ein neues Wort.':'Noch eine Runde?';
  $('gameNextRound').hidden=puzzle.mode!=='endless';
  drawToday();
}
$('gameNextRound').onclick=()=>{
  if(gameMode!=='endless'||!state?.done)return;
  save(currentKey()+':index',roundNumber()+1);
  start();
};
$('gameShare').onclick=async()=>{
  if(!puzzle||!state)return;
  const grid=state.guesses.map(g=>scoreGuess(g,puzzle.word).map(mark=>({
    hit:'🟩',near:'🟨',miss:'⬛'
  })[mark]).join('')).join('\n');
  const label=puzzle.level==='hard'?'Schwer':puzzle.level==='extreme'?'Extrem':'Normal';
  const text='Titel-Rätsel '+label+' '+(puzzle.mode==='endless'?'Endlos ':'#')+
    puzzle.number+' · '+(state.won||state.wordFound?state.guesses.length:'X')+'/'+TRIES+
    (puzzle.level==='extreme'?' · Anime '+(state.won?'✓':state.wordFound?'✗':'–'):'')+'\n'+grid;
  try{await navigator.clipboard.writeText(text);message('Kopiert. Einfach in Discord einfügen.');}
  catch{message(text);}
};
$('keyboard').addEventListener('click',event=>{
  const key=event.target.closest('[data-key]');
  if(key){press(key.dataset.key);key.blur();}
});
addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||
    event.target?.closest?.('input,select,textarea,[contenteditable],button'))return;
  const key=event.key==='Enter'||event.key==='Backspace'?event.key:
    /^[a-z]$/i.test(event.key)?event.key.toUpperCase():'';
  if(key){event.preventDefault();press(key);}
});
$('gameMode').value=gameMode;$('gameDifficulty').value=difficulty;
$('gameMode').onchange=()=>{
  gameMode=$('gameMode').value;save('titleGameMode',gameMode);start();
};
$('gameDifficulty').onchange=()=>{
  difficulty=$('gameDifficulty').value;save('titleGameDifficulty',difficulty);start();
};
start();
drawToday();
