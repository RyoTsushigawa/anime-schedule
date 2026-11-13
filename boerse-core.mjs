// Anime-Börse: the rules, without the page, shared by the page, the daily price job (tools/boerse-prices.mjs)
// and the tests. Trading runs the whole season; prices move once a day from AniList and the group's ratings.
export const CASH = 1000, PRICE = 100, FEE = 1, SHORT_LIMIT = 1000, HALT = 0.07;
const SEASON_MONTH = { Winter: 0, 'Frühling': 3, Sommer: 6, Herbst: 9 };
const DAYS = 14 * 86400000;
export function seasonStart(season) {
  const [name, year] = String(season).split(' ');
  if (!(name in SEASON_MONTH) || !/^\d{4}$/.test(year || '')) return null;
  return Date.UTC(Number(year), SEASON_MONTH[name], 1) - 3600000; // midnight German time
}
// trading: from 14 days before the season starts (the listing at 100) until the next season starts
export function tradingWindow(season, now = Date.now()) {
  const start = seasonStart(season);
  if (start === null) return null;
  const end = new Date(start + 3600000); end.setUTCMonth(end.getUTCMonth() + 3);
  const from = start - DAYS, to = end.getTime() - 3600000;
  return { from, to, open: now >= from && now < to };
}
// opening hours: 8:00 to 22:00 German time, every day; the day's close is set after 22:00
export const OPEN_HOUR = 8, CLOSE_HOUR = 22;
export const berlinHour = (time = Date.now()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(time)));
export const marketOpen = (time = Date.now()) => { const h = berlinHour(time); return h >= OPEN_HOUR && h < CLOSE_HOUR; };
export const berlinDay = (time = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(time));
export const prevDay = day => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
export const nextDay = day => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// A drop clearly costs value, the earlier the more: dropped after the first episode counts as 0/100, at the very
// end as 40/100 (and never more than the score the person gave). Unknown length: a season of 12 episodes.
export const watchedShare = r => { const total = r.episodes > 0 ? r.episodes : Math.max(12, r.progress || 0); return Math.min(1, Math.max(0, ((r.progress || 0) - 1) / Math.max(1, total - 1))); };
export function dropValue(r) {
  const value = Math.round(40 * watchedShare(r));
  return r.score > 0 ? Math.min(r.score, value) : value;
}
// the group's view of a show (0–100) and how many gave one, drops as above
export function groupScore(ratings) {
  const values = ratings.map(r => r.status === 'DROPPED' ? dropValue(r) : r.score > 0 ? r.score : null).filter(v => v !== null);
  return values.length ? { score: values.reduce((a, b) => a + b, 0) / values.length, count: values.length } : { score: null, count: 0 };
}
// the group's price alone (score × 2; nobody rated it: 100), as before the daily market
export const priceOf = ratings => { const g = groupScore(ratings); return g.count ? Math.round(g.score * 2) : PRICE; };

// What a share "should" be worth today: AniList's community score (70 counts as par) blended with the group's
// own ratings (60 counts as par), the group weighing more the more of you rated it (up to 75 %)
export function fairValue({ community = null, group = null, groupCount = 0 }) {
  const c = community ? community / 70 : 1;
  const g = groupCount ? group / 60 : c;
  const w = Math.min(0.75, 0.25 + 0.1 * groupCount);
  return PRICE * ((1 - w) * c + w * g);
}
// the same small noise for everyone: ±1.5 % from the day and the show
export function noise(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 3001 / 1000 - 1.5) / 100;
}
// One day's close: a third of the way towards the fair value, AniList momentum (members gained, trending),
// a shock for every new drop in the group (the earlier, the harder), and the noise. Never below 1.
export function nextClose({ prev, fair, popNow = 0, popBefore = 0, trending = 0, newDrops = [], seed = '' }) {
  const growth = popBefore > 0 ? popNow / popBefore - 1 : 0;
  const momentum = Math.max(-0.03, Math.min(0.03, growth * 3 + Math.min(trending, 200) / 10000));
  let price = prev + (fair * (1 + momentum) - prev) / 3;
  for (const d of newDrops) price *= 1 - (0.06 + 0.14 * (1 - watchedShare(d)));
  price *= 1 + noise(seed);
  return Math.max(1, Math.round(price * 100) / 100);
}
// circuit breaker: a fall of 7 % or more at a day's close halts trading in that show the next trading day
export const halted = (close, prev) => prev > 0 && close <= prev * (1 - HALT);

// accounts (the votes helper keeps them): unsettled money becomes cash from its day on (T+1)
export function settle(account, today) {
  const ready = (account.pending || []).filter(p => p.on <= today);
  return { ...account, cash: Math.round(((account.cash ?? CASH) + ready.reduce((n, p) => n + p.amount, 0)) * 100) / 100, pending: (account.pending || []).filter(p => p.on > today) };
}
export const pendingSum = account => (account.pending || []).reduce((n, p) => n + p.amount, 0);
export const holdingsValue = (holdings, prices) => Object.entries(holdings || {}).reduce((n, [t, c]) => n + c * (prices.get(t) ?? PRICE), 0);
export const accountValue = (account, prices) => (account.cash ?? CASH) + pendingSum(account) + holdingsValue(account.holdings, prices);
export const shortExposure = (holdings, prices) => Object.entries(holdings || {}).reduce((n, [t, c]) => n + (c < 0 ? -c * (prices.get(t) ?? PRICE) : 0), 0);
// a trade, checked as the votes helper does: buy (qty > 0) from settled cash plus the fee; sell (qty < 0) gives
// money the next day minus the fee; selling more than you hold is a short sale, up to 1000 Taler in shorts
export function trade(account, { title, qty, price, today, halt = false }, prices) {
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 50) throw new Error('Ungültige Anzahl.');
  if (halt) throw new Error('Handel ausgesetzt: Kurs heute um 7 % oder mehr gefallen (Circuit Breaker).');
  const a = settle(account, today);
  const holdings = { ...(a.holdings || {}) };
  const after = (holdings[title] || 0) + qty;
  if (qty > 0) {
    const cost = qty * price + FEE;
    if (cost > a.cash + 1e-9) throw new Error('Nicht genug verfügbare Taler (Verkäufe werden erst am nächsten Tag gutgeschrieben).');
    a.cash = Math.round((a.cash - cost) * 100) / 100;
  } else {
    const amount = Math.round((-qty * price - FEE) * 100) / 100;
    a.pending = [...a.pending, { amount, on: nextDay(today) }];
  }
  if (after) holdings[title] = after; else delete holdings[title];
  if (shortExposure(holdings, new Map([...prices, [title, price]])) > SHORT_LIMIT + 1e-9) throw new Error('Leerverkäufe höchstens bis 1000 Taler.');
  a.holdings = holdings;
  a.trades = [...(a.trades || []), { day: today, title, qty, price, fee: FEE }].slice(-200);
  return a;
}
// everyone's value, best first
export const ranking = (accounts, prices) => accounts.map(a => ({ person: a.person, value: Math.round(accountValue(a, prices) * 100) / 100 }))
  .sort((a, b) => b.value - a.value || a.person.localeCompare(b.person, 'de'));
// the latest close per show from boerse-prices.json for one season
export const latestPrices = season => new Map(Object.entries(season?.shows || {}).map(([t, s]) => [t, s.closes?.[s.closes.length - 1] ?? PRICE]));
