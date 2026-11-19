import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, counts, spares, wants, completion, packOdds, worth, tradeFor, matches, ownMoves, onAccounts } from '../pocket/core.mjs';

// a tiny set: one pack, two commons, two uncommons, one star (2★, tradeable) and one crown (not tradeable)
const data = {
  sets: [{ code: 'T1', release: '2026-01-01', name: { en: 'Test', de: 'Test' }, packs: ['Alpha'] }, { code: 'PROMO-A', release: '2024-01-01', name: { en: 'Promo' }, packs: [] }],
  rarities: { C: { label: 'Common', group: 'Diamond', count: 1, tradeable: true, tradePrice: 0 }, U: { label: 'Uncommon', group: 'Diamond', count: 2, tradeable: true, tradePrice: 0 },
    SR: { label: 'Super Rare', group: 'Star', count: 2, tradeable: true, tradePrice: 25000 }, UR: { label: 'Crown Rare', group: 'Crown', count: 1, tradeable: false, tradePrice: null } },
  pullRates: { T1: { 'Regular Pack': { appearance_rate: 100, cards: 5, slots: { 1: { C: 100 }, 2: { U: 90, SR: 9, UR: 1 } } } } },
  cards: [
    { id: 'T1-1', s: 'T1', n: 1, r: 'C', en: 'Bulbasaur', de: 'Bisasam', p: ['Alpha'] }, { id: 'T1-2', s: 'T1', n: 2, r: 'C', en: 'Pikachu', p: ['Alpha'] },
    { id: 'T1-3', s: 'T1', n: 3, r: 'U', en: 'Ivysaur', p: ['Alpha'] }, { id: 'T1-4', s: 'T1', n: 4, r: 'U', en: 'Raichu', p: ['Alpha'] },
    { id: 'T1-5', s: 'T1', n: 5, r: 'SR', en: 'Professor Oak', p: ['Alpha'] }, { id: 'T1-6', s: 'T1', n: 6, r: 'UR', en: 'Crown', p: ['Alpha'] },
    { id: 'PROMO-A-1', s: 'PROMO-A', n: 1, r: 'C', en: 'Promo Pikachu' },
  ],
};
const rec = (owned, extra = {}) => normalize({ accounts: Object.keys(owned).map(id => ({ id, name: id === 'main' ? 'Main' : 'Alt' })), owned, wish: [], chase: [], ...extra });

test('copies add up over accounts, or per account; spares keep one copy', () => {
  const r = rec({ main: { 'T1-1': 2, 'T1-5': 1 }, alt: { 'T1-1': 1, 'T1-3': 1 } });
  assert.equal(counts(r).get('T1-1'), 3);
  assert.equal(counts(r, 'alt').get('T1-1'), 1);
  assert.equal(counts(r, 'alt').get('T1-5'), undefined);
  assert.deepEqual([...spares(r)], [['T1-1', 2]]);
  assert.deepEqual(onAccounts(r, 'T1-1').map(a => a.name + a.n), ['Main2', 'Alt1']);
});

test('normalize drops bad ids and counts, and a card is either wishlist or chase', () => {
  const r = normalize({ accounts: [{ id: 'main', name: 'Main' }, { id: 'BAD!', name: 'x' }], owned: { main: { 'T1-1': 2, nope: 1, 'T1-2': -1, 'T1-3': 1.5 } }, wish: ['T1-5', 'x'], chase: ['T1-5'] });
  assert.deepEqual(r.accounts.map(a => a.id), ['main']);
  assert.deepEqual(r.owned.main, { 'T1-1': 2 });
  assert.deepEqual(r.wish, []);
  assert.deepEqual(r.chase, ['T1-5']);
});

test('wants: chase 3, wishlist 2, missing 1, but nothing missing counts before someone enters a collection', () => {
  assert.equal(wants(data, rec({ main: {} }, { chase: ['T1-5'] })).size, 1);
  const w = wants(data, rec({ main: { 'T1-1': 1 } }, { chase: ['T1-5'], wish: ['T1-3'] }));
  assert.equal(w.get('T1-5'), 3);
  assert.equal(w.get('T1-3'), 2);
  assert.equal(w.get('T1-2'), 1);
  assert.equal(w.get('T1-1'), undefined);
});

test('completion per set and rarity', () => {
  const t1 = completion(data, counts(rec({ main: { 'T1-1': 1, 'T1-5': 1 } }))).find(s => s.code === 'T1');
  assert.equal(t1.have, 2);
  assert.equal(t1.total, 6);
  assert.deepEqual(t1.byRarity.C, [1, 2]);
  assert.deepEqual(t1.byRarity.SR, [1, 1]);
});

test('pack odds follow the slot rates: nothing owned means every card is new', () => {
  const [all] = packOdds(data, new Map());
  assert.equal(all.pack, 'Alpha');
  assert.ok(Math.abs(all.expected - 2) < 1e-9);
  const owned = counts(rec({ main: { 'T1-1': 1, 'T1-3': 1, 'T1-4': 1 } }));
  const [p] = packOdds(data, owned, new Set(['T1-5']));
  // slot 1: half the commons are new; slot 2: no uncommon is new, the 2★ and the crown are
  assert.ok(Math.abs(p.expected - (0.5 + 0.09 + 0.01)) < 1e-9);
  assert.ok(Math.abs(p.anyWanted - 0.09) < 1e-9);
});

test('trades: same rarity only, tradeable only, both sides need something', () => {
  const people = {
    Ryo: rec({ main: { 'T1-1': 3, 'T1-3': 2, 'T1-5': 1, 'T1-6': 2 } }),
    Terra: rec({ main: { 'T1-2': 2, 'T1-4': 1 } }, { chase: ['T1-1'] }),
  };
  const [m] = matches(data, people, 'Ryo');
  assert.equal(m.person, 'Terra');
  // commons: Ryo gives Bulbasaur (Terra's chase), gets Pikachu; uncommons: Terra has no spare; the crown can't be traded
  assert.deepEqual(m.trades.map(t => t.rarity), ['C']);
  assert.equal(m.trades[0].give[0].id, 'T1-1');
  assert.equal(m.trades[0].give[0].want, 3);
  assert.equal(m.trades[0].get[0].id, 'T1-2');
});

test('worth: wanted by many and held by few is worth more; it gets you cards of its rarity', () => {
  const people = {
    Ryo: rec({ main: { 'T1-5': 2, 'T1-1': 2 } }),
    Terra: rec({ main: { 'T1-1': 1 } }, { chase: ['T1-5'] }),
    Rei: rec({ main: { 'T1-1': 2, 'T1-2': 2 } }, { wish: ['T1-5'] }),
  };
  const v = worth(data, people, 'Ryo');
  assert.equal(v.get('T1-5').demand, 5);
  assert.ok(v.get('T1-5').value > v.get('T1-1').value);
  assert.equal(v.has('T1-6'), false);
  assert.equal(v.has('PROMO-A-1'), false);
  // Ryo's spare Bulbasaur: nobody else wants it (all own one); Pikachu comes from Rei only if Rei wants Bulbasaur
  assert.deepEqual(tradeFor(data, people, 'Ryo', 'T1-1', v), []);
  people.Rei = rec({ main: { 'T1-2': 2 } });
  assert.deepEqual(tradeFor(data, people, 'Ryo', 'T1-1').map(g => g.id + '@' + g.from), ['T1-2@Rei']);
});

test('own accounts: a spare on one account fills a gap on another', () => {
  const moves = ownMoves(data, rec({ main: { 'T1-1': 2, 'T1-6': 2 }, alt: { 'T1-3': 3 } }));
  assert.deepEqual(moves.map(m => `${m.id} ${m.from.name}→${m.to.name}`), ['T1-1 Main→Alt', 'T1-3 Alt→Main']);
});

test('a set without pull rates borrows the newest rates and says so; promos are never a pack', () => {
  const next = { ...data, sets: [...data.sets, { code: 'T2', release: '2026-02-01', name: { en: 'New' }, packs: ['Beta'] }],
    cards: [...data.cards, { id: 'T2-1', s: 'T2', n: 1, r: 'C', en: 'New', p: ['Beta'] }] };
  const odds = packOdds(next, new Map());
  assert.deepEqual(odds.map(o => o.set + ':' + !!o.estimated).sort(), ['T1:false', 'T2:true']);
});

import { diff, applyDiff, isEmptyDiff, packList, packCards, accountWith } from '../pocket/core.mjs';
test('your changes go on top of a newer copy instead of overwriting it', () => {
  const base = rec({ main: { 'T1-1': 1 } }, { wish: ['T1-5'] });
  const mineNow = rec({ main: { 'T1-1': 3, 'T1-2': 1 } }, { chase: ['T1-5'] });
  const server = rec({ main: { 'T1-1': 0, 'T1-3': 1 } }, { wish: ['T1-5', 'T1-4'] }); // a trade took T1-1, gave T1-3
  const change = diff(base, mineNow);
  assert.equal(isEmptyDiff(diff(base, base)), true);
  const merged = applyDiff(server, change);
  assert.deepEqual(merged.owned.main, { 'T1-1': 2, 'T1-2': 1, 'T1-3': 1 });
  assert.deepEqual(merged.chase, ['T1-5']);
  assert.deepEqual(merged.wish, ['T1-4']);
});
test('packs newest first with their size; cards in reveal order; a traded card leaves the fullest account', () => {
  assert.deepEqual(packList(data).map(p => p.key + ':' + p.size), ['T1|Alpha:5']);
  assert.deepEqual(packCards(data, 'T1', 'Alpha').map(c => c.r), ['C', 'C', 'U', 'U', 'SR', 'UR']);
  assert.equal(accountWith(rec({ main: { 'T1-1': 1 }, alt: { 'T1-1': 4 } }), 'T1-1'), 'alt');
});
