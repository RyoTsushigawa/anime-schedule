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
export function matchSubsPlease(titles, index) {
  const keys = new Set(titles.filter(Boolean).map(fallbackTitle));
  const matches = index.filter(show => keys.has(fallbackTitle(show.title)));
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
const seriesTitle = text => fallbackTitle(String(text).replace(/\b(?:\d+(?:st|nd|rd|th)\s+season|season\s*\d+|s\d+|cour\s*\d+|part\s*\d+)\b/gi, ''));
export function matchAniWorld(titles, index) {
  const aliases = {
    magicalgirlraisingprojectrestart: 'Magical Girl Raising Project',
    mahoushoujoikuseikeikakurestart: 'Magical Girl Raising Project',
  };
  const exact = new Set(titles.filter(Boolean).flatMap(t => [fallbackTitle(t), ...aliases[fallbackTitle(t)] ? [fallbackTitle(aliases[fallbackTitle(t)])] : []]));
  let matches = index.filter(show => exact.has(fallbackTitle(show.title)));
  if (!matches.length) matches = index.filter(show => show.titles.some(t => exact.has(fallbackTitle(t))));
  if (!matches.length) {
    const series = new Set(titles.filter(Boolean).map(seriesTitle).filter(t => t.length >= 8));
    matches = index.filter(show => show.titles.some(t => series.has(seriesTitle(t))));
  }
  return matches.length === 1 ? matches[0] : null;
}
