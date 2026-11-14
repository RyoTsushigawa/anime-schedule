import test from 'node:test';
import assert from 'node:assert/strict';
import { CASH, marketOpen, tradingWindow, priceOf, dropValue, fairValue, nextClose, noise, halted, trade, settle, accountValue, ranking } from '../boerse-core.mjs';
import { seasonShows, updateSeason } from '../tools/boerse-prices.mjs';
// Anime-Börse: the daily market (prices from AniList and the group), trading rules like Wall Street

test('trading runs from 14 days before the season starts until the next season starts', () => {
  const at = iso => Date.parse(iso);
  assert.equal(tradingWindow('Winter 2027', at('2026-12-17T12:00:00Z')).open, false);
  assert.equal(tradingWindow('Winter 2027', at('2026-12-19T12:00:00Z')).open, true);
  assert.equal(tradingWindow('Winter 2027', at('2027-03-30T12:00:00Z')).open, true);
  assert.equal(tradingWindow('Winter 2027', at('2027-04-01T12:00:00Z')).open, false);
  assert.equal(tradingWindow('Herbst 2026', at('2026-11-13T12:00:00Z')).open, true);
  assert.equal(tradingWindow('Guckplan Herbst 2026'), null);
});

test('drops cost value, the earlier the more; never more than the given score', () => {
  const drop = (progress, episodes, score = 0) => ({ status: 'DROPPED', progress, episodes, score });
  assert.equal(dropValue(drop(1, 12)), 0);
  assert.equal(dropValue(drop(6, 12)), 18);
  assert.equal(dropValue(drop(12, 12)), 40);
  assert.equal(dropValue(drop(3, null)), 7, 'unknown length: 12 episodes');
  assert.equal(dropValue(drop(2, 12, 90)), 4, 'a high score does not save a drop');
  assert.equal(priceOf([{ score: 90 }, { score: 80 }, drop(1, 12)]), 113);
  assert.equal(priceOf([]), 100);
});

test('fair value blends AniList (70 = par) with the group (60 = par), the group weighing more with more ratings', () => {
  assert.equal(fairValue({}), 100);
  assert.equal(Math.round(fairValue({ community: 84 })), 120);
  assert.equal(Math.round(fairValue({ community: 70, group: 90, groupCount: 5 })), 138);
  assert.ok(fairValue({ community: 70, group: 30, groupCount: 5 }) < fairValue({ community: 70, group: 30, groupCount: 1 }));
});

test('a day\'s close moves towards the fair value, with momentum, drop shocks, noise; circuit breaker at -7 %', () => {
  const base = { prev: 100, fair: 130, seed: 'x' };
  const up = nextClose(base);
  assert.ok(up > 108 && up < 112, String(up));
  assert.ok(nextClose({ ...base, popNow: 1100, popBefore: 1000 }) > up, 'members gained push it');
  const early = nextClose({ ...base, newDrops: [{ progress: 1, episodes: 12 }] }), late = nextClose({ ...base, newDrops: [{ progress: 11, episodes: 12 }] });
  assert.ok(early < late && early < 100, `${early} ${late}`);
  assert.equal(nextClose(base), nextClose(base), 'the same for everyone');
  for (let i = 0; i < 50; i++) assert.ok(Math.abs(noise('d' + i)) <= 0.015);
  assert.equal(halted(93, 100), true);
  assert.equal(halted(94, 100), false);
});

test('trades: fee, T+1, short sales up to 1000 Taler, circuit breaker; value and ranking', () => {
  const prices = new Map([['A', 100], ['B', 50]]);
  let a = trade({ cash: CASH }, { title: 'A', qty: 3, price: 100, today: '2027-01-04' }, prices);
  assert.equal(a.cash, 699);
  a = trade(a, { title: 'A', qty: -1, price: 100, today: '2027-01-04' }, prices);
  assert.deepEqual(a.pending, [{ amount: 99, on: '2027-01-05' }]);
  assert.throws(() => trade(a, { title: 'B', qty: 14, price: 50, today: '2027-01-04' }, prices), /nächsten Tag/);
  assert.equal(settle(a, '2027-01-05').cash, 798);
  a = trade(a, { title: 'B', qty: -20, price: 50, today: '2027-01-04' }, prices);
  assert.equal(a.holdings.B, -20);
  assert.throws(() => trade(a, { title: 'B', qty: -1, price: 50, today: '2027-01-04' }, prices), /1000 Taler/);
  assert.throws(() => trade(a, { title: 'A', qty: 1, price: 100, today: '2027-01-04', halt: true }, prices), /Circuit Breaker/);
  assert.throws(() => trade(a, { title: 'A', qty: 0, price: 100, today: '2027-01-04' }, prices), /Anzahl/);
  // short B falls to 30: the short gains
  const later = new Map([['A', 100], ['B', 30]]);
  assert.equal(accountValue(a, later), 699 + 99 + 999 + 200 - 600);
  assert.deepEqual(ranking([{ person: 'Rei', ...a }, { person: 'Mia', cash: CASH }], later).map(r => r.person), ['Rei', 'Mia']);
});

test('the price job: shows from the Guckplan, one close per day, the same day recomputed, new drops shock once', async () => {
  const csv = ',Sort,Slot,Anime Titel,Eng Anime Titel,Startdatum\n,,1,Alpha Romaji,Alpha,01.10.2026\n,,1,Beta Romaji,,02.10.2026\n,,1,Hidden,Hidden EN,\n';
  assert.deepEqual(seasonShows(csv, [4]).map(s => s.title), ['Alpha', 'Beta Romaji']);
  const shows = seasonShows(csv, [4]);
  const media = new Map([['Alpha', { id: 1, averageScore: 84, popularity: 1000 }]]);
  let s = await updateSeason(undefined, shows, '2026-11-13', { media, ratings: new Map() });
  assert.deepEqual(s.shows.Alpha.closes, [100]);
  s = await updateSeason(s, shows, '2026-11-14', { media, ratings: new Map() });
  const first = s.shows.Alpha.closes[1];
  assert.ok(first > 100);
  s = await updateSeason(s, shows, '2026-11-14', { media, ratings: new Map() });
  assert.deepEqual(s.days, ['2026-11-13', '2026-11-14']);
  assert.equal(s.shows.Alpha.closes[1], first, 'a second run the same day gives the same close');
  const dropped = new Map([['Alpha', [{ user: 'u', status: 'DROPPED', progress: 1, episodes: 12, score: 0 }]]]);
  s = await updateSeason(s, shows, '2026-11-15', { media, ratings: dropped });
  assert.ok(s.shows.Alpha.closes[2] < first * 0.85, 'an early drop crashes it');
  assert.equal(s.shows.Alpha.halted, '2026-11-16', 'halted the next trading day');
  s = await updateSeason(s, shows, '2026-11-16', { media, ratings: dropped });
  assert.equal(s.shows.Alpha.drops, 1);
  assert.equal(s.shows.Alpha.halted, undefined, 'only for that one day');
});

test('opening hours: 8:00 to 22:00 German time, summer and winter time', () => {
  const at = iso => Date.parse(iso);
  assert.equal(marketOpen(at('2026-11-14T06:59:00Z')), false); // 7:59 winter time
  assert.equal(marketOpen(at('2026-11-14T07:00:00Z')), true); // 8:00
  assert.equal(marketOpen(at('2026-11-14T20:59:00Z')), true); // 21:59
  assert.equal(marketOpen(at('2026-11-14T21:00:00Z')), false); // 22:00
  assert.equal(marketOpen(at('2027-07-01T06:00:00Z')), true); // 8:00 summer time
  assert.equal(marketOpen(at('2027-07-01T20:00:00Z')), false); // 22:00 summer time
});

test('season borders are midnight German time, in summer time too', () => {
  // Sommer 2027 starts 1 Jul 00:00 CEST = 30 Jun 22:00 UTC and ends 1 Oct 00:00 CEST
  const w = tradingWindow('Sommer 2027', 0);
  assert.equal(new Date(w.to).toISOString(), '2027-09-30T22:00:00.000Z');
  assert.equal(new Date(w.from + 14 * 86400000).toISOString(), '2027-06-30T22:00:00.000Z');
  // Herbst ends at New Year in winter time; Winter ends 1 Apr in summer time
  assert.equal(new Date(tradingWindow('Herbst 2026', 0).to).toISOString(), '2026-12-31T23:00:00.000Z');
  assert.equal(new Date(tradingWindow('Winter 2027', 0).to).toISOString(), '2027-03-31T22:00:00.000Z');
});
