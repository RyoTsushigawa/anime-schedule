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

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

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

async function sheetTitles() {
  const shows = [];
  for (const tab of await activeTabs()) {
    console.log(`Sheet tab: ${tab.name}`);
    const rows = parseCsv(await (await fetch(`${SHEET}/export?format=csv&gid=${tab.gid}`)).text());
    const headerIndex = rows.findIndex(r => r.some(c => c.trim() === 'Anime Titel'));
    const header = rows[headerIndex].map(c => c.trim());
    for (const r of rows.slice(headerIndex + 1)) {
      const romaji = (r[header.indexOf('Anime Titel')] || '').trim();
      if (!romaji) break;
      shows.push([romaji, (r[header.indexOf('Eng Anime Titel')] || '').trim()]);
    }
  }
  return shows;
}

const norm = s => String(s || '').normalize('NFKD').toLowerCase()
  .replace(/½/g, '12').replace(/\b(\d+)(st|nd|rd|th) season\b/g, 'season $1').replace(/[^a-z0-9]/g, '');

function titleScore(a, b) {
  const A = a.map(norm).filter(Boolean), B = b.map(norm).filter(Boolean);
  if (A.some(x => B.includes(x))) return 2;
  return A.some(x => B.some(y => Math.min(x.length, y.length) >= 8 && (x.startsWith(y) || y.startsWith(x)))) ? 1 : 0;
}

// ---------- LiveChart ----------

// A season's shows from its LiveChart page (TV; LiveChart sends the ONA page there too). Besides
// what's needed here, each card keeps what the season list in the sheet needs (seasons.json, read
// by the Season-Helfer script, since LiveChart doesn't answer Google's servers): premiere time
// and how exact it is, the rough start when not exact ("January 2027"), short form or not, the
// MyAnimeList link and LiveChart's "※ NOTE" lines.
async function seasonCards(season) {
  const cards = [];
  const html = await livechart(`/${season}/tv`);
  for (const [, attrs, body] of html.matchAll(/<article class="anime" ([^>]*)>([\s\S]*?)<\/article>/g)) {
    const attr = name => decode((attrs.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1] || '');
    let alternate = [];
    try { alternate = JSON.parse(attr('alternate') || '[]'); } catch {}
    cards.push({
      id: attr('anime-id'),
      anilist: (body.match(/anilist\.co\/anime\/(\d+)/) || [])[1],
      titles: [attr('romaji'), attr('english'), ...alternate],
      list: {
        romaji: attr('romaji'), english: attr('english'),
        premiere: Number(attr('premiere')) || null, precision: Number(attr('premiere-precision')) || 0,
        rough: decode((body.match(/data-intl-time-placeholder="([^"]*)"/) || [])[1] || ''),
        short: /<div class="anime-extra">Short-form<\/div>/.test(body),
        mal: (body.match(/class="mal-icon" href="([^"]+)"/) || [])[1] || '',
        notes: [...body.matchAll(/class="editor-note[^"]*"[^>]*>([^<]*)</g)]
          .map(m => decode(m[1]).replace(/^※\s*NOTE:\s*/i, '').trim()).filter(Boolean),
      },
    });
  }
  return cards;
}

const SEASONS_OUT = fileURLToPath(new URL('../seasons.json', import.meta.url));
async function writeSeasons(bySeason) {
  await writeFile(SEASONS_OUT, JSON.stringify({ generated: new Date().toISOString(),
    seasons: Object.fromEntries(Object.entries(bySeason).map(([season, cards]) => [season, cards.map(c => c.list)])) }) + '\n');
  console.log(`Wrote ${Object.keys(bySeason).join(', ')} to seasons.json`);
}

// Each stream with its service name and link, plus `extra` when LiveChart notes an add-on
// subscription (e.g. Prime Video titles that need the "aniverse" channel).
async function streams(livechartId) {
  const html = await livechart(`/anime/${livechartId}/streams`);
  const pattern = /<a class="link link-hover font-medium[^"]*" href="([^"]+)"[^>]*>([^<]+)<\/a>((?:<div class="text-sm text-base-content\/75">[^<]*<\/div>)*)/g;
  return [...html.matchAll(pattern)].map(([, url, name, notes]) => {
    const extra = decode(notes).match(/※\s*(.+?)\s+subscription required/i)?.[1];
    return { name: decode(name).trim(), url: decode(url), ...(extra && { extra }) };
  });
}

// From LiveChart's release schedules: `release`, how much later (in seconds) an episode comes out
// on one of our services than on Japanese TV (a subbed simulcast with German or English subtitles
// preferred, equally, and among those the earliest), and `next`, when the next episode is due
// (no `next` = nothing scheduled, e.g. finished).
const OUR_SERVICES = /crunchyroll|netflix|prime video|amazon|youtube|disney/i;
async function schedules(livechartId) {
  const html = await livechart(`/anime/${livechartId}/schedules`);
  const all = [...html.matchAll(/<article class="card[^"]*" data-controller="release-schedule"[\s\S]*?<\/article>/g)].map(([card]) => ({
    time: Number(card.match(/data-timestamp="(\d+)"/)?.[1]),
    episode: Number(card.match(/data-label="EP(\d+)"/)?.[1]),
    title: decode(card.match(/title="([^"]+)"/)?.[1] || ''),
    service: decode(card.match(/lc-text-contextual-accent"[^>]*>([^<]+)</)?.[1] || ''),
    readable: /(&quot;|")(de|en)(&quot;|")/i.test(card),
  })).filter(s => s.time && s.episode);
  // The original release: "Broadcast (Japan)", or "Streaming (Japan)" for web/foreign productions.
  const japan = all.find(s => /^(broadcast|streaming)\b/i.test(s.title));
  if (!japan) {
    // No original schedule: any upcoming one still means it isn't finished.
    const first = all.sort((a, b) => a.time - b.time)[0];
    return { release: null, next: first ? { episode: first.episode, at: first.time } : null };
  }
  const release = pickRelease(all, japan);
  return { release, next: { episode: japan.episode, at: japan.time + (release?.offset || 0) } };
}

function pickRelease(schedules, japan) {
  // Both count down to their own next episode; line them up on the same episode (weekly).
  const offsetOf = s => s.time - japan.time - (s.episode - japan.episode) * 7 * 86400;
  const ours = schedules.filter(s => /simulcast/i.test(s.title) && OUR_SERVICES.test(s.service))
    // Up to a day early (pre-streaming) or three days late; anything else means the episode
    // numbers don't line up, and the Japanese time is the better guess.
    .map(s => ({ ...s, offset: offsetOf(s) })).filter(s => s.offset > -86400 && s.offset < 3 * 86400)
    .sort((a, b) => a.offset - b.offset);
  const pick = ours.find(s => /subbed/i.test(s.title) && s.readable) || ours.find(s => /subbed/i.test(s.title)) || ours[0];
  return pick ? { offset: pick.offset, service: pick.service } : null;
}

// Recent (6 weeks) LiveChart headlines about a break or delay, newest first; the page shows the
// newest one's title as the reason.
const BREAK_NEWS = /\b(delay(ed|s)?|postpone[sd]?|break|hiatus|pushed back|suspend(ed|s)?|on hold|resum(e|es|ed|ing)|recap(s)?( episode)?|will not air|won'?t air|not air(ing)?|skip(s|ped|ping)?|special (program|broadcast)|preempt(ed|s)?|reschedul(e|ed|es)|production (issues?|reasons|circumstances)|cancel(l)?ed)\b/i;
async function breakNews(livechartId) {
  const html = await livechart(`/anime/${livechartId}/headlines`);
  const since = Date.now() - 42 * 86400 * 1000;
  return [...html.matchAll(/<a class="link link-hover font-medium" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<time datetime="([^"]+)"/g)]
    .map(([, url, title, date]) => ({ title: decode(title).trim(), url: decode(url), date }))
    .filter(n => BREAK_NEWS.test(n.title) && Date.parse(n.date) > since);
}

// Notes on LiveChart's timetable ("There will be no broadcast today due to sports coverage."),
// for this week and next: LiveChart id → [{at, text}] (at = the slot's time).
async function timetableNotes() {
  const notes = {};
  for (const days of [0, 7]) {
    const date = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const html = await livechart(`/timetable?date=${date}`);
    for (const [, at, slot] of html.matchAll(/data-controller="timeslot" data-timestamp="(\d+)"([\s\S]*?)(?=data-controller="timeslot"|$)/g))
      for (const [, id, body] of slot.matchAll(/lc-timetable-timeslot__note[\s\S]*?href="\/anime\/(\d+)"[\s\S]*?lc-markdown-html[^>]*>([\s\S]*?)<\/div>/g)) {
        const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (text && !(notes[id] || []).some(n => n.at === Number(at))) (notes[id] ||= []).push({ at: Number(at), text });
      }
  }
  return notes;
}

// --seasons-only: just the season lists (seasons.json), without the streams.
const seasonsOnly = process.argv.includes('--seasons-only');
const statusOnly = process.argv.includes('--status-only');
process.argv = process.argv.filter(a => a !== '--seasons-only' && a !== '--status-only');

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

const titles = await sheetTitles();
console.log(`Guckplan: ${titles.length} shows`);

// When the titles don't line up ("Part 2" vs "2nd Cour"), ask AniList which show is meant and
// find its LiveChart entry by the AniList link on the card.
async function anilistId(title) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: 'query ($s: String) { Media(search: $s, type: ANIME) { id } }', variables: { s: title } }),
  });
  return res.ok ? String((await res.json()).data.Media?.id || '') : '';
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
for (const t of titles) {
  const scored = cards.map(c => ({ c, s: titleScore(t, c.titles) })).filter(x => x.s);
  const best = Math.max(0, ...scored.map(x => x.s));
  let card = scored.find(x => x.s === best)?.c;
  if (!card?.anilist) {
    const id = await anilistId(t[0]) || await anilistId(t[1]);
    card = id && cards.find(c => c.anilist === id);
  }
  if (!card?.anilist) { unmatched.push(t[1] || t[0]); continue; }
  if (status[card.anilist]) continue;
  // Streams and offsets depend on the region: only from home (Germany)
  byAnilist[card.anilist] = statusOnly ? [] : await streams(card.id);
  const { release: offset, next } = await schedules(card.id);
  if (offset && !statusOnly) release[card.anilist] = offset;
  // From outside Germany the next episode keeps the offset found from home (not a foreign service's)
  if (statusOnly && next) next.at += (previous?.release?.[card.anilist]?.offset || 0) - (offset?.offset || 0);
  const news = await breakNews(card.id);
  const notes = slotNotes[card.id] || [];
  status[card.anilist] = { titles: t, next, news, ...(notes.length && { notes }) };
  console.log(`${t[1] || t[0]}: ${byAnilist[card.anilist].map(s => s.name + (s.extra ? ` (+${s.extra})` : '')).join(', ') || '(none)'}` +
    (offset ? ` · ${offset.service} ${offset.offset >= 0 ? '+' : ''}${Math.round(offset.offset / 60)} min` : '') +
    (next ? '' : ' · nothing scheduled') + news.map(n => `\n    news: ${n.title}`).join('') + notes.map(n => `\n    note: ${n.text}`).join(''));
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
  if (unmatched.length) console.log(`Not found on LiveChart: ${unmatched.join(' | ')}`);
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
if (unmatched.length) console.log(`Not found on LiveChart: ${unmatched.join(' | ')}`);
