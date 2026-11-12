import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../tierlist.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../tierlist.html',import.meta.url),'utf8');
const section=js.slice(js.indexOf('function normalizedTiers('),js.indexOf('function loadTiers()'));
assert.ok(section.includes('function prepareTierState('));
const {normalizedTiers,prepareTierState,removeTierFromRanking}=new Function(
  'const DEFAULT_TIERS=["S","A","B","C","D"].map(id=>({id,name:id}));'+
  'const MAX_TIERS=12,POOL="pool",keyOf=show=>show.romaji||show.english;'+
  section+'\nreturn {normalizedTiers,prepareTierState,removeTierFromRanking};')();

const shows=[{romaji:'Show 1'},{romaji:'Show 2'},{romaji:'Show 3'},{romaji:'Show 4'}];

test('old S–D tiers remain the default and layout validates custom names',()=>{
  assert.deepEqual(normalizedTiers(null).map(x=>x.id),['S','A','B','C','D']);
  const custom=normalizedTiers([{id:'S',name:'Legendary'},{id:'extra1',name:'Fun'}]);
  assert.deepEqual(custom,[{id:'S',name:'Legendary'},{id:'extra1',name:'Fun'}]);
  assert.equal(normalizedTiers([{id:'pool',name:'overwrite'}]).length,5);
  assert.equal(normalizedTiers([{id:'S',name:'duplicate'},{id:'S',name:'duplicate'}]).length,5);
  assert.equal(normalizedTiers([]).length,5);
});

test('removed tier safely returns its anime to unranked pool, preserving other rankings',()=>{
  const existing={S:['Show 1'],extra1:['Show 2','Show 3'],pool:['Show 4']};
  const after=removeTierFromRanking(existing,'extra1');
  assert.deepEqual(after.S,['Show 1']);
  assert.deepEqual(after.pool,['Show 4','Show 2','Show 3']);
  assert.ok(!('extra1' in after));
  assert.deepEqual(existing.extra1,['Show 2','Show 3'],'does not mutate saved input');
});

test('hidden anime remain ranked when showing only one member’s shows',()=>{
  const existing={S:['Show 1','Show 2'],A:['Show 3'],pool:['Show 4']};
  const prepared=prepareTierState(existing,['S','A'],shows);
  assert.deepEqual(prepared.S,['Show 1','Show 2']);
  assert.deepEqual(prepared.A,['Show 3']);
  assert.deepEqual(prepared.pool,['Show 4']);
  const hiddenFromUI=new Set(['Show 1','Show 3']);
  assert.deepEqual(prepared.S.filter(k=>hiddenFromUI.has(k)),['Show 1']);
  assert.deepEqual(prepared.S,['Show 1','Show 2'],'filtering display must not change saved assignment');
});

test('unrecognized previous tier rows recover into the pool without dropping anime',()=>{
  const prepared=prepareTierState({S:['Show 1'],removed:['Show 2'],pool:['Show 3']},['S'],shows);
  assert.deepEqual(prepared.S,['Show 1']);
  assert.deepEqual(prepared.pool,['Show 3','Show 2','Show 4']);
});

test('tier editor is compact; copy uses custom tier labels, and reset preserves row layout',()=>{
  assert.match(html,/id="tierEditor"/);
  assert.match(html,/id="tierAdd"/);
  assert.match(html,/id="tierEditorRows"/);
  assert.match(js,/\$\('tierCopy'\)\.onclick/);
  assert.match(js,/\*\*\$\{t\.name\}:\*\*/);
  assert.match(js,/localStorage\.removeItem\(storeKey\(\)\)/);
  assert.doesNotMatch(js,/localStorage\.removeItem\(layoutKey\(\)\)/);
  assert.match(js,/tiers\.length\s*<=\s*1/);
});
