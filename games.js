// Titel-Rätsel: English words from Guckplan titles, or public group AniLists
// in Hard mode. Daily puzzles are independent of endlessly replayable rounds.
import {englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,hardHintError,hashWord,pickEntry} from './games-logic.mjs';

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
let dailyData=null, sheetPool=null, hardUsers=null;
const hardCache=new Map();
let puzzle=null,state=null,typing='',allowed=new Set(),generation=0;
let gameMode=load('titleGameMode','daily')==='endless'?'endless':'daily';
let difficulty=load('titleGameDifficulty','normal')==='hard'?'hard':'normal';

async function fetchSheetPool() {
  if(sheetPool) return sheetPool;
  // Use English titles in the actual Guckplan; the checked list bundled
  // with the game is a safe fallback if the Sheet API is unavailable.
  const tabs=await json('tabs.json'), config=await json('config.json');
  if(!config.sheetsKey || !Array.isArray(tabs)) return [];
  const found=[];
  for(const tab of tabs.slice(-4)) {
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
  let extra=[];
  try {extra=await fetchSheetPool();}catch{}
  return {daily:curated,pool:mergeEntries(curated,extra)};
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
async function anilistEntries(username) {
  if(hardCache.has(username)) return hardCache.get(username);
  // Public, read-only requests; one person's list is used per hard puzzle.
  const entries=[];
  const query='query ($user:String,$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage} mediaList(userName:$user,type:ANIME){media{title{english}}}}}';
  for(let page=1;page<=30;page++) {
    const result=await json('https://graphql.anilist.co',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query,variables:{user:username,page}})
    });
    if(result.errors?.length) throw new Error('AniList: '+result.errors[0].message);
    for(const item of result.data?.Page?.mediaList||[]){
      const title=item.media?.title?.english;
      if(title) entries.push({title,from:'AniList · '+username});
    }
    if(!result.data?.Page?.pageInfo?.hasNextPage) break;
    if(page===30) throw new Error('Die AniList ist zu groß für einen vollständigen Import.');
  }
  const pool=titleEntries(entries,'AniList · '+username);
  if(pool.length) hardCache.set(username,pool);
  return pool;
}
async function hardEntries(round) {
  const names=await users();
  const first=hashWord(round)%names.length;
  let error;
  for(let i=0;i<names.length;i++){
    const user=names[(first+i)%names.length];
    try {
      const pool=await anilistEntries(user);
      if(pool.length) return {pool,user};
    }catch(e){error=e;}
  }
  throw new Error('Keine öffentliche Gruppen-AniList mit passenden englischen Titeln erreichbar.'+
    (error?' ('+error.message+')':''));
}
const currentKey = () => 'titleGame:v2:'+difficulty+':'+gameMode;
const roundNumber = () => gameMode==='daily' ? 0 : Math.max(0,Number(load(currentKey()+':index',0))||0);

// Spiele-Übersicht (idea 139): today's state of the three daily games, from what each keeps in this browser
function drawToday() {
  const today = berlinDay();
  const daily = level => load('titleGame:v2:' + level + ':daily:' + level + ':daily:' + today, null);
  const title = [daily('normal'), daily('hard')].find(x => x?.guesses?.length) || null;
  const stats = load('titleGameStats:v2:normal:daily', {});
  const cover = load('animeCoverQuizV2', null), syn = load('synopsisPuzzleV1', null);
  const t = !title ? ['open', 'Noch offen'] : !title.done ? ['open', `${title.guesses.length} von ${TRIES} Versuchen`]
    : title.won ? ['won', `Gelöst in ${title.guesses.length}/${TRIES}`] : ['lost', 'Nicht gelöst'];
  const c = cover?.day !== today || !cover.answers?.length ? ['open', 'Noch offen']
    : cover.total && cover.answers.length < cover.total ? ['open', `${cover.answers.length} von ${cover.total} Covern`]
    : ['won', Number.isFinite(cover.score) ? `${cover.score} / ${(cover.total || 5) * 100} Punkte` : 'Gespielt'];
  const y = syn?.day !== today || !syn.tries?.length ? ['open', 'Noch offen'] : !syn.done ? ['open', '1 Versuch übrig']
    : syn.solved ? ['won', syn.tries.length === 1 ? 'Gelöst im 1. Versuch' : 'Gelöst im 2. Versuch'] : ['lost', 'Nicht gelöst'];
  const played = [t, c, y].filter(([, text]) => text !== 'Noch offen').length;
  const card = (href, name, [state, text], extra = '') => `<a class="games-card ${state}" href="${href}"><b>${name}</b><span>${text}</span>${extra}</a>`;
  $('gamesToday').innerHTML = `<div class="games-today-head"><b>Heute</b><span>${played} von 3 gespielt</span></div><div class="games-cards">`
    + card('#board', 'Titel-Rätsel', t, stats.streak ? `<small>Serie: ${stats.streak}</small>` : '')
    + card('cover-game.html', 'Anime Cover Quiz', c) + card('synopsis.html', 'Inhalts-Rätsel', y) + '</div>';
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
    if(level==='hard'){
      const hard=await hardEntries(mode==='daily'?day:round);
      if(turn!==generation)return;
      source=mergeEntries(basic.pool,hard.pool);
      entry=mode==='daily'?pickEntry(hard.pool,0,day+':hard:'+hard.user)
        :pickEntry(hard.pool,Math.floor(round/(await users()).length), 'endless:'+hard.user);
    } else entry=mode==='daily'
      ?basic.daily[Math.max(0,dayNumber(day,dailyData.start))%basic.daily.length]
      :pickEntry(basic.pool,round,'normal:endless');
    if(turn!==generation)return;
    allowed=sourceWordSet(source);
    allowed.add(entry.word);
    const id=level+':'+mode+':'+(mode==='daily'?day:round);
    puzzle={...entry,id,day,number:mode==='daily'?Math.max(0,dayNumber(day,dailyData.start))+1:round+1,
      mode,level};
    const saved=load(currentKey()+':'+id,null);
    state=saved?.id===id && saved?.word===entry.word ? saved
      :{id,word:entry.word,guesses:[],done:false,won:false};
    state.hints = Math.max(0,Math.min(2,Number(state.hints)||0));
    $('gameNumber').textContent=(level==='hard'?'Schwer · ':'')+
      (mode==='daily'?'Titel-Rätsel #':'Endlos #')+puzzle.number;
    $('gameHint').textContent=puzzle.word.length+' Buchstaben · '+allowed.size+' gültige Wörter';
    draw();
    refreshHardHints();
    if(state.done) finish(false);
  }catch(e){
    if(turn===generation){$('gameHint').textContent='Nicht verfügbar';message('Rätsel konnte nicht geladen werden: '+e.message);}
  }
}
// Optional Hard-only hints: first identify whose AniList supplied the title;
// second reveal one deterministic position. Never expose the whole title, since
// the answer itself is a word in that title.
function hardHintText() {
  if(!puzzle || !state || puzzle.level!=='hard' || !state.hints)return '';
  const owner = (puzzle.from || '').replace(/^AniList\s*·\s*/, '');
  const label = owner ? 'Aus der AniList von ' + owner + '.' : 'Aus einer Gruppen-AniList.';
  if(state.hints===1)return label;
  const index=hashWord(puzzle.id+':hint')%puzzle.word.length;
  return label + ' Buchstabe ' + (index+1) + ' ist ' + puzzle.word[index] + '.';
}
function refreshHardHints(){
  const show=!!puzzle && !!state && puzzle.level==='hard' && !state.done;
  $('gameHardHints').hidden=!show;
  $('gameHintText').textContent=show?hardHintText():'';
  $('gameHintButton').textContent=state?.hints===1?'Zweiter Hinweis': 'Hinweis anzeigen';
  $('gameHintButton').hidden=!show || state.hints>=2;
}
$('gameHintButton').onclick=()=>{
  if(!puzzle || !state || puzzle.level!=='hard' || state.done || state.hints>=2)return;
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
function press(key){
  if(!puzzle||!state||state.done)return;
  const len=puzzle.word.length;
  if(key==='Enter'){
    if(typing.length<len)return message('Das Wort hat '+len+' Buchstaben.');
    if(!allowed.has(typing))return message('Nur echte englische Wörter aus den Anime-Titeln sind erlaubt.');
    if(puzzle.level==='hard'){
      const hint=hardHintError(typing,state.guesses,puzzle.word);
      if(hint)return message('Schwerer Modus: '+hint);
    }
    state.guesses.push(typing);typing='';
    if(state.guesses.at(-1)===puzzle.word)state.done=state.won=true;
    else if(state.guesses.length>=TRIES)state.done=true;
    message('');save(currentKey()+':'+puzzle.id,state);draw();
    refreshHardHints();
    if(state.done)finish(true);
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
  answer.append(document.createTextNode(state.won?'Richtig! Gesucht war ':'Leider nicht. Gesucht war '));
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
  const label=puzzle.level==='hard'?'Schwer':'Normal';
  const text='Titel-Rätsel '+label+' '+(puzzle.mode==='endless'?'Endlos ':'#')+
    puzzle.number+' · '+(state.won?state.guesses.length:'X')+'/'+TRIES+'\n'+grid;
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
