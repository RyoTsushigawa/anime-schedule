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

// A critic's profile: their reviews (newest first), average score and how they score next to the others:
// `lean` is the average of (their score − the others' average) over the shows someone else reviewed too,
// negative = stricter. null until they share a show with someone.
export function critic(reviews, pen) {
  const own = (reviews || []).filter(r => r.pen === pen).sort((a, b) => String(b.editedAt || b.at).localeCompare(String(a.editedAt || a.at)));
  const gaps = own.flatMap(r => {
    const others = reviews.filter(o => o.mediaId === r.mediaId && o.pen !== pen);
    return others.length ? [r.score - others.reduce((n, o) => n + o.score, 0) / others.length] : [];
  });
  return {
    pen, reviews: own, count: own.length,
    average: own.length ? Math.round(own.reduce((n, r) => n + r.score, 0) / own.length) : null,
    lean: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, shared: gaps.length,
  };
}
// "8 Punkte strenger als die anderen (bei 5 gemeinsamen Anime)"
export function leanText(c) {
  if (c.lean == null) return 'teilt noch keinen Anime mit den anderen';
  const how = Math.abs(c.lean) < 3 ? 'wertet wie die anderen' : `${Math.abs(c.lean)} Punkte ${c.lean < 0 ? 'strenger' : 'großzügiger'} als die anderen`;
  return `${how} (bei ${c.shared} gemeinsamen Anime)`;
}
