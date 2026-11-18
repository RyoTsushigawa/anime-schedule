import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, scoreClass, seasonLabel, seasonKey } from '../troddl-core.mjs';
test('the Troddlrating is the rounded average from two reviews on; the newest review comes first', () => {
  const shows = summarize([
    { mediaId: 1, title: 'A', score: 80, at: '2026-11-01' }, { mediaId: 1, title: 'A', score: 65, at: '2026-11-05' },
    { mediaId: 2, title: 'B', score: 90, at: '2026-11-02' }]);
  assert.equal(shows.get(1).rating, 73);
  assert.equal(shows.get(1).latest.score, 65);
  assert.equal(shows.get(2).rating, null);
  assert.equal(shows.get(2).count, 1);
});
test('colours like Metacritic, seasons in German and in order', () => {
  assert.deepEqual([75, 74, 50, 49, null].map(scoreClass), ['good', 'mixed', 'mixed', 'bad', 'tbd']);
  assert.equal(seasonLabel({ season: 'FALL', seasonYear: 2026 }), 'Herbst 2026');
  assert.ok(seasonKey('Winter 2027') > seasonKey('Herbst 2026'));
  assert.ok(seasonKey('Herbst 2026') > seasonKey('Sommer 2026'));
});
