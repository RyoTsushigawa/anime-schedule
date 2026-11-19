// Pocket-Sammlung (pocket.html): the rules, without the page. Cards come from pocket-cards.json
// (tools/pocket-cards.mjs); a person's record comes from the votes helper (workers/season-votes, /pocket):
//   { accounts: [{ id, name, friendId? }], owned: { <account id>: { <card id>: copies } }, wish: [card id], chase: [card id] }
// A card is "A1-1" (set and number), so the language a card is in does not matter.
export const MAX_ACCOUNTS = 6, MAX_COPIES = 99;
export const CARD_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?-\d{1,4}$/;
export const ACCOUNT_ID = /^[a-z0-9]{1,12}$/;
// how much a person wants a card: chase > wishlist > simply missing
export const WANT = { chase: 3, wish: 2, missing: 1 };

export const emptyRecord = () => ({ accounts: [{ id: 'main', name: 'Main' }], owned: { main: {} }, wish: [], chase: [] });

export function normalize(record) {
  const r = record && typeof record === 'object' ? record : {};
  const accounts = (Array.isArray(r.accounts) ? r.accounts : []).filter(a => ACCOUNT_ID.test(a?.id) && typeof a.name === 'string')
    .slice(0, MAX_ACCOUNTS).map(a => ({ id: a.id, name: a.name.trim().slice(0, 30) || a.id, ...(typeof a.friendId === 'string' && a.friendId.trim() && { friendId: a.friendId.trim().slice(0, 24) }) }));
  if (!accounts.length) return { ...emptyRecord(), ...(r.at && { at: r.at }) };
  const owned = {};
  for (const a of accounts) {
    owned[a.id] = {};
    for (const [id, n] of Object.entries(r.owned?.[a.id] || {})) if (CARD_ID.test(id) && Number.isInteger(n) && n > 0) owned[a.id][id] = Math.min(n, MAX_COPIES);
  }
  const ids = list => [...new Set((Array.isArray(list) ? list : []).filter(id => CARD_ID.test(id)))];
  const chase = ids(r.chase), wish = ids(r.wish).filter(id => !chase.includes(id));
  const trades = (Array.isArray(r.trades) ? r.trades : []).filter(t => t && typeof t.id === 'string' && CARD_ID.test(t.gave) && CARD_ID.test(t.got)).slice(-50);
  return { accounts, owned, wish, chase, ...(trades.length && { trades }), ...(r.at && { at: r.at }) };
}

// copies per card: all accounts together ('all') or one account
export function counts(record, scope = 'all') {
  const out = new Map();
  for (const a of record.accounts) {
    if (scope !== 'all' && scope !== a.id) continue;
    for (const [id, n] of Object.entries(record.owned[a.id] || {})) out.set(id, (out.get(id) || 0) + n);
  }
  return out;
}
export const onAccounts = (record, id) => record.accounts.map(a => ({ id: a.id, name: a.name, n: record.owned[a.id]?.[id] || 0 })).filter(a => a.n > 0);
export const hasData = record => !!record && record.accounts.some(a => Object.keys(record.owned[a.id] || {}).length > 0);

export const tradeable = (data, card) => !!data.rarities[card.r]?.tradeable && !/^PROMO/.test(card.s);
export const cardMap = data => new Map(data.cards.map(c => [c.id, c]));

// spare copies: everything above the one copy kept, wherever it lies
export function spares(record) {
  const out = new Map();
  for (const [id, n] of counts(record)) if (n > 1) out.set(id, n - 1);
  return out;
}
// what a person wants: chase and wishlist always; missing cards only once the person has entered a collection
export function wants(data, record, { missing = true } = {}) {
  const out = new Map();
  if (!record) return out;
  if (missing && hasData(record)) {
    const have = counts(record);
    for (const c of data.cards) if (!have.get(c.id)) out.set(c.id, WANT.missing);
  }
  const have = counts(record);
  for (const id of record.wish) if (!have.get(id)) out.set(id, WANT.wish);
  for (const id of record.chase) if (!have.get(id)) out.set(id, WANT.chase);
  return out;
}

// per set: how many different cards are owned, overall and per rarity
export function completion(data, owned) {
  return data.sets.map(set => {
    const cards = data.cards.filter(c => c.s === set.code);
    const byRarity = {};
    for (const c of cards) { const r = byRarity[c.r] ||= [0, 0]; r[1]++; if (owned.get(c.id)) r[0]++; }
    return { code: set.code, set, total: cards.length, have: cards.filter(c => owned.get(c.id)).length, byRarity, missing: cards.filter(c => !owned.get(c.id)) };
  }).filter(s => s.total > 0);
}

// For every pack you can open: expected new cards per pack, the chance of at least one new card, and the chance
// of a card from your chase list or wishlist. A slot's rarity rates come from the set's pull rates; within a rarity
// every card of that pack is equally likely. Rarities without cards in that pack are left out and the rest scaled.
export function packOdds(data, owned, wanted = new Set()) {
  const out = [];
  // a brand-new set often has no published rates yet: it borrows those of the newest set that has them ("≈")
  const latest = [...data.sets].reverse().find(s => data.pullRates?.[s.code] && !/^PROMO/.test(s.code) && Object.values(data.pullRates[s.code]).some(t => t.cards >= 5));
  for (const set of data.sets) {
    if (/^PROMO/.test(set.code)) continue;
    const own = data.pullRates?.[set.code], rates = own || (latest && data.pullRates[latest.code]);
    if (!rates) continue;
    for (const pack of set.packs) {
      const cards = data.cards.filter(c => c.s === set.code && c.p?.includes(pack));
      if (!cards.length) continue;
      const pool = {};
      for (const c of cards) { const p = pool[c.r] ||= { total: 0, missing: 0, wanted: 0 }; p.total++; if (!owned.get(c.id)) { p.missing++; if (wanted.has(c.id)) p.wanted++; } }
      let expected = 0, anyNew = 0, anyWanted = 0, weight = 0;
      for (const type of Object.values(rates)) {
        const share = Number(type.appearance_rate) || 0;
        if (!share) continue;
        let e = 0, none = 1, noWant = 1;
        for (const slot of Object.values(type.slots || {})) {
          const present = Object.entries(slot).filter(([r, v]) => pool[r] && v > 0);
          const sum = present.reduce((n, [, v]) => n + v, 0);
          if (!sum) continue;
          let pNew = 0, pWant = 0;
          for (const [r, v] of present) { pNew += v / sum * pool[r].missing / pool[r].total; pWant += v / sum * pool[r].wanted / pool[r].total; }
          e += pNew; none *= 1 - pNew; noWant *= 1 - pWant;
        }
        expected += share * e; anyNew += share * (1 - none); anyWanted += share * (1 - noWant); weight += share;
      }
      if (!weight) continue;
      const missing = cards.filter(c => !owned.get(c.id)).length;
      out.push({ set: set.code, pack, estimated: !own, cards: cards.length, missing, wanted: cards.filter(c => !owned.get(c.id) && wanted.has(c.id)).length,
        expected: expected / weight, anyNew: anyNew / weight, anyWanted: anyWanted / weight });
    }
  }
  return out.sort((a, b) => b.anyWanted - a.anyWanted || b.expected - a.expected);
}

// Trade worth inside the group: how many of the others want a card (weighted) against how many spare copies
// the others hold. Trades in the game are always the same rarity, so a card is worth more than every card of its
// rarity with a lower value: for it you can get any of those.
export function worth(data, people, me) {
  const cards = cardMap(data), others = Object.entries(people).filter(([p]) => p !== me);
  const want = others.map(([p, r]) => [p, wants(data, r)]), spare = others.map(([p, r]) => [p, spares(r)]);
  const out = new Map();
  for (const c of data.cards) {
    if (!tradeable(data, c)) continue;
    let demand = 0, supply = 0; const wantedBy = [], heldBy = [];
    for (const [p, w] of want) { const n = w.get(c.id); if (n) { demand += n; wantedBy.push(p); } }
    for (const [p, s] of spare) { const n = s.get(c.id); if (n) { supply += n; heldBy.push(p); } }
    out.set(c.id, { id: c.id, card: cards.get(c.id), demand, supply, value: demand / (supply + 1), wantedBy, heldBy });
  }
  return out;
}

// What one of your spare cards gets you: cards of the same rarity you want, held spare by someone who wants yours
export function tradeFor(data, people, me, id, values = worth(data, people, me)) {
  const cards = cardMap(data), card = cards.get(id), mine = people[me];
  if (!card || !mine || !tradeable(data, card)) return [];
  const myWants = wants(data, mine), out = [];
  for (const [p, r] of Object.entries(people)) {
    if (p === me || !wants(data, r).get(id)) continue;
    for (const [other, n] of spares(r)) {
      const c = cards.get(other);
      if (c && c.r === card.r && myWants.get(other) && tradeable(data, c)) out.push({ id: other, card: c, from: p, accounts: onAccounts(r, other), want: myWants.get(other), value: values.get(other)?.value || 0, copies: n });
    }
  }
  return out.sort((a, b) => b.want - a.want || b.value - a.value || a.id.localeCompare(b.id));
}

// Trade partners: for each friend, per rarity, what you could give (your spares they want) and get (their spares
// you want). Only rarities where both sides have something make a trade.
export function matches(data, people, me) {
  const cards = cardMap(data), mine = people[me];
  if (!mine) return [];
  const myWants = wants(data, mine), mySpares = spares(mine), out = [];
  for (const [p, r] of Object.entries(people)) {
    if (p === me) continue;
    const theirWants = wants(data, r), theirSpares = spares(r), rarities = {};
    const add = (side, id, want, owner) => {
      const c = cards.get(id);
      if (!c || !tradeable(data, c)) return;
      (rarities[c.r] ||= { give: [], get: [] })[side].push({ id, card: c, want, accounts: onAccounts(owner, id) });
    };
    for (const id of mySpares.keys()) { const w = theirWants.get(id); if (w) add('give', id, w, mine); }
    for (const id of theirSpares.keys()) { const w = myWants.get(id); if (w) add('get', id, w, r); }
    const trades = Object.entries(rarities).filter(([, v]) => v.give.length && v.get.length).map(([rarity, v]) => {
      const sort = list => list.sort((a, b) => b.want - a.want || a.id.localeCompare(b.id));
      return { rarity, give: sort(v.give), get: sort(v.get), pairs: Math.min(v.give.length, v.get.length) };
    });
    if (!trades.length) continue;
    const score = trades.reduce((n, t) => n + t.get.slice(0, t.pairs).reduce((m, x) => m + x.want, 0), 0);
    out.push({ person: p, record: r, trades, score });
  }
  return out.sort((a, b) => b.score - a.score || a.person.localeCompare(b.person, 'de'));
}

// Between your own accounts: cards one account lacks that another of yours has a spare copy of
export function ownMoves(data, record) {
  const cards = cardMap(data), out = [];
  if (record.accounts.length < 2) return out;
  for (const to of record.accounts) {
    for (const from of record.accounts) {
      if (from.id === to.id) continue;
      for (const [id, n] of Object.entries(record.owned[from.id] || {})) {
        const c = cards.get(id);
        if (n > 1 && !record.owned[to.id]?.[id] && c && tradeable(data, c)) out.push({ id, card: c, from, to, copies: n });
      }
    }
  }
  return out.sort((a, b) => a.to.name.localeCompare(b.to.name) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ---------- changes on top of a newer copy ----------
// What you changed since the copy you loaded (copies per account as +/-, wishlist/chase in and out, the account
// list), so it can be put on top of a newer copy from the server (another device, or a friend's trade) instead of
// overwriting it.
export function diff(base, next) {
  const owned = {};
  for (const a of next.accounts) {
    const before = base.owned?.[a.id] || {}, after = next.owned[a.id] || {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const d = (after[id] || 0) - (before[id] || 0);
      if (d) (owned[a.id] ||= {})[id] = d;
    }
  }
  const lists = {};
  for (const l of ['wish', 'chase']) {
    const b = new Set(base[l] || []), n = new Set(next[l]);
    lists[l] = { add: [...n].filter(x => !b.has(x)), remove: [...b].filter(x => !n.has(x)) };
  }
  const accounts = JSON.stringify(base.accounts) === JSON.stringify(next.accounts) ? null : next.accounts;
  return { owned, lists, accounts };
}
export function applyDiff(record, change) {
  const out = normalize(JSON.parse(JSON.stringify(record)));
  if (change.accounts) {
    for (const a of change.accounts) out.owned[a.id] ||= {};
    for (const id of Object.keys(out.owned)) if (!change.accounts.some(a => a.id === id)) delete out.owned[id];
    out.accounts = change.accounts;
  }
  for (const [acc, cards] of Object.entries(change.owned)) {
    if (!out.owned[acc]) continue;
    for (const [id, d] of Object.entries(cards)) { const n = Math.max(0, Math.min(MAX_COPIES, (out.owned[acc][id] || 0) + d)); if (n) out.owned[acc][id] = n; else delete out.owned[acc][id]; }
  }
  for (const l of ['wish', 'chase']) {
    const set = new Set(out[l]);
    for (const x of change.lists[l].add) set.add(x);
    for (const x of change.lists[l].remove) set.delete(x);
    out[l] = [...set];
  }
  const other = { wish: 'chase', chase: 'wish' };
  for (const l of ['wish', 'chase']) for (const x of change.lists[l].add) out[other[l]] = out[other[l]].filter(y => y !== x);
  return normalize({ ...out, trades: record.trades, at: record.at });
}
export const isEmptyDiff = change => !change.accounts && !Object.keys(change.owned).length && !['wish', 'chase'].some(l => change.lists[l].add.length || change.lists[l].remove.length);

// ---------- pack opened ----------
// every pack you can open, newest set first: { key: "C1|Dual Fusion Pikachu", set, pack, size }
export function packList(data) {
  const out = [];
  for (const set of [...data.sets].reverse()) {
    if (/^PROMO/.test(set.code)) continue;
    const regular = data.pullRates?.[set.code]?.['Regular Pack'];
    for (const pack of set.packs) if (data.cards.some(c => c.s === set.code && c.p?.includes(pack))) out.push({ key: set.code + '|' + pack, set: set.code, pack, size: regular?.cards || (/Deluxe/i.test(pack) ? 4 : 5) });
  }
  return out;
}
// the pack's cards in the order they are revealed: by rarity (◆ first), then number
export function packCards(data, set, pack) {
  const order = Object.keys(data.rarities);
  return data.cards.filter(c => c.s === set && c.p?.includes(pack)).sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r) || a.n - b.n);
}
// the account a traded card leaves from: the one holding the most copies of it
export function accountWith(record, id) {
  return [...record.accounts].sort((a, b) => (record.owned[b.id]?.[id] || 0) - (record.owned[a.id]?.[id] || 0))[0]?.id || '';
}
