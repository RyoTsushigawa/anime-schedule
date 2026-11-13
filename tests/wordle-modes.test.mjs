import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {englishTitleWords,titleEntries,approvedDailyEntries,scoreGuess,hardHintError,pickEntry,pickFreshEntry} from '../games-logic.mjs';

const data=JSON.parse(readFileSync(new URL('../games-words.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../games.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../games.js',import.meta.url),'utf8');

test('all daily answers are curated English words actually present in supplied English titles',()=>{
  const valid=approvedDailyEntries(data.words);
  assert.equal(valid.length,data.words.length,'no answer is a transliteration or invented string');
  for(const entry of valid) {
    assert.ok(/^[A-Z]{5,8}$/.test(entry.word));
    assert.ok(englishTitleWords(entry.title).includes(entry.word),entry.word+' not in '+entry.title);
  }
  assert.equal(valid[0].word,'INHUMANS');
  assert.equal(valid[1].word,'ZOMBIE');
});

test('only whole English title words are accepted: no transliterations, made-up words or punctuation fragments',()=>{
  assert.deepEqual(englishTitleWords('Black Clover: Attack of the Goblin'),['BLACK','CLOVER','ATTACK','GOBLIN']);
  assert.deepEqual(englishTitleWords('Sasaki, Kurumi-chan and Yozakura'),[]);
  assert.ok(!englishTitleWords('HYPERGOBLIN').includes('GOBLIN'));
  assert.deepEqual(englishTitleWords('Even Though I Accepted the Bet From My Fiancé').filter(w=>w==='FIANCE'),['FIANCE']);
});

test('Hard hint rules preserve green letters and required yellows including repeated letters',()=>{
  assert.deepEqual(scoreGuess('LEVEL','LEVER'),['hit','hit','hit','hit','miss']);
  assert.match(hardHintError('BLACK',['CLOVER'],'CLOVER'),/Position|mindestens|darf nicht/);
  const bad=hardHintError('BLACK',['CLOVER'],'CLOVER');
  assert.ok(bad,'must refuse a guess that disregards green clues');
});

test('Endless picks distinct answers before wrapping over the same source pool',()=>{
  const pool=titleEntries(['Black Clover','Dragon Quest','Magic Knight','Firefly Wedding'],'Guckplan');
  const guesses=pool.map((_,i)=>pickEntry(pool,i,'endless:normal').word);
  assert.equal(new Set(guesses).size,pool.length);
  assert.equal(pickEntry(pool,pool.length,'endless:normal').word,guesses[0]);
});

test('game mode selection, strict dictionary and separate stats are wired up',()=>{
  assert.match(html,/id="gameMode"/);
  assert.match(html,/id="gameDifficulty"/);
  assert.match(html,/id="gameNextRound"/);
  assert.match(code,/if\(!allowed\.has\(typing\)\)return message/);
  assert.match(code,/hardHintError\(typing,state\.guesses,puzzle\.word\)/);
  assert.match(code,/\$\('gameNextRound'\)\.onclick/);
  assert.match(code,/titleGameStats:v2:/);
  assert.match(code,/wrapped-profiles\.json/);
  assert.match(code,/MediaListCollection\(userName:\$user,type:ANIME\)/);
  assert.match(html,/type="module" src="games\.js"/);
});

test('Hard Endless avoids the last twenty answers when alternative title words exist',()=>{
  const pool=titleEntries(['Black Clover','Dragon Quest','Magic Knight','Firefly Wedding','Secret Garden'],'AniList');
  const first=pickFreshEntry(pool,0,'endless:belly',[]);
  const next=pickFreshEntry(pool,0,'endless:belly',[first.word]);
  assert.notEqual(next.word,first.word);
  const later=pickFreshEntry(pool,0,'endless:belly',[first.word,next.word]);
  assert.ok(![first.word,next.word].includes(later.word));
  assert.equal(pickFreshEntry([first],0,'endless:belly',[first.word]).word,first.word,
    'only repeat when there are no alternatives');
});
