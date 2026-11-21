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

test('critic profile: count, average and how strict next to the others', async () => {
  const { critic, leanText } = await import('../troddl-core.mjs');
  const reviews = [
    { pen: 'Drache', mediaId: 1, score: 60, at: '2026-10-01' }, { pen: 'Stern', mediaId: 1, score: 80, at: '2026-10-02' }, { pen: 'Mond', mediaId: 1, score: 90, at: '2026-10-03' },
    { pen: 'Drache', mediaId: 2, score: 70, at: '2026-11-01' }, { pen: 'Stern', mediaId: 2, score: 76, at: '2026-11-02' },
    { pen: 'Drache', mediaId: 3, score: 50, at: '2026-11-05' },
  ];
  const c = critic(reviews, 'Drache');
  assert.equal(c.count, 3);
  assert.equal(c.average, 60);
  assert.deepEqual(c.reviews.map(r => r.mediaId), [3, 2, 1]); // newest first
  assert.equal(c.lean, -15); // (60−85 + 70−76) / 2 = −15.5, show 3 has no one else
  assert.equal(leanText(c), '15 Punkte strenger als die anderen (bei 2 gemeinsamen Anime)');
  assert.equal(leanText(critic(reviews, 'Stern')), '6 Punkte großzügiger als die anderen (bei 2 gemeinsamen Anime)');
  assert.equal(leanText(critic([{ pen: 'X', mediaId: 9, score: 70, at: '1' }], 'X')), 'teilt noch keinen Anime mit den anderen');
});
