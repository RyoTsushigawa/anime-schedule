import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickEndlessEntry } from '../games-logic.mjs';
import { endlessWords } from '../tools/games-endless.mjs';
// Endless Titel-Rätsel: enough answers, a new order every pass and per player, no repeats for 60 rounds

const pool = Array.from({ length: 200 }, (_, i) => ({ word: 'W' + String(i).padStart(4, '0'), title: 'T' + i }));
const play = (seed, rounds) => { let recent = [], out = []; for (let r = 0; r < rounds; r++) { const e = pickEndlessEntry(pool, r, seed, recent); out.push(e.word); recent = [...recent.filter(w => w !== e.word), e.word].slice(-60); } return out; };

test('every word once per pass, no repeat within 60 rounds, also across passes', () => {
  const a = play('p1', 600);
  assert.equal(new Set(a.slice(0, 200)).size, 200);
  const last = new Map(); let gap = Infinity;
  a.forEach((w, i) => { if (last.has(w)) gap = Math.min(gap, i - last.get(w)); last.set(w, i); });
  assert.ok(gap > 60, String(gap));
});

test('the order changes with every pass and differs between players', () => {
  const a = play('p1', 400), b = play('p2', 400);
  assert.notDeepEqual(a.slice(0, 20), a.slice(200, 220));
  assert.notDeepEqual(a.slice(0, 20), b.slice(0, 20));
  assert.deepEqual(play('p1', 50), a.slice(0, 50), 'the same player and round give the same puzzle (a reload keeps it)');
});

test('a tiny pool still works', () => {
  const small = pool.slice(0, 3);
  assert.ok(small.some(e => e.word === pickEndlessEntry(small, 7, 's', ['W0000']).word));
});

test('the word list: real English words of 5-8 letters from titles, each once', () => {
  const dict = new Set(['ABYSS', 'DRAGON', 'SCHOOL', 'MAGIC', 'IN']);
  const words = endlessWords([{ title: 'Made in Abyss', from: 'A' }, { title: 'Dragon Magic School', from: 'B' }, { title: 'Magic Kaito', from: 'C' }], dict);
  assert.deepEqual(words.map(w => w.word), ['ABYSS', 'DRAGON', 'MAGIC', 'SCHOOL']);
  assert.equal(words.find(w => w.word === 'MAGIC').title, 'Dragon Magic School', 'the first title it appears in');
  // names: from English titles any word, from romaji titles only dictionary words
  const named = endlessWords([{ title: 'Ranma½', from: 'S', english: true }, { title: 'Chitose Is in the Ramune Bottle', from: 'S', english: true },
    { title: 'Kimetsu no Yaiba', from: 'Top 100' }, { title: "Isn't It Shoujo", from: 'S', english: true }], dict).map(w => w.word);
  assert.ok(['RANMA', 'CHITOSE', 'RAMUNE', 'BOTTLE'].every(w => named.includes(w) || w === 'BOTTLE'), named.join());
  assert.ok(!named.includes('KIMETSU') && !named.includes('YAIBA'), 'romaji lists stay dictionary-only');
  assert.ok(named.includes('SHOUJO'), 'an English title counts as a whole');
  const shipped = JSON.parse(readFileSync(new URL('../games-endless.json', import.meta.url), 'utf8')).words;
  assert.ok(shipped.length >= 400, 'the shipped list has hundreds of answers');
  assert.ok(shipped.every(w => /^[A-Z]{5,8}$/.test(w.word) && w.title));
});
