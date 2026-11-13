// Inhalts-Rätsel: pure helpers (daily pick, cleaning and blacking out the description). No page access here.
import { hashSeed, shuffle } from './cover-core.mjs';

export const BLACK = '▇▇▇';
const COMMON = new Set(['the', 'and', 'with', 'from', 'season', 'part', 'cour', 'final', 'movie', 'shin', 'that', 'this', 'into', 'your', 'kara', 'wa', 'no', 'ni', 'wo', 'to', 'ga', 'de']);

// Today's show and three other ones as choices, the same for everyone on that day
export function dailyPuzzle(ids, day) {
  const pool = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (pool.length < 4) return null;
  const target = shuffle(pool, hashSeed(day + ':synopsis'))[0];
  const decoys = shuffle(pool.filter(id => id !== target), hashSeed(day + ':synopsis:decoys')).slice(0, 3);
  return { target, options: shuffle([target, ...decoys], hashSeed(day + ':synopsis:options')) };
}

// AniList's description as plain text: no tags, no "(Source: …)" or "Note:" lines, at most ~650 characters
export function cleanDescription(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.trim()).filter(l => l && !/^\(?\s*(source|quelle)\s*:/i.test(l) && !/^(note|notes)\s*:/i.test(l)).join(' ')
    .replace(/\s*\((source|quelle)\s*:[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length <= 650) return text;
  const cut = text.slice(0, 650), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + ' …');
}

// The words that give it away: the title's words and the characters' names
export function giveaways(media) {
  const words = new Set();
  const add = text => { for (const w of String(text || '').split(/[^\p{L}\p{N}'’-]+/u)) if (w.length >= 3 && !COMMON.has(w.toLowerCase())) words.add(w); };
  for (const t of [media?.title?.english, media?.title?.romaji, ...(media?.synonyms || [])]) add(t);
  for (const c of media?.characters?.nodes || []) {
    const n = c?.name || {};
    for (const t of [n.full, n.first, n.last, ...(n.alternative || [])]) add(t);
  }
  return [...words].sort((a, b) => b.length - a.length);
}

export function blackOut(text, words) {
  let out = String(text || '');
  for (const w of words) {
    const re = new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}])', 'giu');
    out = out.replace(re, (m, before) => before + BLACK);
  }
  return out.replace(new RegExp(`${BLACK}(?:[\\s-]+${BLACK})+`, 'g'), BLACK);
}

// U23: statistics from this browser's results, { 'YYYY-MM-DD': { tries, solved, done } }
// streak: solved days in a row, ending today (or yesterday, if today isn't played yet)
export function synopsisStats(history, today) {
  const days = Object.entries(history || {}).filter(([, r]) => r?.done);
  const solved = days.filter(([, r]) => r.solved);
  const prev = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
  let streak = 0, d = history?.[today]?.done ? today : prev(today);
  while (history?.[d]?.solved) { streak++; d = prev(d); }
  return { played: days.length, solved: solved.length, firstTry: solved.filter(([, r]) => r.tries === 1).length,
    rate: days.length ? Math.round(solved.length / days.length * 100) : 0, streak };
}
