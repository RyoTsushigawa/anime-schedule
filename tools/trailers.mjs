// Trailer playlists: for every season list in the Google Sheet ("Winter 2027", "Frühling 2027", …) that
// hasn't started yet, an unlisted YouTube playlist "Trailer Winter 2027" with one trailer per NEW show, in the
// list's order. Sequels (AniList lists a prequel, or "Season 2" etc. in the title) and shows already in the
// previous season's list get none. Runs daily on GitHub (.github/workflows/trailers.yml); the planner links
// the playlist and the Season Preview page (season-preview.html) shows the trailers (season-trailers.json).
//
//   node tools/trailers.mjs             pick trailers for new shows, then bring the playlist in line
//   node tools/trailers.mjs --dry-run   only print the picks (still uses search quota, writes nothing)
//
// Secrets (GitHub): YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN (README, "Trailer-Playlist").
// Without them the run says so and stops without an error.
//
// Picking: AniList's trailer plus a YouTube search per show. Full trailers ("Trailer", "Main Trailer", "PV 2")
// beat teasers; 1–4 minutes; official channels; German/English subtitle tracks; blocked in Germany or not
// embeddable = out. A show is searched once; its pick is kept in trailers.json.
// A wrong pick: trailer-picks.json {"Winter 2027": {"<title as in the list>": "<YouTube video ID>"}} ("" = no trailer,
// "auto" = a new show although it looks like a sequel: its trailer is picked automatically).
//
// Quota: YouTube allows 10,000 units a day; a search costs 100, a playlist change 50. The run stops before the
// limit and the next day's run carries on.
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const dry = process.argv.includes('--dry-run');
const onlySeason = (() => { const i = process.argv.indexOf('--season'); return i > 0 ? process.argv[i + 1] : ''; })();
const BUDGET = Number(process.env.TRAILER_BUDGET || 9000);
const STATE = 'trailers.json', PICKS = 'trailer-picks.json';
const DAY = 86400000;
const log = (...a) => console.log(...a);

// the site's own sheet code (CSV, columns, title matching)
const ctx = { location: { search: '' }, fetch, URLSearchParams, console, setTimeout };
vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../common.js', import.meta.url), 'utf8') + '\n;Object.assign(globalThis, { SHEET, SEASON_MONTH, parseCsv, sheetFromRows, norm });', ctx);
const { SHEET, SEASON_MONTH, parseCsv, sheetFromRows, norm } = ctx;

const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const state = await readJson(STATE, { seasons: {} });
state.seasons ||= {};
const fixed = await readJson(PICKS, {});

// ---- season lists in the sheet that haven't started yet (or started less than three weeks ago)
let allLists = [];
async function seasonLists() {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  allLists = [...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)]
    .map(([, name, gid]) => ({ name: JSON.parse(`"${name}"`).trim(), gid }))
    .map(t => ({ ...t, m: t.name.match(/^(Winter|Frühling|Sommer|Herbst)\s+(\d{4})$/i) }))
    .filter(t => t.m)
    .map(({ name, gid, m }) => ({ name, gid, start: new Date(Number(m[2]), SEASON_MONTH[m[1].toLowerCase()], 1).getTime() }));
  return allLists.filter(t => t.start + 21 * DAY > Date.now() && (!onlySeason || t.name.toLowerCase() === onlySeason.toLowerCase()));
}
const SEASON_KEY = { winter: 'winter', frühling: 'spring', sommer: 'summer', herbst: 'fall' };
const seasonId = name => { const m = name.match(/^(Winter|Frühling|Sommer|Herbst)\s+(\d{4})$/i); return m ? `${SEASON_KEY[m[1].toLowerCase()]}-${m[2]}` : null; };
// the list three months earlier ("Herbst 2026" for "Winter 2027"), if it is in the sheet
const previousList = tab => allLists.find(t => { const d = new Date(tab.start); d.setMonth(d.getMonth() - 3); return t.start === d.getTime(); });
const SEQUEL_TITLE = /\b(?:season\s*[2-9]\d*|[2-9]\d*(?:st|nd|rd|th)\s+season|part\s*[2-9]|cour\s*[2-9]|s[2-9]|ii|iii|iv|final season|arc|hen)\b|\(sequel\)|編/i; // a named arc ("… Arc", "-hen") continues a show
// a trailer whose own title names a later season gives a sequel away even when AniList and the list don't
const SEQUEL_VIDEO = /\b(?:season\s*[2-9]\d*|[2-9]\d*(?:nd|rd|th)\s+season|cour\s*[2-9]|part\s*[2-9]|final season)\b|第[2-9二三四五]期|[2-9]期/i;
async function listShows(gid) {
  const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error('Google Sheet answered ' + res.status);
  return sheetFromRows(parseCsv(await res.text())).shows.filter(s => !s.hidden).map(s => ({ romaji: s.romaji, english: s.english }));
}

// ---- YouTube
let units = 0;
class Quota extends Error {}
// YouTube's separate daily limit for searches (about 100): picking stops, the playlist can still be changed
class SearchQuota extends Quota {}
let searchBlocked = '';
let access = '';
async function login() {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Google login failed (${res.status} ${json.error || ''} ${json.error_description || ''}). Is the consent screen "In production"? Otherwise the key expires after 7 days.`);
  access = json.access_token;
}
async function yt(path, params, cost, method = 'GET', body = null) {
  if (units + cost > BUDGET) throw new Quota('own budget reached');
  units += cost;
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${access}`, ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if ((res.status === 403 || res.status === 429) && /quota/i.test(JSON.stringify(json.error || '')))
    throw /search quer/i.test(JSON.stringify(json.error || '')) ? new SearchQuota('YouTube search limit for today reached') : new Quota('YouTube quota for today used up');
  if (!res.ok) throw new Error(`YouTube ${method} ${path}: ${res.status} ${json.error?.message || ''}`);
  return json;
}

// ---- AniList: titles and the listed trailer
async function anilist(show, start) {
  const d = new Date(start), season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(d.getMonth() / 3)];
  const q = `query ($s: String, $season: MediaSeason, $year: Int) { a: Page(perPage: 1) { media(search: $s, type: ANIME, season: $season, seasonYear: $year, sort: SEARCH_MATCH) { ...f } }
    b: Page(perPage: 1) { media(search: $s, type: ANIME, status_in: [NOT_YET_RELEASED, RELEASING], sort: SEARCH_MATCH) { ...f } } }
    fragment f on Media { id title { romaji english native } synonyms trailer { id site } relations { edges { relationType } } }`;
  for (let tries = 0; tries < 3; tries++) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables: { s: show.romaji || show.english, season, year: d.getFullYear() } }) });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 30000)); continue; }
    const json = await res.json().catch(() => ({}));
    return json.data?.a?.media?.[0] || json.data?.b?.media?.[0] || null;
  }
  return null;
}

// ---- picking
const OFFICIAL = /crunchyroll|aniplex|toho ?animation|muse ?asia|muse ?communication|ani-?one|kadokawa|pony ?canyon|avex|bandai ?namco|netflix|hidive|mappa|sentai|funimation|tms|king ?amuse|lantis|nbcuniversal|warner|shueisha|kodansha|square ?enix|bilibili|ufotable|toei|sunrise|cloverworks|a-1|frontier ?works|mbs|shopro|dmm|abc ?animation|公式|株式会社/i;
// channels that only collect or re-upload trailers: no official bonus, even with "Official" in the name
const COLLECTOR = /anime officials? trailer|animevibe|anime ?mojo|anime ?tenkai|geek realm|anime overview|tr anime/i;
const tokens = s => new Set(String(s || '').normalize('NFKD').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1 && !/^(the|no|wa|ga|wo|to|ni|de|of|a|an|season|part|cour|2nd|3rd|\d+th)$/.test(t)));
function matches(titles, text) {
  const have = tokens(text);
  return titles.filter(Boolean).some(t => { const want = [...tokens(t)]; return want.length && want.filter(w => have.has(w)).length / want.length >= 0.6; });
}
const seconds = iso => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
function score(v, titles, fromAniList, start) {
  const t = v.snippet.title, len = seconds(v.contentDetails.duration);
  if (!fromAniList && !matches(titles, t)) return -99;
  if (/\b(op|ed|opening|ending|creditless|non-?credit|reaction|review|episode|ep\.? ?\d|clip|amv|music video|mv|cm|commercial|preview|予告|ncop|nced|live|stream|interview)\b/i.test(t) && !/trailer|pv/i.test(t)) return -50;
  let s = 0;
  if (/main (trailer|pv)|official trailer|本pv|メインpv/i.test(t)) s += 5;
  else if (/trailer|\bpv\b|pv ?\d/i.test(t)) s += 3;
  if (/teaser|ティザー|特報|announcement|first look/i.test(t)) s -= 3;
  if (/pv ?[2-9]|trailer ?[2-9]|第[2-9]弾/i.test(t)) s += 1;
  if (len >= 60 && len <= 240) s += 2; else if (len < 40) s -= 4; else if (len > 360) s -= 6;
  if (OFFICIAL.test(v.snippet.channelTitle) && !COLLECTOR.test(v.snippet.channelTitle)) s += 3;
  // a film or concert of the franchise is not this show's trailer (unless the show itself is a film)
  if (/\bmovie\b|\bfilm\b|劇場版|concert|ライブ|\blive\b(?! action)/i.test(t) && !titles.some(x => /movie|film|劇場版/i.test(x || ''))) return -50;
  // subtitles in another language than German or English
  if (/vostfr|legendado|sub(titulado)? español|sub ita|\bfr\b|crunchyroll (fr|br|es|de dub)|latino/i.test(t + ' ' + v.snippet.channelTitle)) s -= 5;
  if (fromAniList) s += 2;
  if (v.contentDetails.caption === 'true') s += 2;
  if (/english sub|eng ?sub|english subtitles/i.test(t)) s += 2;
  if (/german|deutsch/i.test(t + ' ' + v.snippet.channelTitle) && !/dub/i.test(t)) s += 1;
  if (/\bdub\b|吹替/i.test(t)) s -= 1;
  // a trailer for this season is new: much older videos are usually from an earlier season
  const age = start - Date.parse(v.snippet.publishedAt || 0);
  if (age > 400 * DAY) s -= 5; else if (age < 270 * DAY) s += 1;
  return s;
}
const playable = v => v && v.status?.embeddable !== false && v.status?.privacyStatus === 'public'
  && !(v.contentDetails?.regionRestriction?.blocked || []).includes('DE')
  && !(v.contentDetails?.regionRestriction?.allowed && !v.contentDetails.regionRestriction.allowed.includes('DE'));

async function videos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50)
    out.push(...(await yt('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(',') }, 1)).items || []);
  return out;
}
// Reading subtitle tracks needs the login's "youtube.force-ssl" permission; without it this check is skipped
// (then only YouTube's "has subtitles" flag and titles like "English Subtitles" count).
let captionsAllowed = true;
async function subtitleLanguages(id) {
  if (!captionsAllowed) return [];
  let res;
  try { res = await yt('captions', { part: 'snippet', videoId: id }, 50); }
  catch (e) { if (!/insufficient authentication scopes|insufficientPermissions/i.test(e.message)) throw e; captionsAllowed = false; log('  (subtitle languages not readable with this login; using the subtitle flag only)'); return []; }
  return [...new Set((res.items || []).filter(c => c.snippet.trackKind !== 'asr').map(c => c.snippet.language.slice(0, 2)))];
}
async function pick(show, start) {
  const al = await anilist(show, start);
  if (!show.notSequel && (al?.relations?.edges?.some(e => e.relationType === 'PREQUEL' || e.relationType === 'PARENT') || SEQUEL_TITLE.test(`${show.romaji} ${show.english}`)))
    return { anilist: al?.id || null, video: null, skip: 'sequel', searched: new Date().toISOString() };
  const titles = [show.romaji, show.english, al?.title?.romaji, al?.title?.english, ...(al?.synonyms || [])];
  const alTrailer = al?.trailer?.site === 'youtube' ? al.trailer.id : '';
  const name = al?.title?.english || show.english || al?.title?.romaji || show.romaji;
  // AniList's own trailer is enough when it is clearly a full official trailer: no search needed
  // (a video lookup costs 1 unit and doesn't count toward the daily search limit)
  if (alTrailer) {
    const [v] = (await videos([alTrailer])).filter(playable);
    const t = v?.snippet.title || '';
    if (v && !show.notSequel && SEQUEL_VIDEO.test(t)) return { anilist: al?.id || null, video: null, skip: 'sequel', videoTitle: t, searched: new Date().toISOString() };
    if (v && score(v, titles, true, start) >= 9 && !/teaser|ティザー|特報|announcement/i.test(t))
      return { anilist: al?.id || null, skip: null, video: v.id, videoTitle: t, channel: v.snippet.channelTitle, via: 'anilist', searched: new Date().toISOString() };
  }
  const found = await yt('search', { part: 'snippet', type: 'video', maxResults: 10, q: `${name} anime trailer`, relevanceLanguage: 'en' }, 100);
  const ids = [...new Set([alTrailer, ...(found.items || []).map(i => i.id.videoId)].filter(Boolean))];
  const ranked = (await videos(ids)).filter(playable).map(v => ({ v, s: score(v, titles, v.id === alTrailer, start) })).filter(x => x.s > -10).sort((a, b) => b.s - a.s);
  // subtitles in German or English decide among the best few
  // (at most two checks, 50 units each, and only for candidates close to the best)
  for (const x of ranked.slice(0, 2)) if (x.v.contentDetails.caption === 'true' && x.s >= ranked[0].s - 4) {
    x.subs = await subtitleLanguages(x.v.id);
    if (x.subs.some(l => l === 'de' || l === 'en')) { x.s += 4; break; }
  }
  ranked.sort((a, b) => b.s - a.s);
  const best = ranked[0];
  if (best && !show.notSequel && SEQUEL_VIDEO.test(best.v.snippet.title))
    return { anilist: al?.id || null, video: null, skip: 'sequel', videoTitle: best.v.snippet.title, searched: new Date().toISOString() };
  return { anilist: al?.id || null, skip: null, video: best?.v.id || null, videoTitle: best?.v.snippet.title || '', channel: best?.v.snippet.channelTitle || '',
    ...(best?.subs && { subs: best.subs }), searched: new Date().toISOString() };
}

// ---- the playlist, in the list's order
async function playlistItems(id) {
  const items = [];
  let page = '';
  do {
    const res = await yt('playlistItems', { part: 'snippet', playlistId: id, maxResults: 50, ...(page && { pageToken: page }) }, 1);
    items.push(...(res.items || []).map(i => ({ item: i.id, video: i.snippet.resourceId.videoId })));
    page = res.nextPageToken || '';
  } while (page);
  return items;
}
async function sync(name, season) {
  let have = null;
  if (season.playlist) {
    // a playlist made moments ago can still be "not found" for a while; one deleted on YouTube stays so
    for (let i = 0; i < 3 && !have; i++) {
      try { have = await playlistItems(season.playlist); }
      catch (e) { if (!/cannot be found|playlistNotFound|404/.test(e.message)) throw e; log(`  Playlist not found yet (${i + 1}/3)`); await new Promise(r => setTimeout(r, 20000)); }
    }
    // never make a new one by itself (that could add a playlist every day): to start over, delete the
    // season's "playlist" and "url" in trailers.json
    if (!have) throw new Error(`Playlist ${season.playlist} not found on YouTube. If it was deleted, remove "playlist" and "url" for ${name} in trailers.json.`);
  }
  if (!season.playlist) {
    const made = await yt('playlists', { part: 'snippet,status' }, 50, 'POST', {
      snippet: { title: `Trailer ${name}`, description: `Trailer zur Liste „${name}“, in der Reihenfolge der Liste. Wird automatisch aktualisiert.` },
      status: { privacyStatus: 'unlisted' } });
    season.playlist = made.id;
    season.url = `https://www.youtube.com/playlist?list=${made.id}`;
    log(`Playlist made: ${season.url}`);
    have = [];
  }
  const want = [...new Set(season.shows.map(s => s.video).filter(Boolean))];
  // gone from the list (or another pick): out
  for (const x of have.filter(x => !want.includes(x.video) || have.findIndex(y => y.video === x.video) !== have.indexOf(x))) {
    await yt('playlistItems', { id: x.item }, 50, 'DELETE');
    have = have.filter(y => y !== x);
  }
  // then place every wanted video at its position
  for (const [pos, video] of want.entries()) {
    const at = have.findIndex(x => x.video === video);
    if (at === pos) continue;
    if (at < 0) {
      const added = await yt('playlistItems', { part: 'snippet' }, 50, 'POST', { snippet: { playlistId: season.playlist, position: pos, resourceId: { kind: 'youtube#video', videoId: video } } });
      have.splice(pos, 0, { item: added.id, video });
    } else {
      const [x] = have.splice(at, 1);
      await yt('playlistItems', { part: 'snippet' }, 50, 'PUT', { id: x.item, snippet: { playlistId: season.playlist, position: pos, resourceId: { kind: 'youtube#video', videoId: video } } });
      have.splice(pos, 0, x);
    }
  }
  season.synced = new Date().toISOString();
}

// ---- run
const lists = await seasonLists();
if (!lists.length) { log('No season list that is still ahead; nothing to do.'); process.exit(0); }
if (!process.env.YOUTUBE_REFRESH_TOKEN || !process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
  log(`Lists ahead: ${lists.map(t => t.name).join(', ')}. The YouTube secrets are not set yet (README, "Trailer-Playlist"); nothing done.`);
  process.exit(0);
}
await login();
let stopped = '', failure = null;
const save = async () => {
  if (dry) return;
  // seasons gone from the sheet's "ahead" lists are dropped four months after their last update
  for (const name of Object.keys(state.seasons)) if (!lists.some(t => t.name === name) && Date.now() - Date.parse(state.seasons[name].synced || 0) > 120 * DAY) delete state.seasons[name];
  state.updated = new Date().toISOString();
  await writeFile(STATE, JSON.stringify(state, null, 1) + '\n');
  // the Season Preview page's file: one automatic trailer per new show, sequels marked
  const page = await readJson('season-trailers.json', {});
  page.seasons ||= {};
  for (const [name, season] of Object.entries(state.seasons)) {
    const id = seasonId(name);
    if (!id) continue;
    const trailers = {};
    for (const s of season.shows) {
      const key = String(s.romaji || '').trim().toLocaleLowerCase();
      if (!key || s.skip === 'carryover') continue;
      if (s.skip === 'sequel') trailers[key] = { sequelStatus: 'sequel' };
      else if (s.video) trailers[key] = { auto: true, type: 'full_trailer', sequelStatus: 'not_sequel', youtubeId: s.video, title: s.videoTitle || '',
        ...(s.subs?.includes('de') ? { subtitles: 'de' } : s.subs?.includes('en') ? { subtitles: 'en' } : {}) };
      else if (s.searched || s.fixed) trailers[key] = { sequelStatus: 'not_sequel', youtubeStatus: 'not_found' };
    }
    page.seasons[id] = { title: name, ...(season.playlist && { youtubePlaylistId: season.playlist }), trailers };
  }
  for (const id of Object.keys(page.seasons)) if (!Object.keys(state.seasons).some(n => seasonId(n) === id)) delete page.seasons[id];
  page.description = 'Written by tools/trailers.mjs: one automatic trailer per new show of each season list ahead; sequels marked. A wrong pick goes into trailer-picks.json.';
  await writeFile('season-trailers.json', JSON.stringify(page, null, 1) + '\n');
};
try { for (const tab of lists) {
  const season = state.seasons[tab.name] ||= { gid: tab.gid, shows: [] };
  const known = new Map(season.shows.map(s => [norm(s.romaji || s.english), s]));
  const own = Object.fromEntries(Object.entries(fixed[tab.name] || {}).map(([k, v]) => [norm(k), v]));
  season.gid = tab.gid;
  season.shows = (await listShows(tab.gid)).map(s => ({ ...known.get(norm(s.romaji || s.english)), ...s }));
  const prev = previousList(tab);
  const before = prev ? new Set((await listShows(prev.gid)).flatMap(s => [s.romaji, s.english]).filter(Boolean).map(norm)) : null;
  for (const s of season.shows) {
    if (before && [s.romaji, s.english].filter(Boolean).some(t => before.has(norm(t)))) Object.assign(s, { video: null, skip: 'carryover' });
    else if (s.skip === 'carryover') { delete s.skip; delete s.searched; }
  }
  log(`${tab.name}: ${season.shows.length} shows in the list${prev ? `, ${season.shows.filter(s => s.skip === 'carryover').length} already in ${prev.name}` : ' (no previous list to compare)'}.`);
  try {
    for (const s of season.shows) {
      const key = norm(s.romaji || s.english);
      if (own[key] === 'auto') {
        // counted as new by hand: forget an earlier "sequel" and pick normally
        if (!s.notSequel) { delete s.skip; delete s.searched; delete s.fixed; s.notSequel = true; }
      } else if (s.notSequel) { delete s.notSequel; delete s.searched; }
      if (key in own && own[key] !== 'auto') { Object.assign(s, { video: own[key] || null, videoTitle: own[key] ? 'by hand' : '', channel: '', fixed: true, skip: null }); delete s.subs; continue; }
      if (s.fixed) { delete s.fixed; delete s.searched; }
      // a teaser or nothing yet: look again once a week until the season starts (main trailers come later)
      const again = s.searched && s.skip !== 'sequel' && Date.now() - Date.parse(s.searched) > 7 * DAY && Date.now() < tab.start
        && (!s.video || /teaser|ティザー|特報|super ?teaser|announcement/i.test(s.videoTitle || ''));
      if (!s.fixed && !s.notSequel && s.video && (SEQUEL_VIDEO.test(s.videoTitle || '') || SEQUEL_TITLE.test(`${s.romaji} ${s.english}`))) { Object.assign(s, { video: null, skip: 'sequel' }); log(`  ${s.english || s.romaji}: title or trailer names a later season or an arc, counted as a sequel now`); continue; }
      if ((s.searched && !again) || s.skip === 'carryover' || searchBlocked) continue;
      try { Object.assign(s, await pick(s, tab.start)); }
      catch (e) { if (!(e instanceof SearchQuota)) throw e; searchBlocked = e.message; log(`  ${e.message}; the remaining shows follow tomorrow.`); continue; }
      log(`  ${s.english || s.romaji}: ${s.skip === 'sequel' ? 'sequel, no trailer' : s.video ? `${s.videoTitle} · ${s.channel}${s.subs?.length ? ' · subs ' + s.subs.join('/') : ''}` : 'no trailer found'}`);
    }
    if (!dry) await sync(tab.name, season);
  } catch (e) {
    if (!(e instanceof Quota)) throw e;
    stopped = e.message;
    break;
  }
} } catch (e) { failure = e; }
// whatever was picked or changed so far is kept, also when something failed
await save();
log(`YouTube units used: ${units}.${stopped || searchBlocked ? ` Stopped: ${stopped || searchBlocked}; the next run carries on.` : ''}`);
if (failure) throw failure;
