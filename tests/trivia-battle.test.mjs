import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../trivia-core.js',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(src+';globalThis.core=TriviaCore;',ctx);
const core=ctx.core;
const plan=[{romaji:'Shou A',english:'Show A'},{romaji:'Shou B',english:'Show B'}];
const catalog=[{romaji:'Shou A',english:'Show A',mal:'https://myanimelist.net/anime/1234'},{romaji:'Shou B',english:'Show B',mal:'https://myanimelist.net/anime/5678'}];
test('matches catalog titles exactly and uses safe MAL IDs',()=>{
 const list=core.matchShows(plan,catalog);
 assert.deepEqual([...list].map(x=>x.id),[1234,5678]);
 assert.equal(core.matchShows([{romaji:'Unknown'}],catalog).length,0);
 assert.equal(core.matchShows([{romaji:'Shou A'}],[{...catalog[0],mal:'https://evil.example/anime/1234'}]).length,0);
});
const items=[
 {title:'Alpha',genres:['Action','Fantasy'],studios:['Studio A']},
 {title:'Beta',genres:['Drama','Romance'],studios:['Studio B']},
 {title:'Gamma',genres:['Comedy','Slice of Life'],studios:['Studio C']},
 {title:'Delta',genres:['Mystery','Thriller'],studios:['Studio D']},
 {title:'Epsilon',genres:['Sports','Action'],studios:['Studio E']}
];
test('every trivia question has four distinct answers and one correct answer',()=>{
 const questions=core.questions(items,()=>0.37);
 assert.ok(questions.length>=10);
 for(const q of questions){
  assert.equal(q.options.length,4);
  assert.equal(new Set(q.options).size,4);
  assert.equal(q.options.filter(x=>x===q.correct).length,1);
  assert.ok(q.prompt);
 }
});
test('genre distractors are not genres of the question anime',()=>{
 const questions=core.questions(items,()=>0.37);
 for(const q of questions.filter(q=>q.prompt.startsWith('Welches Genre'))){
  const title=q.prompt.match(/„(.+?)“/)[1];
  const genres=items.find(x=>x.title===title).genres;
  assert.ok(genres.includes(q.correct));
  assert.ok(q.options.filter(x=>x!==q.correct).every(x=>!genres.includes(x)));
 }
});
test('studio distractors cannot be correct for the same anime',()=>{
 const questions=core.questions(items,()=>0.37);
 for(const q of questions.filter(q=>q.prompt.startsWith('Welches Studio'))){
  const title=q.prompt.match(/„(.+?)“/)[1];
  const studios=items.find(x=>x.title===title).studios;
  assert.ok(q.options.filter(x=>x!==q.correct).every(x=>!studios.includes(x)));
 }
});
test('awards points only for the correct answer',()=>{
 assert.equal(core.score('Ja','Ja'),100);
 assert.equal(core.score('Nein','Ja'),0);
});
