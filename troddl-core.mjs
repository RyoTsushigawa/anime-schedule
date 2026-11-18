// Troddl reviews: shared rules for the review page (troddl.mjs) and the hover card on the plan (troddl-hover.mjs).
export const MIN_TEXT = 300, MAX_TEXT = 6000, MIN_FOR_RATING = 2;
// like Metacritic: green from 75, yellow from 50, red below
export const scoreClass = n => n == null ? 'tbd' : n >= 75 ? 'good' : n >= 50 ? 'mixed' : 'bad';
const SEASONS = { WINTER: 'Winter', SPRING: 'Frühling', SUMMER: 'Sommer', FALL: 'Herbst' };
export const seasonLabel = m => m?.season && m?.seasonYear ? `${SEASONS[m.season] || m.season} ${m.seasonYear}` : m?.seasonYear ? String(m.seasonYear) : '';
const SEASON_ORDER = { Winter: 0, 'Frühling': 1, Sommer: 2, Herbst: 3 };
export const seasonKey = s => { const [name, year] = String(s || '').split(' '); return year ? Number(year) * 4 + (SEASON_ORDER[name] ?? 0) : Number(name) * 4 || 0; };
// one entry per show: the Troddlrating is the rounded average once at least two people reviewed it
export function summarize(reviews) {
  const shows = new Map();
  for (const r of reviews || []) {
    const s = shows.get(r.mediaId) || { mediaId: r.mediaId, title: r.title, cover: r.cover, season: r.season, reviews: [] };
    s.reviews.push(r);
    shows.set(r.mediaId, s);
  }
  for (const s of shows.values()) {
    s.reviews.sort((a, b) => String(b.editedAt || b.at).localeCompare(String(a.editedAt || a.at)));
    s.count = s.reviews.length;
    s.rating = s.count >= MIN_FOR_RATING ? Math.round(s.reviews.reduce((n, r) => n + r.score, 0) / s.count) : null;
    s.latest = s.reviews[0];
  }
  return shows;
}
export const reviewCount = n => n === 1 ? '1 Review' : n + ' Reviews';
