// Match show pages only. Never infer a season from a similar franchise title.
const decode = text => text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
export const fallbackTitle = text => decode(String(text)).normalize('NFKD').toLowerCase()
  .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, 'season $1')
  .replace(/\bs(?:eason)?\s*(\d+)\b/g, 'season $1').replace(/[^a-z0-9]/g, '');
export function parseSubsPlease(html) {
  const shows = new Map();
  for (const [, href, rest, text] of html.matchAll(/<a\b[^>]*href="((?:https:\/\/subsplease\.org)?\/shows\/[^"?#]+)"([^>]*)>([\s\S]*?)<\/a>/g)) {
    const url = new URL(decode(href), 'https://subsplease.org');
    if (!/^\/shows\/[^/]+\/?$/.test(url.pathname)) continue;
    const title = decode(rest.match(/\btitle="([^"]+)"/)?.[1] || text.replace(/<[^>]*>/g, '')).trim();
    if (title) shows.set(url.href, { title, url: url.href });
  }
  return [...shows.values()];
}
// AniList's long light-novel subtitles are often dropped by release groups: "Kyouran Reijou Nia Liston:
// Byoujaku Reijou ni..." is "Kyouran Reijou Nia Liston" on SubsPlease. A short or season-like part after
// the colon can name another season, so that stays part of the title.
export function withoutLongSubtitle(title) {
  const parts = String(title).match(/^(.{8,}?)\s*:\s+(.+)$/);
  if (!parts || parts[2].trim().split(/\s+/).length < 4) return null;
  return /\b(?:season|part|cour|final|ii|iii|iv|\d+(?:st|nd|rd|th)?)\b/i.test(parts[2]) ? null : parts[1];
}
export function matchSubsPlease(titles, index) {
  const known = titles.filter(Boolean);
  const among = list => { const keys = new Set(list.map(fallbackTitle)); return index.filter(show => keys.has(fallbackTitle(show.title))); };
  let matches = among(known);
  if (!matches.length) matches = among(known.map(withoutLongSubtitle).filter(Boolean));
  return matches.length === 1 ? matches[0] : null;
}
export function parseAniWorld(html) {
  const shows = new Map();
  for (const [, before, path, after, body] of html.matchAll(/<a\b([^>]*?)href="(\/anime\/stream\/[^"?#]+)"([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (!/^\/anime\/stream\/[^/]+\/?$/.test(path)) continue;
    const title = decode(body.replace(/<[^>]*>/g, '')).trim();
    const aliases = decode((before + after).match(/data-alternative-title="([^"]*)"/)?.[1] || '').split(',').map(s => s.trim());
    if (title) shows.set(path, { title, titles: [title, ...aliases], url: 'https://aniworld.to' + path });
  }
  return [...shows.values()];
}
// A season mark: "2nd Season", "Season 2", "S2", "Part 2", "Cour 2", or a Roman "II" at the end
const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const seriesTitle = text => fallbackTitle(String(text)
  .replace(/\b(?:\d+(?:st|nd|rd|th)\s+season|season\s*\d+|s\d+|cour\s*\d+|part\s*\d+)\b/gi, '')
  .replace(/\s(?:ii|iii|iv|vi{0,3}|ix|x)\s*$/i, ''));
// Which season a title names (2 or more), else null: AniWorld keeps every season on one page, with
// "/staffel-2" and so on for the later ones
export function seasonOf(titles) {
  for (const t of titles.filter(Boolean).map(String)) {
    const n = Number(t.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i)?.[1] || t.match(/\bseason\s*(\d+)\b/i)?.[1] || t.match(/\bs(\d+)\b/i)?.[1])
      || ROMAN[t.match(/\s(ii|iii|iv|vi{0,3}|ix|x)\s*$/i)?.[1]?.toLowerCase()];
    if (n >= 2 && n <= 20) return n;
  }
  return null;
}
// A title only counts when enough of it is in Latin letters: Japanese, Chinese or Thai names
// shrink to almost nothing ("第2期" is just "2") and would match unrelated shows.
const usable = key => /[a-z].*[a-z].*[a-z]/.test(key) && key.length >= 4;
export function matchAniWorld(titles, index) {
  const aliases = {
    magicalgirlraisingprojectrestart: 'Magical Girl Raising Project',
    mahoushoujoikuseikeikakurestart: 'Magical Girl Raising Project',
  };
  const exact = new Set(titles.filter(Boolean).flatMap(t => [fallbackTitle(t), ...aliases[fallbackTitle(t)] ? [fallbackTitle(aliases[fallbackTitle(t)])] : []]).filter(usable));
  let matches = index.filter(show => exact.has(fallbackTitle(show.title)));
  if (!matches.length) matches = index.filter(show => show.titles.some(t => usable(fallbackTitle(t)) && exact.has(fallbackTitle(t))));
  if (!matches.length) {
    const series = new Set(titles.filter(Boolean).map(seriesTitle).filter(t => t.length >= 8));
    matches = index.filter(show => show.titles.some(t => series.has(seriesTitle(t))));
  }
  if (matches.length !== 1) return null;
  const match = matches[0];
  const season = seasonOf(titles);
  // A base-title alias can match exactly even when another title names the season.
  // A separately indexed season already has its own page.
  return season && !seasonOf([match.title])
    ? { ...match, url: match.url.replace(/\/$/, '') + '/staffel-' + season }
    : match;
}
