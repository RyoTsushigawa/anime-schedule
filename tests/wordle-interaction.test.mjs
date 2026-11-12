import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {
  englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,
  hardHintError,hashWord,pickEntry
} from '../games-logic.mjs';
import {ENGLISH_GUESSES} from '../games-guesses.mjs';

const game=readFileSync(new URL('../games.js',import.meta.url),'utf8')
  .replace(/^import .* from '\.\/games-logic\.mjs';\s*/m, '')
  .replace(/^import .* from '\.\/games-guesses\.mjs';\s*/m, '');
const html=readFileSync(new URL('../games.html',import.meta.url),'utf8');
const daily=JSON.parse(readFileSync(new URL('../games-words.json',import.meta.url),'utf8'));

async function openGame({mode='daily',difficulty='normal',accounts=['Belly']}={}){
  const dom=new JSDOM(html,{url:'https://example.test/games.html',runScripts:'outside-only'});
  const {window}=dom,ctx=dom.getInternalVMContext(),requests=[];
  window.localStorage.setItem('titleGameMode',JSON.stringify(mode));
  window.localStorage.setItem('titleGameDifficulty',JSON.stringify(difficulty));
  Object.assign(window,{englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,
    hardHintError,hashWord,pickEntry,ENGLISH_GUESSES});
  window.fetch=async(url,options)=>{
    requests.push({url,options});
    let data;
    if(url==='games-words.json')data=daily;
    else if(url==='tabs.json')data=[];
    else if(url==='config.json')data={};
    else if(url==='wrapped-profiles.json')
      data=Object.fromEntries(accounts.map((name,i)=>['Member'+i,[{name,provider:'anilist'}]]));
    else if(url==='https://graphql.anilist.co')
      data={data:{Page:{pageInfo:{hasNextPage:false},mediaList:[
        {media:{title:{english:'Black Clover'}}},
        {media:{title:{english:'Dragon Quest'}}},
        {media:{title:{english:'Magic Knight'}}}
      ]}}};
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
    assert.match(page.window.document.querySelector('#gameMsg').textContent,/englischen Wörterbuch/);
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
      assert.match(body.query,/mediaList\(userName:\$user,type:ANIME\)/);
      assert.doesNotMatch(body.query,/mutation/i);
    }
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

test('AGENT is accepted as a valid five-letter guess even when absent from anime titles',async()=>{
  const page=await openGame();
  try {
    assert.ok(ENGLISH_GUESSES.has('AGENT'));
    assert.ok(!titleEntries([daily.words[0].title], 'Guckplan').some(x=>x.word==='AGENT'));
    page.run("puzzle.word='BLACK'; state.word='BLACK'; typing='AGENT'; press('Enter')");
    assert.deepEqual([...page.run('state.guesses')], ['AGENT']);
    assert.equal(page.run('state.done'),false);
  }finally{page.close();}
});

test('nonsense guesses remain invalid, even when length is correct',async()=>{
  const page=await openGame();
  try {
    page.run("puzzle.word='BLACK'; state.word='BLACK'; typing='ZZZZZ'; press('Enter')");
    assert.equal(page.run('state.guesses.length'),0);
    assert.match(page.window.document.querySelector('#gameMsg').textContent,/englischen Wörterbuch/);
  }finally{page.close();}
});
