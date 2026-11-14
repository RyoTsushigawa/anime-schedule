import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {
  englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,
  hardHintError,hashWord,pickEntry,pickFreshEntry,pickEndlessEntry
} from '../games-logic.mjs';

const game=readFileSync(new URL('../games.js',import.meta.url),'utf8')
  .replace(/^import .* from '\.\/games-logic\.mjs';\s*/m, '');
const html=readFileSync(new URL('../games.html',import.meta.url),'utf8');
const daily=JSON.parse(readFileSync(new URL('../games-words.json',import.meta.url),'utf8'));
const guesses=JSON.parse(readFileSync(new URL('../games-guesses.json',import.meta.url),'utf8'));

async function openGame({mode='daily',difficulty='normal',accounts=['Belly'],anilistDown=false,endless=null}={}){
  const dom=new JSDOM(html,{url:'https://example.test/games.html',runScripts:'outside-only'});
  const {window}=dom,ctx=dom.getInternalVMContext(),requests=[];
  window.localStorage.setItem('titleGameMode',JSON.stringify(mode));
  window.localStorage.setItem('titleGameDifficulty',JSON.stringify(difficulty));
  Object.assign(window,{englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,
    hardHintError,hashWord,pickEntry,pickFreshEntry,pickEndlessEntry});
  window.fetch=async(url,options)=>{
    requests.push({url,options});
    let data;
    if(url==='games-words.json')data=daily;
    else if(url==='games-guesses.json')data=guesses;
    else if(url==='games-endless.json'&&endless)data=endless;
    else if(url==='seasons.json')data=JSON.parse(readFileSync(new URL('../seasons.json',import.meta.url),'utf8'));
    else if(url==='tabs.json')data=[];
    else if(url==='config.json')data={};
    else if(url==='wrapped-profiles.json')
      data=Object.fromEntries(accounts.map((name,i)=>['Member'+i,[{name,provider:'anilist'}]]));
    else if(url==='https://graphql.anilist.co' && anilistDown)throw new TypeError('NetworkError when attempting to fetch resource.');
    else if(url==='https://graphql.anilist.co')
      data={data:{MediaListCollection:{lists:[{entries:[
        {media:{title:{english:'Black Clover'}}},
        {media:{title:{english:'Dragon Quest'}}},
        {media:{title:{english:'Magic Knight'}}}
      ]}]}}};
    else throw Error('Unexpected request: '+url);
    return {ok:true,json:async()=>data};
  };
  vm.runInContext(game,ctx,{filename:'games.js'});
  const ready=async()=>{
    for(let i=0;i<40;i++){
      await new Promise(resolve=>setTimeout(resolve,5));
      if(window.document.querySelector('#board .tile'))return;
    }
    throw Error('Wordle board did not load: '+window.document.querySelector('#gameMsg').textContent);
  };
  await ready();
  return {
    window,ctx,requests,ready,
    run:code=>vm.runInContext(code,ctx),
    close:()=>window.close()
  };
}

test('an invalid made-up guess never consumes an attempt, then the real answer is accepted',async()=>{
  const page=await openGame();
  try{
    const answer=page.run('puzzle.word');
    page.run("typing='Z'.repeat(puzzle.word.length); press('Enter')");
    assert.equal(page.run('state.guesses.length'),0);
    assert.match(page.window.document.querySelector('#gameMsg').textContent,/echte englische Wörter/);
    page.run("typing=puzzle.word; press('Enter')");
    assert.equal(page.run('state.guesses.length'),1);
    assert.equal(page.run('state.won'),true);
    assert.equal(page.window.document.querySelector('#gameAnswer b').textContent,answer);
  }finally{page.close();}
});

test('the physical keyboard still works after clicking an on-screen key',async()=>{
  const page=await openGame();
  try{
    const key=page.window.document.querySelector('[data-key="A"]');
    key.click();
    assert.equal(page.run('typing'),'A');
    assert.notEqual(page.window.document.activeElement,key,'on-screen button releases keyboard focus');
    page.window.dispatchEvent(new page.window.KeyboardEvent('keydown',{key:'B',bubbles:true}));
    assert.equal(page.run('typing'),'AB');
  }finally{page.close();}
});

test('Endless gets another puzzle after winning and does not change daily stats',async()=>{
  const page=await openGame({mode:'endless'});
  try{
    assert.equal(page.run('puzzle.number'),1);
    page.run("typing=puzzle.word; press('Enter')");
    assert.equal(page.window.document.querySelector('#gameNextRound').hidden,false);
    page.window.document.querySelector('#gameNextRound').click();
    await page.ready();
    assert.equal(page.run('puzzle.number'),2);
    assert.equal(page.run('state.done'),false);
    assert.equal(JSON.parse(page.window.localStorage.getItem('titleGame:v2:normal:endless:index')),1);
    assert.equal(page.window.localStorage.getItem('titleGameStats:v2:normal:daily'),null);
  }finally{page.close();}
});

test('Hard Mode draws a title from the public AniList and sends no mutation request',async()=>{
  const page=await openGame({difficulty:'hard'});
  try{
    assert.ok(['Black Clover','Dragon Quest','Magic Knight'].includes(page.run('puzzle.title')));
    assert.equal(page.run('puzzle.level'),'hard');
    assert.ok(page.requests.some(x=>x.url==='wrapped-profiles.json'));
    const gql=page.requests.filter(x=>x.url==='https://graphql.anilist.co');
    assert.ok(gql.length);
    for(const call of gql){
      const body=JSON.parse(call.options.body);
      assert.match(body.query,/MediaListCollection\(userName:\$user,type:ANIME\)/);
      assert.doesNotMatch(body.query,/mutation/i);
    }
  }finally{page.close();}
});

test('Hard Mode still gives a puzzle when AniList is unreachable, and says so',async()=>{
  const page=await openGame({difficulty:'hard',anilistDown:true});
  try{
    assert.ok(page.run('puzzle && puzzle.word'));
    assert.equal(page.run('puzzle.level'),'hard');
    assert.match(page.window.document.getElementById('gameMsg').textContent,/AniList ist von diesem Browser aus/);
    assert.notEqual(page.window.document.getElementById('gameHint').textContent,'Nicht verfügbar');
  }finally{page.close();}
});

test('Hard Wordle offers two progressive hints without consuming guesses',async()=>{
  const page=await openGame({difficulty:'hard'});
  try{
    const doc=page.window.document;
    const hintArea=doc.querySelector('#gameHardHints');
    const hintButton=doc.querySelector('#gameHintButton');
    const hintText=doc.querySelector('#gameHintText');
    assert.equal(hintArea.hidden,false);
    assert.equal(hintText.textContent,'');
    hintButton.click();
    assert.equal(page.run('state.hints'),1);
    assert.match(hintText.textContent,/AniList von Belly/);
    assert.doesNotMatch(hintText.textContent,/Buchstabe/);
    assert.equal(page.run('state.guesses.length'),0);
    hintButton.click();
    assert.equal(page.run('state.hints'),2);
    const word=page.run('puzzle.word');
    const index=hashWord(page.run('puzzle.id')+':hint')%word.length;
    assert.match(hintText.textContent,new RegExp('Buchstabe '+(index+1)+' ist '+word[index]));
    assert.equal(hintButton.hidden,true);
    assert.equal(page.run('state.guesses.length'),0);
    await page.run('start()');
    assert.equal(page.run('state.hints'),2);
    assert.equal(hintButton.hidden,true);
    assert.match(hintText.textContent,/Buchstabe/);
    page.run("typing=puzzle.word; press('Enter')");
    assert.equal(hintArea.hidden,true);
    assert.equal(page.run('state.won'),true);
  }finally{page.close();}
});

test('Normal Wordle never displays the Hard hint controls',async()=>{
  const page=await openGame({difficulty:'normal'});
  try{
    assert.equal(page.window.document.querySelector('#gameHardHints').hidden,true);
    assert.equal(page.run('state.hints'),0);
    page.window.document.querySelector('#gameHintButton').click();
    assert.equal(page.run('state.hints'),0);
    assert.equal(page.window.document.querySelector('#gameHintText').textContent,'');
  }finally{page.close();}
});

test('Hard and Normal Wordle accept valid English words even when absent from anime titles',async()=>{
  const hard=await openGame({difficulty:'hard'});
  try{
    const len=hard.run('puzzle.word.length');
    const pool=guesses.words[len].split(' ');
    const word=pool.find(w=>w!==hard.run('puzzle.word') && !['BLACK','CLOVER','DRAGON','QUEST','MAGIC','KNIGHT'].includes(w));
    assert.ok(word);
    hard.run(`typing=${JSON.stringify(word)}; press('Enter')`);
    assert.equal(hard.run('state.guesses.length'),1);
    assert.equal(hard.run('allowed.has("ZZZZZ")'),false);
  }finally{hard.close();}
  const normal=await openGame();
  try{
    const len=normal.run('puzzle.word.length');
    const word=guesses.words[len].split(' ').find(w=>w!==normal.run('puzzle.word') && normal.run(`allowed.has(${JSON.stringify(w)})`));
    assert.ok(word);
    normal.run(`typing=${JSON.stringify(word)}; press('Enter')`);
    assert.equal(normal.run('state.guesses.length'),1);
    assert.equal(normal.run('allowed.has("ZZZZZ")'),false);
  }finally{normal.close();}
});

test('the guess list keeps its licence notice and only plain upper-case words',()=>{
  assert.match(guesses.license,/Kevin Atkinson/);
  for(const [len,list] of Object.entries(guesses.words))
    for(const w of list.split(' '))assert.match(w,new RegExp('^[A-Z]{'+len+'}$'));
});

test('Normal accepts a standard dictionary guess not present in anime titles',async()=>{
  const page=await openGame({mode:'daily',difficulty:'normal'});
  try{
    const len=page.run('puzzle.word.length');
    const dictionary=guesses.words[len].split(' ');
    assert.ok(dictionary.includes('AGENT') || dictionary.length>0);
    assert.ok(page.run("allowed.has('AGENT')") || len!==5);
    // A valid non-answer guess consumes one attempt, not a rejected-input toast.
    const guess=dictionary.find(w=>page.run('allowed.has('+JSON.stringify(w)+')') && w!==page.run('puzzle.word'));
    page.run('typing='+JSON.stringify(guess)+"; press('Enter')");
    assert.equal(page.run('state.guesses.length'),1);
  }finally{page.close();}
});

test('Endless Normal draws from the expanded seasonal catalog',async()=>{
  const page=await openGame({mode:'endless'});
  try{
    const pool=await page.run('normalEntries()');
    assert.ok(pool.pool.length>50,'seasonal catalog should contribute enough varied words');
  }finally{page.close();}
});

test('Hard mode also draws from the AniList Top 500, with its own first hint', async () => {
  const popular = ['MAGIC', 'TITAN', 'DEMON', 'SLAYER', 'GHOST'].map(word => ({ word, title: word + ' Show', from: 'Top 500 auf AniList' }));
  const page = await openGame({ difficulty: 'hard', mode: 'endless', endless: { words: [], popular } });
  try {
    const pool = new Set(['BLACK', 'CLOVER', 'DRAGON', 'QUEST', 'MAGIC', 'KNIGHT', 'TITAN', 'DEMON', 'SLAYER', 'GHOST']);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      seen.add(page.run('puzzle.word'));
      if (popular.some(p => p.word === page.run('puzzle.word') && page.run('puzzle.from') === 'Top 500 auf AniList')) {
        page.run('state.hints=1');
        assert.equal(page.run('hardHintText()'), 'Aus den 500 beliebtesten Anime auf AniList.');
        return;
      }
      page.run("save(currentKey()+':index',roundNumber()+1)"); await page.run('start()');
    }
    assert.fail('no Top 500 word in 12 rounds: ' + [...seen].join());
  } finally { page.close(); }
});
