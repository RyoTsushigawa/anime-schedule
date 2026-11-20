import test from 'node:test';
import assert from 'node:assert/strict';
import { fairValue, troddlEffect } from '../boerse-core.mjs';
import { troddlRatings, updateSeason } from '../tools/boerse-prices.mjs';
// Börse × Troddl: the group's reviews nudge the fair value, at most ±5 %, from two reviews
test('the Troddlrating\'s effect: 70 neutral, ±1 % per 4 points, at most ±5 %; none without a rating', () => {
  assert.equal(troddlEffect(70), 0);
  assert.equal(troddlEffect(80), 0.025);
  assert.equal(troddlEffect(90), 0.05);
  assert.equal(troddlEffect(100), 0.05);
  assert.equal(troddlEffect(50), -0.05);
  assert.equal(troddlEffect(null), 0);
  assert.equal(Math.round(fairValue({ community: 70, troddl: 90 }) * 100) / 100, 105);
  assert.equal(fairValue({ community: 70 }), 100);
});
test('reviews → Troddlrating per show title, only from two reviews and only the season\'s shows', () => {
  const byId = new Map([[1, 'Blue Box'], [2, 'Ranma']]);
  const r = troddlRatings([{ mediaId: 1, score: 90 }, { mediaId: 1, score: 80 }, { mediaId: 2, score: 40 }, { mediaId: 9, score: 10 }, { mediaId: 9, score: 20 }], byId);
  assert.deepEqual([...r], [['Blue Box', 85]]);
});
test('the same show closes higher with a good Troddlrating and lower with a bad one, all else equal', async () => {
  const shows = [{ title: 'A' }], media = new Map([['A', { averageScore: 70 }]]);
  const close = async troddl => {
    let season = await updateSeason(undefined, shows, '2026-11-20', { media, ratings: new Map() });
    season = await updateSeason(season, shows, '2026-11-21', { media, ratings: new Map(), troddl });
    return season.shows.A;
  };
  const good = await close(new Map([['A', 90]])), none = await close(new Map()), bad = await close(new Map([['A', 50]]));
  assert.ok(good.closes[1] > none.closes[1] && none.closes[1] > bad.closes[1], [good.closes[1], none.closes[1], bad.closes[1]].join(' > '));
  assert.equal(good.troddl, 90);
  assert.equal(none.troddl, null);
});
