// Anime-Börse: the rules, without the page. Prices come from the group's own AniList ratings.
export const CASH = 1000, PRICE = 100;
const SEASON_MONTH = { Winter: 0, 'Frühling': 3, Sommer: 6, Herbst: 9 };
const DAYS = 14 * 86400000;
// trading: from 14 days before to 14 days after the season starts (as in the votes helper)
export function tradingWindow(season, now = Date.now()) {
  const [name, year] = String(season).split(' ');
  if (!(name in SEASON_MONTH) || !/^\d{4}$/.test(year || '')) return null;
  const start = Date.UTC(Number(year), SEASON_MONTH[name], 1) - 3600000;
  return { from: start - DAYS, to: start + DAYS, open: now >= start - DAYS && now < start + DAYS };
}
// A drop clearly costs value, the earlier the more: dropped after the first episode counts as 0/100, at the very
// end as 40/100 (and never more than the score the person gave). Unknown length: a season of 12 episodes.
export function dropValue(r) {
  const total = r.episodes > 0 ? r.episodes : Math.max(12, r.progress || 0);
  const watched = Math.min(1, Math.max(0, ((r.progress || 0) - 1) / Math.max(1, total - 1)));
  const value = Math.round(40 * watched);
  return r.score > 0 ? Math.min(r.score, value) : value;
}
// one show's price: the average of the group's ratings (0–100) × 2, drops as above; nobody rated it yet:
// the starting price
export function priceOf(ratings) {
  const values = ratings.map(r => r.status === 'DROPPED' ? dropValue(r) : r.score > 0 ? r.score : null).filter(v => v !== null);
  if (!values.length) return PRICE;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 2);
}
export const spent = holdings => Object.values(holdings || {}).reduce((n, c) => n + c * PRICE, 0);
export const worth = (holdings, prices) => Object.entries(holdings || {}).reduce((n, [title, c]) => n + c * (prices.get(title) ?? PRICE), 0);
export const portfolioValue = (holdings, prices) => CASH - spent(holdings) + worth(holdings, prices);
// everyone's portfolios, best first
export const ranking = (portfolios, prices) => portfolios.map(p => ({ person: p.person, holdings: p.holdings, value: portfolioValue(p.holdings, prices) }))
  .sort((a, b) => b.value - a.value || a.person.localeCompare(b.person, 'de'));
