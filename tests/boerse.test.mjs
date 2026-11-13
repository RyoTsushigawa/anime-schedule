import test from 'node:test';
import assert from 'node:assert/strict';
import { CASH, tradingWindow, priceOf, portfolioValue, ranking } from '../boerse-core.mjs';
// Anime-Börse: the rules (prices from the group's ratings, the trading window, values and the ranking)

test('trading window: 14 days around the season start, for every season name', () => {
  const at = iso => Date.parse(iso);
  assert.equal(tradingWindow('Winter 2027', at('2026-12-19T12:00:00Z')).open, true);
  assert.equal(tradingWindow('Winter 2027', at('2026-12-17T12:00:00Z')).open, false);
  assert.equal(tradingWindow('Frühling 2027', at('2027-04-10T12:00:00Z')).open, true);
  assert.equal(tradingWindow('Herbst 2026', at('2026-11-13T12:00:00Z')).open, false);
  assert.equal(tradingWindow('Guckplan Herbst 2026'), null);
});

test('price: the group\'s average score × 2; dropped without a score is 30; unrated stays 100', () => {
  assert.equal(priceOf([]), 100);
  assert.equal(priceOf([{ score: 0, status: 'CURRENT' }]), 100);
  assert.equal(priceOf([{ score: 80 }, { score: 70 }]), 150);
  assert.equal(priceOf([{ score: 0, status: 'DROPPED' }, { score: 90 }]), 120);
  assert.equal(priceOf([{ score: 50 }]), 100);
});

test('portfolio value and ranking: unspent Taler count, shares at today\'s price', () => {
  const prices = new Map([['Frieren', 170], ['Dandadan', 60]]);
  assert.equal(portfolioValue({}, prices), CASH);
  assert.equal(portfolioValue({ Frieren: 6, Dandadan: 4 }, prices), 6 * 170 + 4 * 60);
  assert.equal(portfolioValue({ Frieren: 2 }, prices), 800 + 340);
  assert.equal(portfolioValue({ Unknown: 1 }, prices), 1000, 'no price yet: the buying price');
  const board = ranking([{ person: 'Rei', holdings: { Dandadan: 10 } }, { person: 'Mia', holdings: { Frieren: 5 } }], prices);
  assert.deepEqual(board.map(r => [r.person, r.value]), [['Mia', 1350], ['Rei', 600]]);
});
