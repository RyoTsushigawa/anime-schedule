import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { berlinDay, buildRounds, hashSeed, MAL_IDS, scoreAnswers } from '../cover-core.mjs';

const pool = MAL_IDS.map(id => ({
  idMal: id,
  title: { english: 'Anime ' + id },
  coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/' + id + '.jpg' }
}));

test('the quiz selects five deterministic questions and distinct choices', () => {
  const first = buildRounds(pool, '2026-11-12');
  assert.deepEqual(first, buildRounds(pool.slice().reverse(), '2026-11-12'));
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map(q => q.target.id)).size, 5);
  for (const question of first) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map(x => x.id)).size, 4);
    assert.ok(question.options.some(x => x.id === question.target.id));
  }
});
test('questions change with the day', () => {
  assert.notDeepEqual(buildRounds(pool, '2026-11-12'), buildRounds(pool, '2026-11-13'));
  assert.notEqual(hashSeed('2026-11-12'), hashSeed('2026-11-13'));
});
test('incomplete or duplicate cover metadata is excluded', () => {
  assert.equal(buildRounds(pool.slice(0, 3), '2026-11-12').length, 0);
  const rounds = buildRounds([...pool, {...pool[0]}, {idMal: 9999, title: { english: 'No image' }}], '2026-11-12');
  assert.equal(rounds.length, 5);
  assert.equal(new Set(rounds.map(x => x.target.id)).size, 5);
});
test('scoring only awards correct choices', () => {
  const rounds = buildRounds(pool, '2026-11-12');
  assert.equal(scoreAnswers(rounds, rounds.map(x => x.target.id)), 500);
  assert.equal(scoreAnswers(rounds, Array(5).fill(-1)), 0);
  assert.equal(scoreAnswers(rounds, [rounds[0].target.id]), 100);
});
test('date is stable in the German timezone', () => {
  assert.equal(berlinDay(new Date('2026-11-11T23:30:00Z')), '2026-11-12');
});
test('the game has a linked accessible page with restricted AniList access', () => {
  const html=readFileSync(new URL('../cover-game.html', import.meta.url), 'utf8');
  const hub=readFileSync(new URL('../games.html', import.meta.url), 'utf8');
  const css=readFileSync(new URL('../cover-game.css', import.meta.url), 'utf8');
  assert.match(hub, /href="cover-game\.html"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /connect-src 'self' https:\/\/graphql\.anilist\.co/);
  assert.match(css, /\.cover-choice\.right/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
