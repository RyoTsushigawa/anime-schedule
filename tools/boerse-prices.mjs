// Anime-Börse: one closing price per show and day, for every season whose trading is open
// (boerse-prices.json). Shows from the Guckplan (the Sheet backup in backup/sheet/, hidden rows left out);
// AniList's community score, members and trending; the group's own ratings and drops from every AniList
// account in wrapped-profiles.json. Running again on the same day recomputes that day from the day before,
// so the morning and the evening run agree. Rules: boerse-core.mjs.
//   node tools/boerse-prices.mjs            update boerse-prices.json
//   node tools/boerse-prices.mjs --dry-run  only print today's closes
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PRICE, tradingWindow, berlinDay, groupScore, fairValue, nextClose, halted } from '../boerse-core.mjs';

const root = new URL('../', import.meta.url);
const path = file => fileURLToPath(new URL(file, root));
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

export function parseCsv(text) {
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(field.replace(/\r$/, '')); field = ''; rows.push([]); }
    else field += c;
  }
  rows[rows.length - 1].push(field);
  return rows;
}
// the season's shows: rows under the header with an anime title, not hidden (dropped from the plan)
export function seasonShows(csv, hiddenRows = []) {
  const rows = parseCsv(csv);
  const head = rows.findIndex(r => r.some(c => c.trim() === 'Anime Titel'));
  if (head < 0) return [];
  const col = name => rows[head].findIndex(c => c.trim() === name);
  const ro = col('Anime Titel'), en = col('Eng Anime Titel'), hidden = new Set(hiddenRows);
  return rows.slice(head + 1).flatMap((r, i) => {
    const romaji = (r[ro] || '').trim(), english = en >= 0 ? (r[en] || '').trim() : '';
    return romaji && !hidden.has(head + 2 + i) ? [{ romaji, english, title: english || romaji }] : [];
  }).filter((s, i, all) => all.findIndex(x => x.title === s.title) === i);
}

async function anilist(query, variables) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (res.status === 429) { await new Promise(r => setTimeout(r, (Number(res.headers.get('Retry-After')) || 30) * 1000)); continue; }
    if (!res.ok) throw new Error('AniList ' + res.status);
    const body = await res.json();
    if (body.errors?.length) throw new Error('AniList: ' + body.errors[0].message);
    await new Promise(r => setTimeout(r, 800)); // gentle: ~70 requests a minute at most
    return body.data;
  }
  throw new Error('AniList: zu viele Anfragen');
}
async function anilistIds(shows) {
  const ids = new Map();
  const streams = JSON.parse(await readFile(path('streams-de.json'), 'utf8'));
  const byTitle = new Map();
  for (const [id, s] of Object.entries(streams.status || {})) for (const t of s.titles || []) byTitle.set(norm(t), Number(id));
  for (const s of shows) { const id = byTitle.get(norm(s.romaji)) || byTitle.get(norm(s.english)); if (id) ids.set(s.title, id); }
  const missing = shows.filter(s => !ids.has(s.title));
  if (missing.length) {
    const catalog = JSON.parse(await readFile(path('seasons.json'), 'utf8'));
    const mal = new Map();
    for (const list of Object.values(catalog.seasons || {})) for (const s of list || []) if (s.mal) for (const t of [s.romaji, s.english]) if (t) mal.set(norm(t), Number(s.mal));
    const wanted = new Map(missing.map(s => [mal.get(norm(s.romaji)) || mal.get(norm(s.english)), s.title]).filter(([m]) => m));
    if (wanted.size) {
      const data = await anilist('query ($mal: [Int]) { Page(perPage: 50) { media(idMal_in: $mal, type: ANIME) { id idMal } } }', { mal: [...wanted.keys()] });
      for (const m of data.Page.media) ids.set(wanted.get(m.idMal), m.id);
    }
  }
  return ids;
}

export async function updateSeason(entry, shows, today, { media, ratings }) {
  const season = { days: [], shows: {}, ...entry };
  const at = season.days.indexOf(today);
  const index = at >= 0 ? at : season.days.length;
  if (at < 0) season.days.push(today);
  for (const show of shows) {
    const s = season.shows[show.title] ||= { closes: [], pops: [], droppedBy: {} };
    while (s.closes.length < index) { s.closes.push(s.closes.at(-1) ?? PRICE); s.pops.push(s.pops.at(-1) ?? 0); }
    const m = media.get(show.title) || {};
    const list = ratings.get(show.title) || [];
    // a drop counts as new on the day it is first seen
    for (const r of list) if (r.status === 'DROPPED' && !s.droppedBy[r.user]) s.droppedBy[r.user] = today;
    const newDrops = list.filter(r => r.status === 'DROPPED' && s.droppedBy[r.user] === today);
    const g = groupScore(list);
    const prev = index ? s.closes[index - 1] : PRICE;
    const close = index ? nextClose({ prev, fair: fairValue({ community: m.averageScore, group: g.score, groupCount: g.count }),
      popNow: m.popularity || 0, popBefore: s.pops[index - 1] || 0, trending: m.trending || 0, newDrops, seed: today + ':' + show.title }) : PRICE;
    s.closes[index] = close; s.pops[index] = m.popularity || 0;
    s.closes.length = s.pops.length = index + 1;
    Object.assign(s, { id: m.id || s.id, score: m.averageScore ?? null, members: m.popularity ?? null, ratings: g.count,
      drops: Object.keys(s.droppedBy).length, halted: halted(close, prev) ? today : undefined });
    if (!s.halted) delete s.halted;
  }
  return season;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = Date.now(), today = berlinDay(now);
  const index = JSON.parse(await readFile(path('backup/sheet/index.json'), 'utf8'));
  const tabs = index.tabs.filter(t => /^Guckplan\s+\S+\s+\d{4}$/i.test(t.name)).map(t => ({ ...t, season: t.name.replace(/^Guckplan\s+/i, '') }))
    .filter(t => tradingWindow(t.season, now)?.open);
  let file = { seasons: {} };
  try { file = JSON.parse(await readFile(path('boerse-prices.json'), 'utf8')); } catch {}
  const profiles = JSON.parse(await readFile(path('wrapped-profiles.json'), 'utf8'));
  const accounts = [...new Set(Object.values(profiles).flat().filter(a => a?.provider === 'anilist' && /^[\w-]{2,40}$/.test(a.name)).map(a => a.name))];
  for (const tab of tabs) {
    const shows = seasonShows(await readFile(path('backup/sheet/' + tab.file), 'utf8'), tab.hiddenRows);
    const ids = await anilistIds(shows);
    const byId = new Map([...ids].map(([t, id]) => [id, t]));
    const media = new Map(), ratings = new Map();
    if (byId.size) {
      const data = await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id averageScore popularity trending } } }', { ids: [...byId.keys()] });
      for (const m of data.Page.media) media.set(byId.get(m.id), m);
      for (const user of accounts) {
        try {
          const d = await anilist('query ($user: String, $ids: [Int]) { Page(perPage: 50) { mediaList(userName: $user, mediaId_in: $ids, type: ANIME) { mediaId status progress score(format: POINT_100) media { episodes } } } }', { user, ids: [...byId.keys()] });
          for (const e of d.Page.mediaList) { const t = byId.get(e.mediaId); ratings.set(t, [...(ratings.get(t) || []), { user, status: e.status, progress: e.progress, score: e.score, episodes: e.media?.episodes }]); }
        } catch (e) { console.log(`${user}: ${e.message}`); }
      }
    }
    file.seasons[tab.season] = await updateSeason(file.seasons[tab.season], shows, today, { media, ratings });
    console.log(`${tab.season} · ${today}: ` + shows.map(s => `${s.title} ${file.seasons[tab.season].shows[s.title].closes.at(-1)}`).join(' · '));
  }
  file.updated = new Date(now).toISOString();
  if (!dryRun) await writeFile(path('boerse-prices.json'), JSON.stringify(file) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
