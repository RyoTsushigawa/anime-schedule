// Builds ../streams-de.json: where each Guckplan show streams in Germany, according to LiveChart.me,
// and how much later than Japanese TV each episode comes out on our services.
// LiveChart shows the streams for the visitor's region, so run this from Germany.
// The Google Sheet is only read (CSV export), never written.
//
// Also writes ../seasons.json: each of those seasons' LiveChart list, for the Season-Helfer script.
// Usage: node tools/build-streams.mjs [--seasons-only | --status-only] [season ...]   (default: current, previous and next season, e.g. fall-2026 summer-2026 winter-2027)
// --status-only (the daily GitHub run, outside Germany): everything except the German streams and
// release offsets, which stay as the last run from home left them: next episodes, break news and
// timetable notes, and seasons.json.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSubsPlease, matchSubsPlease, parseAniWorld, matchAniWorld } from './fallback-links.mjs';
import { parseSeason, parseStreams, parseSchedules, parseHeadlines, parseTimetableNotes, norm, titleScore, searchVariants, pickCard, parseYouTube, episodeStem, newestEpisode } from './livechart-pages.mjs';

const SHEET = 'https://docs.google.com/spreadsheets/d/1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ';
const FALLBACK_TAB = { name: 'Guckplan Herbst 2026', gid: '488548700' };
const SEASON_MONTH = { winter: 0, frühling: 3, fruehling: 3, frühjahr: 3, sommer: 6, herbst: 9 };
const OUT = fileURLToPath(new URL('../streams-de.json', import.meta.url));
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (personal Guckplan schedule; one request every 5s)' };
const CRAWL_DELAY = 5000; // LiveChart's robots.txt asks for 5 seconds between requests

const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastRequest = 0;
async function livechart(path) {
  await sleep(Math.max(0, lastRequest + CRAWL_DELAY - Date.now()));
  lastRequest = Date.now();
  const res = await fetch('https://www.livechart.me' + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`LiveChart ${path} returned ${res.status}`);
  return res.text();
}

// A show on a YouTube channel: link its newest (subtitled) episode instead of the whole playlist.
// The playlist page names the series' uploads; a search sorted by upload date finds the newest,
// since the playlist page only lists its first videos.
async function youtube(url) {
  await sleep(CRAWL_DELAY);
  const res = await fetch(url, { headers: { ...HEADERS, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  return res.text();
}
async function newestVideo(playlistUrl) {
  const list = new URL(playlistUrl).searchParams.get('list');
  const listed = parseYouTube(await youtube(playlistUrl));
  if (!listed.length) return null;
  const stem = episodeStem(listed[0].title);
  const searched = parseYouTube(await youtube('https://www.youtube.com/results?sp=CAI%253D&search_query=' + encodeURIComponent(stem)));
  const v = newestEpisode([...listed, ...searched], stem);
  return v && { episode: v.episode, title: v.title, url: `https://www.youtube.com/watch?v=${v.id}&list=${list}` };
}

function seasons() {
  if (process.argv.length > 2) return process.argv.slice(2);
  const names = ['winter', 'spring', 'summer', 'fall'];
  const now = new Date();
  const i = Math.floor(now.getMonth() / 3), year = now.getFullYear();
  const prev = i === 0 ? `fall-${year - 1}` : `${names[i - 1]}-${year}`;
  const next = i === 3 ? `winter-${year + 1}` : `${names[i + 1]}-${year}`;
  return [`${names[i]}-${year}`, prev, next];
}

// ---------- Sheet (same rules as the page) ----------

function parseCsv(text) {
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows.at(-1).push(field); field = ''; }
    else if (c === '\n') { rows.at(-1).push(field.replace(/\r$/, '')); field = ''; rows.push([]); }
    else field += c;
  }
  rows.at(-1).push(field);
  return rows;
}

// The Guckplan tabs that can be active now (same rule as the page): the tab for today's season
// plus the ones next to it, for shows running on from the last plan or premiering early.
async function activeTabs() {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  const tabs = [];
  for (const [, name, gid] of html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)) {
    const m = name.match(/^Guckplan\s+(\S+)\s+(\d{4})/i);
    const month = m && SEASON_MONTH[m[1].toLowerCase()];
    if (month !== undefined && month !== null) tabs.push({ name, gid, start: new Date(Number(m[2]), month, 1) });
  }
  tabs.sort((a, b) => b.start - a.start);
  const tab = tabs.find(t => t.start <= Date.now()) || tabs.at(-1) || FALLBACK_TAB;
  const i = tabs.indexOf(tab);
  return i < 0 ? [tab] : [tab, tabs[i - 1], tabs[i + 1]].filter(Boolean);
}

// The MyAnimeList links on the sheet's titles, by title. The CSV export drops links, so they come
// from the read-only Sheets API with the page's key (limited to the site, hence its Referer).
async function sheetMalIds(tabName) {
  try {
    const { sheetsKey } = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
    if (!sheetsKey) return new Map();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET.split('/d/')[1]}?ranges=${encodeURIComponent(`'${tabName}'!A1:Z200`)}` +
      `&fields=sheets(data(rowData(values(formattedValue,hyperlink))))&key=${encodeURIComponent(sheetsKey)}`,
      { headers: { Referer: 'https://ryotsushigawa.github.io/anime-schedule/' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Sheets API returned ${res.status}`);
    const ids = new Map();
    for (const row of (await res.json()).sheets?.[0]?.data?.[0]?.rowData || [])
      for (const cell of row.values || []) {
        const id = cell.hyperlink?.match(/myanimelist\.net\/anime\/(\d+)/)?.[1];
        if (id && cell.formattedValue) ids.set(cell.formattedValue.trim(), id);
      }
    return ids;
  } catch (e) { console.log(`MAL links not read: ${e.message}`); return new Map(); }
}

// Each show as [romaji, English], with .mal: its MyAnimeList id from the sheet's link, if any
async function sheetTitles() {
  const shows = [];
  for (const tab of await activeTabs()) {
    console.log(`Sheet tab: ${tab.name}`);
    const rows = parseCsv(await (await fetch(`${SHEET}/export?format=csv&gid=${tab.gid}`)).text());
    const mal = await sheetMalIds(tab.name);
    const headerIndex = rows.findIndex(r => r.some(c => c.trim() === 'Anime Titel'));
    const header = rows[headerIndex].map(c => c.trim());
    for (const r of rows.slice(headerIndex + 1)) {
      const romaji = (r[header.indexOf('Anime Titel')] || '').trim();
      if (!romaji) break;
      const english = (r[header.indexOf('Eng Anime Titel')] || '').trim();
      shows.push(Object.assign([romaji, english], { mal: mal.get(romaji) || mal.get(english) || '' }));
    }
  }
  return shows;
}

// ---------- LiveChart ----------

// A season's shows from its LiveChart page (TV; LiveChart sends the ONA page there too). The season
// list in the sheet reads part of each card from seasons.json, since LiveChart doesn't answer Google's servers.
const seasonCards = async season => parseSeason(await livechart(`/${season}/tv`));

const SEASONS_OUT = fileURLToPath(new URL('../seasons.json', import.meta.url));
// A season LiveChart now lists with less than half the shows of last time (empty during its
// maintenance, a changed page) keeps last time's list, as streams-de.json does.
async function writeSeasons(bySeason) {
  let old = {};
  try { old = JSON.parse(await readFile(SEASONS_OUT, 'utf8')).seasons || {}; } catch {}
  const seasons = {};
  for (const [season, cards] of Object.entries(bySeason)) {
    const before = old[season]?.length || 0;
    if (cards.length * 2 < before) {
      console.log(`WARNING: ${season} has only ${cards.length} LiveChart entries (last time ${before}); kept the old list.`);
      seasons[season] = old[season];
    } else seasons[season] = cards.map(c => c.list);
  }
  await writeFile(SEASONS_OUT, JSON.stringify({ generated: new Date().toISOString(), seasons }) + '\n');
  console.log(`Wrote ${Object.keys(bySeason).join(', ')} to seasons.json`);
}

const streams = async livechartId => parseStreams(await livechart(`/anime/${livechartId}/streams`));

// From LiveChart's release schedules: `release`, how much later (in seconds) an episode comes out
// on one of our services than on Japanese TV (a subbed simulcast with German or English subtitles
// preferred, equally, and among those the earliest), and `next`, when the next episode is due
// (no `next` = nothing scheduled, e.g. finished). A show with no simulcast of ours that one of its
// German services streams weeks behind Japan (YouTube) gets that service's time and a `lag`: its
// episode N comes out in the week Japan airs episode N + lag, `offset` after the Japanese time.
const OUR_SERVICES = /crunchyroll|netflix|prime video|amazon|youtube|disney/i;
async function schedules(livechartId, services = []) {
  const all = parseSchedules(await livechart(`/anime/${livechartId}/schedules`));
  // The original release: "Broadcast (Japan)", or "Streaming (Japan)" for web/foreign productions.
  const japan = all.find(s => /^(broadcast|streaming)\b/i.test(s.title));
  if (!japan) {
    // No original schedule: any upcoming one still means it isn't finished.
    const first = all.sort((a, b) => a.time - b.time)[0];
    return { release: null, next: first ? { episode: first.episode, at: first.time } : null };
  }
  const release = pickRelease(all, japan, services);
  return { release, next: { episode: japan.episode, at: japan.time + (release?.offset || 0) } };
}

function pickRelease(schedules, japan, services = []) {
  // Both count down to their own next episode; line them up on the same episode (weekly).
  const offsetOf = s => s.time - japan.time - (s.episode - japan.episode) * 7 * 86400;
  const ours = schedules.filter(s => /simulcast/i.test(s.title) && OUR_SERVICES.test(s.service))
    // Up to a day early (pre-streaming) or three days late; anything else means the episode
    // numbers don't line up, and the Japanese time is the better guess.
    .map(s => ({ ...s, offset: offsetOf(s) })).filter(s => s.offset > -86400 && s.offset < 3 * 86400)
    .sort((a, b) => a.offset - b.offset);
  const pick = ours.find(s => /subbed/i.test(s.title) && s.readable) || ours.find(s => /subbed/i.test(s.title)) || ours[0];
  if (pick) return { offset: pick.offset, service: pick.service };
  // No simulcast: a later release on a German service of this show, up to 12 weeks behind.
  const later = schedules.filter(s => /^streaming\b/i.test(s.title) && OUR_SERVICES.test(s.service)
      && services.some(n => norm(n) === norm(s.service)))
    .map(s => { const all = offsetOf(s), lag = Math.floor((all + 86400) / (7 * 86400)); return { ...s, lag, offset: all - lag * 7 * 86400 }; })
    .filter(s => s.lag >= 0 && s.lag <= 12 && s.offset < 3 * 86400)
    .sort((a, b) => a.lag - b.lag || a.offset - b.offset)[0];
  return later ? { offset: later.offset, service: later.service, ...(later.lag && { lag: later.lag }) } : null;
}

// Recent (6 weeks) LiveChart headlines about a break or delay, newest first; the page shows the
// newest one's title as the reason.
const BREAK_NEWS = /\b(delay(ed|s)?|postpone[sd]?|break|hiatus|pushed back|suspend(ed|s)?|on hold|resum(e|es|ed|ing)|recap(s)?( episode)?|will not air|won'?t air|not air(ing)?|skip(s|ped|ping)?|special (program|broadcast)|preempt(ed|s)?|reschedul(e|ed|es)|production (issues?|reasons|circumstances)|cancel(l)?ed)\b/i;
async function breakNews(livechartId) {
  const since = Date.now() - 42 * 86400 * 1000;
  return parseHeadlines(await livechart(`/anime/${livechartId}/headlines`))
    .filter(n => BREAK_NEWS.test(n.title) && Date.parse(n.date) > since);
}

// Notes on LiveChart's timetable ("There will be no broadcast today due to sports coverage."),
// for this week and next: LiveChart id → [{at, text}] (at = the slot's time).
async function timetableNotes() {
  const notes = {};
  for (const days of [0, 7]) {
    const date = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    for (const { id, at, text } of parseTimetableNotes(await livechart(`/timetable?date=${date}`)))
      if (!(notes[id] || []).some(n => n.at === at)) (notes[id] ||= []).push({ at, text });
  }
  return notes;
}

// --seasons-only: just the season lists (seasons.json), without the streams.
const seasonsOnly = process.argv.includes('--seasons-only');
const statusOnly = process.argv.includes('--status-only');
const fallbackOnly = process.argv.includes('--fallback-links-only');
process.argv = process.argv.filter(a => !['--seasons-only', '--status-only', '--fallback-links-only'].includes(a));

const cards = [];
const bySeason = {};
for (const season of seasons()) {
  const found = await seasonCards(season);
  console.log(`${season}: ${found.length} LiveChart entries`);
  cards.push(...found);
  bySeason[season] = found;
}
await writeSeasons(bySeason);
if (seasonsOnly) process.exit(0);
try {
  const res = await fetch('https://subsplease.org/shows/', { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Show index returned ${res.status}`);
  const index = parseSubsPlease(await res.text());
  if (index.length < 100) throw new Error('Show index incomplete; kept previous links');
  let aniWorld = [];
  try {
    const response = await fetch('https://aniworld.to/animes', { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('AniWorld index unavailable');
    aniWorld = parseAniWorld(await response.text());
    if (aniWorld.length < 100) throw new Error('AniWorld index incomplete');
  } catch (error) { console.log(error.message); aniWorld = []; }
  const output = fileURLToPath(new URL('../fallback-links.json', import.meta.url));
  let old;
  try { old = JSON.parse(await readFile(output, 'utf8')); } catch {}
  const byAnilist = {};
  for (const card of cards) {
    if (!card.anilist) continue;
    const show = matchSubsPlease(card.titles, index);
    const alternate = matchAniWorld(card.titles, aniWorld);
    byAnilist[card.anilist] = { title: card.titles[0], malId: Number(card.list.mal?.match(/\/anime\/(\d+)/)?.[1]) || null,
      ...(show && { subsplease: show.url }),
      ...(alternate ? { aniworld: alternate.url } : !aniWorld.length && old?.byAnilist?.[card.anilist]?.aniworld ? { aniworld: old.byAnilist[card.anilist].aniworld } : {}) };
  }
  if (old && Object.keys(byAnilist).length < Object.keys(old.byAnilist || {}).length / 2) throw new Error('Too few matches; kept previous links');
  await writeFile(output, JSON.stringify({ generated: new Date().toISOString(), byAnilist }, null, 1) + '\n');
  console.log(`Verified show links: ${Object.values(byAnilist).filter(s => s.subsplease).length} SubsPlease, ${Object.values(byAnilist).filter(s => s.aniworld).length} AniWorld`);
} catch (error) {
  console.log(`Fallback links not updated: ${error.message}`);
  if (fallbackOnly) process.exit(1);
}
if (fallbackOnly) process.exit(0);

const titles = await sheetTitles();
console.log(`Guckplan: ${titles.length} shows`);

// When the titles don't line up ("Part 2" vs "2nd Cour"), ask AniList which show is meant and
// find its LiveChart entry by the AniList link on the card.
async function anilistIds(title) {
  try {
  const res = await fetch('https://graphql.anilist.co', {
    signal: AbortSignal.timeout(8000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: 'query ($s: String) { Page(perPage: 10) { media(search: $s, type: ANIME) { id } } }', variables: { s: title } }),
  });
  return res.ok ? ((await res.json()).data?.Page?.media || []).map(m => String(m.id)) : [];
  } catch { return []; } // Optional title matching must not stop LiveChart updates during an outage.
}
// AniList's search misses some spellings ("Lulutto Lilly" is "LuluttoLilly" there), so try the
// variants one by one, slowly, until one leads to a card of these seasons.
async function cardByAnilist(t) {
  for (const v of [...new Set(t.filter(Boolean).flatMap(searchVariants))]) {
    const card = pickCard(t, v, await anilistIds(v.search), cards);
    if (card) return card;
    await new Promise(r => setTimeout(r, 2500));
  }
}

let slotNotes = {};
try { slotNotes = await timetableNotes(); } catch (e) { console.log(`Timetable notes not read: ${e.message}`); }

let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}

const byAnilist = {};
const release = {};
// Per show, for marking breaks on the page: its sheet titles, next episode and break news.
const status = {};
const unmatched = [];
// At the end of the log, one per line: these shows are missing from the page until fixed
// (a typo in the sheet, or a show LiveChart lists under another season).
const reportUnmatched = () => unmatched.length && console.log(
  `\nNOT FOUND on LiveChart (${unmatched.length}), so not on the page:\n${unmatched.map(s => `  - ${s}`).join('\n')}`);
const malOf = card => card.list?.mal?.match(/\/anime\/(\d+)/)?.[1];
for (const t of titles) {
  // The sheet's MyAnimeList link names the show exactly; titles are only the fallback
  let card = t.mal && cards.find(c => c.anilist && malOf(c) === t.mal);
  if (!card) {
    const scored = cards.map(c => ({ c, s: titleScore(t, c.titles) })).filter(x => x.s);
    const best = Math.max(0, ...scored.map(x => x.s));
    card = scored.find(x => x.s === best)?.c;
  }
  if (!card?.anilist) {
    const known = Object.entries(previous?.status || {}).find(([, s]) => titleScore(t, s.titles || []) === 2)?.[0];
    if (known) card = cards.find(c => c.anilist === known) || card;
  }
  if (!card?.anilist) card = await cardByAnilist(t);
  if (!card?.anilist) { unmatched.push(t.filter(Boolean).join(' / ') + (t.mal ? ` (MAL ${t.mal})` : ' (no MAL link in the sheet)')); continue; }
  if (status[card.anilist]) continue;
  // Streams and offsets depend on the region: only from home (Germany)
  byAnilist[card.anilist] = statusOnly ? [] : await streams(card.id);
  const { release: offset, next } = await schedules(card.id, (statusOnly ? previous?.byAnilist?.[card.anilist] || [] : byAnilist[card.anilist]).map(s => s.name));
  if (offset && !statusOnly) release[card.anilist] = offset;
  // From outside Germany the next episode keeps the offset found from home (not a foreign service's)
  if (statusOnly && next) next.at += (previous?.release?.[card.anilist]?.offset || 0) - (offset?.offset || 0);
  const news = await breakNews(card.id);
  const playlist = (statusOnly ? previous?.byAnilist?.[card.anilist] || [] : byAnilist[card.anilist]).find(s => /youtube\.com\/playlist\?list=/.test(s.url));
  let video = null;
  if (playlist) try { video = await newestVideo(playlist.url); } catch (e) { console.log(`    YouTube not read: ${e.message}`); }
  video ||= playlist && previous?.status?.[card.anilist]?.video || null;
  const notes = slotNotes[card.id] || [];
  // A recap is a broadcast, but not a regular episode. Preserve confirmed
  // annotations across daily builds because timetable notes are short-lived.
  const oldRecaps = previous?.status?.[card.anilist]?.recaps || [];
  const recapNotes = notes.filter(n => /\\brecap(?: episode)?\\b/i.test(n.text));
  const recaps = [...oldRecaps];
  for (const note of recapNotes) {
    const episode = next && Math.abs(next.at - note.at) < 2 * 86400 ? next.episode : null;
    if (episode && !recaps.some(r => r.episode === episode))
      recaps.push({ episode, at: next.at });
  }
  // Keep observed releases, not extrapolated weekly dates: delays and batches must stay exact.
  // New observations replace the old date for that episode if LiveChart reschedules it.
  const old = previous?.status?.[card.anilist];
  const observed = new Map([...(old?.airings || []), ...(old?.next ? [old.next] : []), ...(next ? [next] : [])]
    .filter(a => Number.isInteger(a.episode) && a.at > Date.now() / 1000 - 42 * 86400)
    .map(a => [a.episode, a]));
  status[card.anilist] = { titles: t, url: `https://www.livechart.me/anime/${card.id}`, next,
    airings: [...observed.values()].sort((a, b) => a.at - b.at).slice(-200), news, ...(recaps.length && { recaps }), ...(notes.length && { notes }), ...(video && { video }) };
  console.log(`${t[1] || t[0]}: ${byAnilist[card.anilist].map(s => s.name + (s.extra ? ` (+${s.extra})` : '')).join(', ') || '(none)'}` +
    (offset ? ` · ${offset.service} ${offset.offset >= 0 ? '+' : ''}${Math.round(offset.offset / 60)} min${offset.lag ? `, ${offset.lag} weeks behind` : ''}` : '') +
    (next ? '' : ' · nothing scheduled') + (video ? `\n    newest on YouTube: Episode ${video.episode}` : '') + news.map(n => `\n    news: ${n.title}`).join('') + notes.map(n => `\n    note: ${n.text}`).join(''));
}

// Explicit media status is independent of a missing next-episode date. Keep the last confirmed
// status on API failure; never turn a blank schedule into FINISHED.
const statusIds = Object.keys(status);
for (let i = 0; i < statusIds.length; i += 50) {
  const ids = statusIds.slice(i, i + 50);
  for (const id of ids) if (previous?.status?.[id]?.airingStatus) status[id].airingStatus = previous.status[id].airingStatus;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id status startDate { year month day } endDate { year month day } } } }', variables: { ids: ids.map(Number) } }),
    });
    if (!res.ok) throw new Error('Status API unavailable');
    const data = await res.json();
    if (!Array.isArray(data.data?.Page?.media)) throw new Error('Status response incomplete');
    for (const m of data.data.Page.media) if (status[m.id] && m.status) status[m.id].airingStatus = { status: m.status,
      startDate: m.startDate, endDate: m.endDate, checked: new Date().toISOString() };
  } catch { console.log('Airing status lookup unavailable; kept previously confirmed status.'); }
}

// Status only: the streams and offsets (and their date) stay as they were
if (statusOnly) {
  if (Object.keys(status).length < Object.keys(previous?.status || {}).length / 2) {
    console.log(`\nWARNING: only ${Object.keys(status).length} shows found (last time ${Object.keys(previous.status).length}); streams-de.json was NOT updated.`);
    process.exit(1);
  }
  await writeFile(OUT, JSON.stringify({ generated: previous?.generated || null, byAnilist: previous?.byAnilist || {}, release: previous?.release || {},
    status, statusUpdated: new Date().toISOString() }, null, 1) + '\n');
  console.log(`\nWrote the status of ${Object.keys(status).length} shows to streams-de.json (streams unchanged)`);
  reportUnmatched();
  process.exit(0);
}

// If LiveChart changed its layout, far fewer streams come back: keep the previous file (and
// skip the upload, which only runs after a successful build) instead of overwriting it.
const streamCount = data => Object.values(data?.byAnilist || {}).filter(s => s.length).length;
if (previous && streamCount({ byAnilist }) < streamCount(previous) / 2) {
  console.log(`\nWARNING: only ${streamCount({ byAnilist })} shows with streams (last time ${streamCount(previous)}). ` +
    'LiveChart may have changed its pages; streams-de.json was NOT updated.');
  process.exit(1);
}

await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), byAnilist, release, status }, null, 1) + '\n');
console.log(`\nWrote ${Object.keys(byAnilist).length} shows to streams-de.json`);
reportUnmatched();
