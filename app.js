const returningVisitor = (() => { try { return Object.keys(localStorage).some(k => k === 'tabs' || k.startsWith('sheet:') || k.startsWith('week:')); } catch { return false; } })();
const QUERY = `query ($page: Int, $from: Int, $to: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      airingAt episode
      media {
        id idMal isAdult siteUrl episodes
        title { romaji english }
        synonyms
        coverImage { medium }
        externalLinks { site url }
      }
    }
  }
}`;
const cache = new Map();
let weekOffset = 0;
let mode = 'solo';
let soloPerson = DEFAULT_PERSON;
const selectedPeople = new Set([DEFAULT_PERSON]);
try {
mode = localStorage.getItem('mode') === 'group' ? 'group' : 'solo';
soloPerson = localStorage.getItem('soloPerson') || DEFAULT_PERSON;
const saved = JSON.parse(localStorage.getItem('people'));
if (Array.isArray(saved)) { selectedPeople.clear(); saved.filter(p => typeof p === 'string').forEach(p => selectedPeople.add(p)); }
} catch {}
const malLoginCode = new URLSearchParams(location.hash.slice(1)).get('mal_login');
if (malLoginCode) history.replaceState(null, '', location.pathname + location.search);
const listService = () => auth?.provider === 'mal' ? 'MyAnimeList' : 'AniList';
function ownPerson() {
let person = null;
try { person = localStorage.getItem('ownPerson'); } catch {}
if (person || !auth?.name) return person || soloPerson;
person = auth.name.toLowerCase() === DEFAULT_ANILIST.toLowerCase() ? DEFAULT_PERSON : soloPerson;
try { localStorage.setItem('ownPerson', person); } catch {}
return person;
}
const activePeople = () => mode === 'solo' ? [soloPerson].filter(Boolean) : [...selectedPeople];
const ANILIST_CLIENT_ID = 54702;
let accounts = [];
let auth = null;
try {
accounts = JSON.parse(localStorage.getItem('anilistAccounts')) || [];
const single = JSON.parse(localStorage.getItem('anilistAuth'));
if (single && !accounts.length) accounts = [single];
localStorage.removeItem('anilistAuth');
} catch {}
try { accounts.push(...(JSON.parse(localStorage.getItem('malAccounts')) || []).filter(a => a.provider === 'mal')); } catch {}
{
const params = new URLSearchParams(location.hash.slice(1));
if (params.get('access_token')) {
auth = { token: params.get('access_token'), expires: Date.now() + Number(params.get('expires_in') || 0) * 1000 };
accounts.push(auth);
history.replaceState(null, '', location.pathname + location.search);
let back = null;
try { back = sessionStorage.getItem('anilistReturn'); sessionStorage.removeItem('anilistReturn'); } catch {}
if (back && back.startsWith(location.origin + '/')) {
try { localStorage.setItem('anilistAccounts', JSON.stringify(accounts.filter(a => a.provider !== 'mal'))); } catch {}
location.replace(back);
}
}
}
accounts = accounts.filter(a => !a.expires || a.expires > Date.now());
if (!auth) {
let active = null;
let provider = 'anilist';
try { provider = localStorage.getItem('listProvider') || 'anilist'; active = localStorage.getItem(provider === 'mal' ? 'malActive' : 'anilistActive'); } catch {}
auth = accounts.find(a => a.name === active && (a.provider || 'anilist') === provider) || accounts[0] || null;
}
function saveAccounts() {
try {
localStorage.setItem('anilistAccounts', JSON.stringify(accounts.filter(a => a.provider !== 'mal')));
localStorage.setItem('malAccounts', JSON.stringify(accounts.filter(a => a.provider === 'mal')));
localStorage.setItem('listProvider', auth?.provider || 'anilist');
if (auth) localStorage.setItem(auth.provider === 'mal' ? 'malActive' : 'anilistActive', auth.name || '');
} catch {}
}
saveAccounts();
const accountKey = account => `${account?.provider || 'anilist'}:${account?.name || ''}`;
let syncPairs = {};
try { syncPairs = JSON.parse(localStorage.getItem('listSyncPairs')) || {}; } catch {}
function syncTargetFor(account) {
const pair = syncPairs[accountKey(account)];
return pair?.enabled ? accounts.find(a => accountKey(a) === pair.target && (a.provider || 'anilist') !== (account?.provider || 'anilist')) : null;
}
function updateSyncControls() {
const candidates = auth ? accounts.filter(a => (a.provider || 'anilist') !== (auth.provider || 'anilist')) : [];
$('listSyncSection').hidden = !candidates.length;
const pair = syncPairs[accountKey(auth)];
$('syncTarget').replaceChildren(new Option('Konto wählen', ''), ...candidates.map(a => new Option(`${a.provider === 'mal' ? 'MAL' : 'AniList'} · ${a.name}`, accountKey(a))));
$('syncTarget').value = pair?.target || '';
$('syncBoth').checked = !!syncTargetFor(auth);
$('syncBoth').disabled = !$('syncTarget').value;
}
const myProgress = new Map();
let accountLoading = false;
const DEFAULT_ANILIST = 'RyoTsushigawa';
let view = 'week';
$('anilistUser').value = DEFAULT_ANILIST;
try {
view = ['catchup', 'pace'].includes(localStorage.getItem('view')) ? localStorage.getItem('view') : 'week';
$('anilistUser').value = localStorage.getItem('anilistUser') ?? DEFAULT_ANILIST;
} catch {}
// Explicit navigation from Season Preview should open the requested weekly view.
if (new URLSearchParams(location.search).get('view') === 'week') view = 'week';
let streamsDe = null;
titleSource = id => streamsDe?.status?.[id]?.titles;
let fallbackLinks = { byAnilist: {} };
let sourceHealth = null;
fetch('source-health.json', {cache:'no-cache'}).then(r => r.ok ? r.json() : null).then(data => {
sourceHealth = data;
if (aniWorldDown()) load(true);
}).catch(() => {});
function aniWorldDown() {
const age = Date.now() - Date.parse(sourceHealth?.checked);
return sourceHealth?.aniworld === 'down' && age >= 0 && age < 90 * 60000;
}
const fallbackSources = new Map();
try { for (const [person,value] of Object.entries(JSON.parse(localStorage.getItem('fallbackSources') || '{}'))) if (['aniworld','torrent'].includes(value)) fallbackSources.set(person,value); } catch {}
const fallbackChoice = person => fallbackSources.get(person) || (person.toLowerCase() === 'rei' ? 'torrent' : 'aniworld');
function updateFallbackControls() {
const selected = new Set(activePeople().map(fallbackChoice));
for (const b of document.querySelectorAll('[data-fallback-source]')) {
b.setAttribute('aria-pressed',String(selected.has(b.dataset.fallbackSource)));
b.disabled = !activePeople().length;
}
updatePrimeControls();
}
for (const b of document.querySelectorAll('[data-fallback-source]')) b.onclick = () => {
for (const person of activePeople()) fallbackSources.set(person,b.dataset.fallbackSource);
try { localStorage.setItem('fallbackSources',JSON.stringify(Object.fromEntries(fallbackSources))); } catch {}
updateFallbackControls(); redraw();
};
const primeChoices = new Map();
try { for (const [person, value] of Object.entries(JSON.parse(localStorage.getItem('primeChoices') || '{}'))) if (value === 'torrent') primeChoices.set(person, value); } catch {}
const primeChoice = person => primeChoices.get(person) || 'prime';
function updatePrimeControls() {
const selected = new Set(activePeople().map(primeChoice));
for (const b of document.querySelectorAll('[data-prime-choice]')) {
b.setAttribute('aria-pressed', String(selected.has(b.dataset.primeChoice)));
b.disabled = !activePeople().length;
}
}
for (const b of document.querySelectorAll('[data-prime-choice]')) b.onclick = () => {
for (const person of activePeople()) {
if (b.dataset.primeChoice === 'torrent') primeChoices.set(person, 'torrent'); else primeChoices.delete(person);
}
try { localStorage.setItem('primeChoices', JSON.stringify(Object.fromEntries(primeChoices))); } catch {}
updatePrimeControls(); redraw();
};
async function loadFallbackLinks() {
try {
const response = await fetch('fallback-links.json', { cache: 'no-cache' });
if (!response.ok) return;
const data = await response.json();
if (data?.byAnilist && typeof data.byAnilist === 'object') { fallbackLinks = data; MAL.seed(data); }
} catch {}
}
let tabs = [];
const SERVICES = [
{ match: /crunchyroll/i, label: 'Crunchyroll', color: '#ff5e00', wo: 'C', main: true, search: 'https://www.crunchyroll.com/search?q=' },
{ match: /netflix/i, label: 'Netflix', color: '#e50914', wo: 'N', main: true, search: 'https://www.netflix.com/search?q=' },
{ match: /amazon|prime video|^prime$/i, label: 'Prime', color: '#0578ff', wo: 'AM', main: true, search: 'https://www.primevideo.com/search/?phrase=' },
{ match: /youtube/i, label: 'YouTube', color: '#ff0000', wo: 'Y', main: true },
{ match: /disney/i, label: 'Disney+', color: 'var(--disney)', wo: 'D+', main: true, search: 'https://www.disneyplus.com/search?q=' },
{ match: /hidive/i, label: 'HIDIVE', color: '#00aeef', wo: 'H' },
{ match: /^adn$|animation digital network/i, label: 'ADN', color: '#0095ff', wo: 'ADN' },
];
const dataNotes = new Map();
function setNote(source, text) {
if ((dataNotes.get(source) || null) === (text || null)) return false;
text ? dataNotes.set(source, text) : dataNotes.delete(source);
return true;
}
const unreachable = name => navigator.onLine === false ? "Du bist offline" : `${name} antwortet nicht`;
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dayName = date => DAY_NAMES[date.getDay()];
const DISCORD_PINGS = { sophie: '<@&1554739610628923452>' };
const shortDayName = date => dayName(date).slice(0, 2);
const germanDate = date => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(date);
const shortDayDate = date => `${shortDayName(date)}, ${germanDate(date)}`;
const savedAt = time => `${shortDayName(new Date(time))} ${new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
function notesHtml(scoped = []) {
const lines = new Set([...dataNotes].filter(([k]) => !k.includes(':') || scoped.includes(k)).map(([, t]) => t));
return lines.size ? `<div class="datanote" role="status">${[...lines].map(t => `<div>${esc(t)}</div>`).join('')}</div>` : '';
}
const failed = text => `<div class="status">${esc(text)}<br><button class="pill retry">Nochmal versuchen</button></div>`;
const sheets = new Map();
const sheetFor = tab => {
const key = tab.gid + ':' + (tab.catalogGid || '');
if (!sheets.has(key)) {
const onChange = fresh => { sheets.set(key, Promise.resolve(fresh)); load(true); };
const onFresh = e => { if (setNote('sheet ' + tab.gid, e && `${unreachable('Google Sheets')}: „${tab.name}“ wie zuletzt in diesem Browser gespeichert.`)) load(true); };
sheets.set(key, savedOrFresh('sheet:' + key, () => loadPlan(tab), onChange, onFresh)
.catch(e => { sheets.delete(key); throw e; }));
}
return sheets.get(key);
};
function weekStart(offset) {
const d = new Date();
d.setHours(0, 0, 0, 0);
d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
return d;
}
const WEEK_CACHE_MS = 30 * 60 * 1000;
const WEEK_KEEP_MS = 7 * 86400 * 1000;
const fallbackWeeks = new Set();
const lagOf = id => streamsDe?.release?.[id]?.lag || 0;
async function liveChartWeek(start) {
await streamsReady;
if (!Object.keys(streamsDe?.status || {}).length) return null;
const end = new Date(start); end.setDate(end.getDate() + 7);
const items = [];
for (const [id, status] of Object.entries(streamsDe.status)) {
if (!/^\d+$/.test(id) || !status.titles?.length) continue;
const seen = new Set();
for (const airing of [...status.airings || [], ...status.next ? [status.next] : []]) {
const at = airing.at - (streamsDe.release?.[id]?.offset || 0);
if (!Number.isInteger(airing.episode) || airing.episode < 1 || !Number.isFinite(at) || at * 1000 < start || at * 1000 >= end || seen.has(airing.episode)) continue;
seen.add(airing.episode);
items.push({ airingAt: at, episode: airing.episode, media: {
id: Number(id), idMal: fallbackLinks.byAnilist[id]?.malId, isAdult: false, title: { romaji: status.titles[0], english: status.titles[1] || status.titles[0] },
synonyms: status.titles, siteUrl: status.url || `https://anilist.co/anime/${id}`,
coverImage: { medium: '' }, externalLinks: [],
} });
}
}
fallbackWeeks.add(start.getTime());
setNote('week:' + start.getTime(), `${unreachable('AniList')}: nutze LiveChart (${savedAt(Date.parse(streamsDe.statusUpdated || streamsDe.generated))}) und den Guckplan. Unbestätigte Folgennummern werden ausgelassen.`);
return items;
}
let readiedWeek = null;
function readyNeighbours(start) {
if (readiedWeek === start.getTime() || navigator.onLine === false || navigator.connection?.saveData || fallbackWeeks.has(start.getTime())) return;
readiedWeek = start.getTime();
const whenIdle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1000);
whenIdle(() => {
if (document.hidden || readiedWeek !== start.getTime() || view !== 'week') return;
for (const by of [7, -14]) {
const week = new Date(start);
week.setDate(week.getDate() + by);
fetchWeek(week).catch(() => {});
for (const tab of activeTabs(tabs, week)) sheetFor(tab).catch(() => {});
}
for (const by of [7, -7]) {
const week = new Date(start);
week.setDate(week.getDate() + by);
readyCovers(week).catch(() => {});
}
});
}
const readiedCovers = new Set();
async function readyCovers(week) {
if (navigator.connection?.saveData) return;
const [items, sheets] = await Promise.all([fetchWeek(week), Promise.all(activeTabs(tabs, week).map(sheetFor))]);
const people = activePeople();
const shows = sheets.flatMap(sheet => people.flatMap(p => [...picks(sheet, p)].map(([show]) => show)));
for (const { media: m } of items) {
const url = m.coverImage?.medium;
if (!url || m.isAdult || readiedCovers.has(url)) continue;
if (!shows.some(s => titleMatches([s.romaji, s.english], mediaTitles(m)))) continue;
readiedCovers.add(url);
new Image().src = safeUrl(url);
}
}
function planIds(start) {
if (!streamsDe?.status) return null;
if (!tabs.length) { if (start < Date.now() - 28 * 86400000) return null; }
else {
const covered = activeTabs(tabs, new Date());
if (!activeTabs(tabs, start).every(t => covered.includes(t))) return null;
}
const ids = new Set(Object.keys(streamsDe.status).filter(id => /^\d+$/.test(id)).map(Number));
for (const m of rewatchMedia.values()) if (m?.id && m.status !== 'FINISHED') ids.add(m.id);
return ids.size ? [...ids].sort((a, b) => a - b) : null;
}
const weekKeys = start => [...cache.keys()].filter(k => String(k).split(':')[0] === String(start.getTime()));
const weekCached = start => weekKeys(start).length > 0;
const forgetWeek = start => weekKeys(start).forEach(k => cache.delete(k));
async function fetchWeek(start) {
await streamsReady;
const ids = planIds(start);
const key = start.getTime() + (ids ? ':' + ids.join(',') : '');
if (!cache.has(key)) cache.set(key, downloadWeek(start, ids).catch(e => { cache.delete(key); throw e; }));
return cache.get(key);
}
async function downloadWeek(start, ids) {
const storeKey = 'week:' + start.getTime();
let saved = null;
try { saved = fixTitles(JSON.parse(localStorage.getItem(storeKey))); } catch {}
if (saved && saved.ids && (!ids || ids.some(id => !saved.ids.includes(id)))) saved = null;
if (saved && Date.now() - saved.time < WEEK_CACHE_MS) return saved.items;
if (saved) {
downloadAirings(start, ids).then(items => {
fallbackWeeks.delete(start.getTime());
storeWeek(storeKey, items, ids);
const noted = setNote(storeKey, null);
if (JSON.stringify(items) !== JSON.stringify(saved.items)) {
cache.set(start.getTime() + (ids ? ':' + ids.join(',') : ''), Promise.resolve(items));
load(true);
} else if (noted) load(true);
}, () => { if (setNote(storeKey, `${unreachable('AniList')}: Sendetermine vom ${savedAt(saved.time)}.`)) load(true); });
return saved.items;
}
let items;
try {
items = await downloadAirings(start, ids);
} catch (e) {
const fallback = await liveChartWeek(start);
if (fallback) return fallback;
throw new Error(navigator.onLine === false ? "Du bist offline, und diese Woche ist in diesem Browser noch nicht gespeichert."
: "AniList antwortet gerade nicht (es begrenzt, wie oft man fragen darf). Versuch es in einer Minute nochmal.");
}
storeWeek(storeKey, items, ids);
fallbackWeeks.delete(start.getTime());
setNote(storeKey, null);
return items;
}
function storeWeek(storeKey, items, ids) {
try {
for (const k of Object.keys(localStorage)) if (k.startsWith('week:') && k !== storeKey) {
const t = JSON.parse(localStorage.getItem(k))?.time;
if (!t || Date.now() - t > WEEK_KEEP_MS) localStorage.removeItem(k);
}
localStorage.setItem(storeKey, JSON.stringify({ time: Date.now(), items, ...(ids && { ids }) }));
} catch {}
}
const PLAN_QUERY = QUERY.replace('$to: Int)', '$to: Int, $ids: [Int])').replace('sort: TIME)', 'mediaId_in: $ids, sort: TIME)');
async function downloadAirings(start, ids) {
const end = new Date(start);
end.setDate(end.getDate() + 7);
const from = Math.floor(start / 1000) - 1;
const to = Math.floor(end / 1000);
const items = [];
for (let page = 1; ; page++) {
const data = await anilist(ids ? PLAN_QUERY : QUERY, { page, from, to, ...(ids && { ids }) }, undefined, { retries: 0, timeout: 8000 });
items.push(...data.Page.airingSchedules);
if (!data.Page.pageInfo.hasNextPage) return items;
}
}
const slotLabel = s => [s?.tag, s?.time].filter(Boolean).join(' ') || 'kein Tag';
const moveButton = (show, slot) => !movesKey || !show ? '' :
`<button class="move" data-move-title="${esc(show.romaji || show.english)}" data-move-name="${esc(show.english || show.romaji)}"
    data-tag="${esc(slot?.tag || '')}" data-time="${esc(slot?.time || '')}" data-moved="${slot?.from ? 1 : ''}" data-skip="${slot?.skip ? 1 : ''}" data-keep-time="${slot?.keepTime ? 1 : ''}"
    data-from-tag="${esc((slot?.from || slot)?.tag || '')}" data-from-time="${esc((slot?.from || slot)?.time || '')}" draggable="true" title="Auf einen Tag oder Slot ziehen, oder klicken, um ein Ziel einzugeben" aria-label="Verschieben"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
// LiveChart's note in a few words: "Recap der Folgen 1–6", the reason after "due to", otherwise the note itself
const noteReason = note => /\brecap\b/i.test(note.text)
? 'Recap' + (note.text.match(/recap of episodes?\s+(\d+\s*[–-]\s*\d+)/i) ? ` der Folgen ${note.text.match(/recap of episodes?\s+(\d+\s*[–-]\s*\d+)/i)[1].replace(/\s*[–-]\s*/, '–')}` : '')
: note.text.match(/\b(?:due to|because of)\s+(.+?)\.?$/i)?.[1]
|| note.text.replace(/\btoday\b/i, 'am ' + shortDayDate(new Date(note.at * 1000)));
const reasonHtml = (note, news, none) => note
? esc(noteReason(note))
: news?.length ? `<a href="${safeUrl(news[0].url)}" target="_blank" rel="noopener">${esc(news[0].title)}</a>` : none;
const NEXT_KEEP_MS = 6 * 3600000;
const aniNext = new Map();
const airingFacts = new Map();
const pendingNext = new Set();
const dateOf = d => d?.year && d?.month && d?.day ? new Date(d.year, d.month - 1, d.day).getTime() : null;
const finishedBy = (facts, end) => facts?.status === 'FINISHED' && (!dateOf(facts.endDate) || dateOf(facts.endDate) < end);
function finishedThisSeason(media, start) {
const since = new Date(start); since.setMonth(since.getMonth() - 3);
return (dateOf(media.endDate) || dateOf(media.startDate) || 0) >= since.getTime();
}
const covers = (() => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem('covers')) || {})); } catch { return new Map(); } })();
const coversTried = new Set(), pendingCovers = new Set();
function keepCovers() { try { localStorage.setItem('covers', JSON.stringify(Object.fromEntries(covers))); } catch {} }
function rememberCover(m) {
const url = m?.coverImage?.medium;
if (!url || covers.get(String(m.id)) === url) return;
covers.set(String(m.id), url);
keepCovers();
}
function coverFor(id) {
if (!(Number(id) > 0)) return '';
const url = covers.get(String(id));
if (!url && !coversTried.has(String(id))) pendingCovers.add(String(id));
return url || '';
}
async function lookUpCovers() {
const ids = [...pendingCovers];
pendingCovers.clear();
ids.forEach(id => coversTried.add(id));
try {
for (let i = 0; i < ids.length; i += 50)
for (const m of (await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id coverImage { medium } } } }',
{ ids: ids.slice(i, i + 50).map(Number) }, undefined, { retries: 0, timeout: 8000 })).Page.media) rememberCover(m);
} catch {}
}
function nextFromAniList(id) {
if (!aniNext.has(id)) {
try {
const saved = JSON.parse(localStorage.getItem('next:' + id));
if (saved && Date.now() - saved.time < NEXT_KEEP_MS) {
aniNext.set(id, saved.next);
if (saved.facts) airingFacts.set(id, saved.facts);
}
} catch {}
}
if ((!aniNext.has(id) || !airingFacts.has(id)) && aniNext.get(id) !== 'failed') pendingNext.add(id);
return aniNext.get(id);
}
async function lookUpNext() {
const ids = [...pendingNext];
pendingNext.clear();
let media = [];
try {
for (let i = 0; i < ids.length; i += 50) media.push(...(await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id status startDate { year month day } endDate { year month day } nextAiringEpisode { episode airingAt } } } }',
{ ids: ids.slice(i, i + 50).map(Number) }, undefined, { retries: 0, timeout: 8000 })).Page.media);
} catch {
for (const id of ids) aniNext.set(id, 'failed');
return;
}
for (const id of ids) {
const m = media.find(m => String(m.id) === String(id));
if (!m) { aniNext.set(id, 'failed'); continue; }
const n = m.nextAiringEpisode;
const next = n ? { episode: n.episode, at: n.airingAt } : null;
const facts = { status: m.status, startDate: m.startDate, endDate: m.endDate };
airingFacts.set(id, facts);
aniNext.set(id, next);
try { localStorage.setItem('next:' + id, JSON.stringify({ time: Date.now(), next, facts })); } catch {}
}
}
const rewatchMedia = new Map();
const pendingRewatch = new Set();
const REWATCH_QUERY = `query ($search: String) {
  Media(search: $search, type: ANIME) {
    id status startDate { year month day } endDate { year month day } nextAiringEpisode { episode airingAt }
    siteUrl title { romaji english } coverImage { medium } externalLinks { site url }
  }
}`;
function rewatchFor(show) {
const key = 'rewatch:' + norm(show.romaji || show.english);
if (!rewatchMedia.has(key)) {
try {
const saved = JSON.parse(localStorage.getItem(key));
if (saved && Date.now() - saved.time < WEEK_KEEP_MS) rewatchMedia.set(key, fixTitles(saved.media));
} catch {}
}
if (!rewatchMedia.has(key)) pendingRewatch.add(show);
return rewatchMedia.get(key);
}
async function lookUpRewatches() {
for (const show of [...pendingRewatch]) {
pendingRewatch.delete(show);
const key = 'rewatch:' + norm(show.romaji || show.english);
let media;
try {
media = (await anilist(REWATCH_QUERY, { search: show.romaji || show.english })).Media;
} catch (e) {
rewatchMedia.set(key, 'failed');
if (e.status !== 404) continue;
media = null;
}
rewatchMedia.set(key, media);
try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), media })); } catch {}
}
}
const sourceSearchTitle = title => String(title || '').replace(/^(Even the Student Council Has (?:Its )?Holes)!$/i, '$1');
function nyaaQuery(titles) {
const short = title => {
const parts = String(title).match(/^(.{8,}?)\s*:\s+(.+)$/);
const long = parts && parts[2].trim().split(/\s+/).length >= 4 && !/\b(?:season|part|cour|final|ii|iii|iv|\d+(?:st|nd|rd|th)?)\b/i.test(parts[2]);
return (long ? parts[1] : String(title)).replace(/["|()]/g, ' ').replace(/\s+-\s*/g, ' ').replace(/\s+/g, ' ').trim();
};
const seen = new Set();
const list = titles.filter(Boolean).map(t => short(sourceSearchTitle(t))).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
return list.length > 1 ? list.map(t => `(${t})`).join('|') : list[0] || 'anime';
}
const OTHER_SERVICE_COLORS = [[/akiba/i, '#ff1a00'], [/it'?s anime/i, '#ff0000']];
function streamLinks(media, wo, searchTitle) {
const links = [];
links.title = searchTitle || media.title?.english || media.title?.romaji || '';
links.names = [links.title, media.title?.english, media.title?.romaji];
const de = streamsDe?.byAnilist[media.id];
if (de?.length) {
const video = streamsDe.status?.[media.id]?.video?.url;
for (const { name, url: listUrl, extra } of de) {
const url = video && /youtube\.com\/playlist/.test(listUrl) ? video : listUrl;
const s = SERVICES.find(s => s.match.test(name));
const label = (s?.label || name) + (extra ? ' + ' + extra : '');
if (!links.some(l => l.url === url))
links.push({ url, label, color: s?.color || OTHER_SERVICE_COLORS.find(([match]) => match.test(name))?.[1] || 'var(--muted)', main: !!s?.main && !extra, first: !!s && s.wo === wo && !extra });
}
return links.sort((a, b) => b.first - a.first);
}
for (const s of SERVICES) {
if (s.wo === 'Y' && wo !== 'Y') continue;
const series = (media.externalLinks || []).find(l => s.match.test(l.site));
if (series) links.push({ url: series.url, label: s.label, color: s.color, main: !!s.main, first: s.wo === wo });
}
const service = SERVICES.find(s => s.wo === wo);
if (service?.search && !links.some(l => l.first))
links.unshift({ url: service.search + encodeURIComponent(sourceSearchTitle(searchTitle)), label: service.label + ' 🔍', color: service.color, main: !!service.main, first: true });
return links.sort((a, b) => b.first - a.first);
}
function watchDay(aired, tag, time) {
const day = new Date(aired);
const hm = parseTime(time);
if (hm && hm[0] < NIGHT_UNTIL && day.getHours() * 60 + day.getMinutes() <= hm[0] * 60 + hm[1])
day.setDate(day.getDate() - 1);
day.setHours(0, 0, 0, 0);
const target = WEEKDAYS.indexOf(String(tag || '').toLowerCase().replace(/\W/g, '').slice(0, 2));
if (target < 0) return day;
day.setDate(day.getDate() + (target - (day.getDay() + 6) % 7 + 7) % 7);
return day;
}
try { localStorage.removeItem('resumeWatching'); localStorage.removeItem('resumeServices'); } catch {}
const SERVICE_ICONS = [[/crunchyroll/i, 'crunchyroll'], [/netflix/i, 'netflix'], [/prime video|amazon|^prime$/i, 'prime-video'], [/disney/i, 'disney'],
[/^adn$|animation digital network/i, 'adn'], [/youtube|it'?s anime/i, 'youtube'], [/akiba/i, 'akiba'], [/hidive/i, 'hidive']];
const serviceIcon = label => {
const icon = SERVICE_ICONS.find(([match]) => match.test(label))?.[1];
return icon ? `<span class="svc-icon" style="-webkit-mask-image:url(services/${icon}.svg);mask-image:url(services/${icon}.svg)"></span>` : '';
};
const ALTERNATIVE_LOOK = [[/^aniworld/i, 'aniworld.png', '#657efa'], [/^subsplease/i, 'subsplease.png', 'var(--text)'],
[/^nyaa/i, 'nyaa.png', '#3582f7'], [/^0neko/i, '0neko.ico', 'var(--text)']];
function alternativeButton(l) {
const [, icon, color] = ALTERNATIVE_LOOK.find(([match]) => match.test(l.label));
return `<a class="cr none" style="${serviceStyle(color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Alternative Quelle${l.label.endsWith('Suche') ? ': keine genaue Serienseite gefunden' : ''}">${icon ? `<img class="site-icon" src="services/${icon}" alt="" width="18" height="18">` : ''}${esc(l.label)}</a>`;
}
const TEXT_LIFT = { '#e50914': '30%', '#0578ff': '12%', '#ff0000': '25%', '#ff1a00': '15%', '#657efa': '8%', '#3582f7': '8%' };
const serviceStyle = color => `--svc:${color}${TEXT_LIFT[color] ? ';--text-lift:' + TEXT_LIFT[color] : ''}`;
function linkButtons(links, mediaId, watchers) {
const button = l => l.main
? `<a class="cr" style="${serviceStyle(l.color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener">${serviceIcon(l.label)}${esc(l.label)}</a>`
: `<a class="cr other" style="${serviceStyle(l.color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Verfügbar, aber kein Dienst, den wir haben">${serviceIcon(l.label)}${esc(l.label)}</a>`;
const listed = links.filter(l => l.main);
const people = watchers ? activePeople().filter(p => watchers.includes(p)) : activePeople();
const isPrime = l => l.main && /^Prime\b/.test(l.label);
const primeSwap = listed.some(isPrime) && people.some(p => primeChoice(p) === 'torrent');
const shown = primeSwap && people.every(p => primeChoice(p) === 'torrent') ? listed.filter(l => !isPrime(l)) : listed;
const torrent = people.some(p => fallbackChoice(p) === 'torrent');
const streaming = !people.length || people.some(p => fallbackChoice(p) === 'aniworld');
const source = fallbackLinks.byAnilist[mediaId] || {};
const title = sourceSearchTitle(links.title || source.title || 'anime');
const alternatives = [];
if (primeSwap || (torrent && !listed.length)) alternatives.push(/^https:\/\/subsplease\.org\/shows\/[^\s"<>]+$/.test(source.subsplease || '')
? { label: 'SubsPlease', url: source.subsplease }
: { label: 'Nyaa-Suche', url: 'https://nyaa.si/?f=0&c=1_2&q=' + encodeURIComponent(nyaaQuery([...(links.names || [title]), source.title])) });
if (streaming && !listed.length && aniWorldDown() && Number(mediaId) > 0) alternatives.push({ label: '0neko', url: 'https://0neko.cc/#/anime/' + Number(mediaId) });
else if (streaming && !listed.length) alternatives.push(/^https:\/\/aniworld\.to\/anime\/stream\/[^\s"<>]+$/.test(source.aniworld || '')
? { label: 'AniWorld', url: source.aniworld }
: { label: 'AniWorld-Suche', url: 'https://aniworld.to/search?q=' + encodeURIComponent(title) });
return shown.map(button).join('') + alternatives.map(alternativeButton).join('');
}
const searchKey = (...titles) => `data-search="${esc(titles.filter(Boolean).map(norm).join(' '))}"`;
function applySearch() {
const q = norm($('search').value);
const items = [...document.querySelectorAll('#list [data-search]')];
for (const el of items) el.classList.toggle('hidden-by-search', !!q && !el.dataset.search.includes(q));
for (const day of document.querySelectorAll('#list .day'))
day.classList.toggle('hidden-by-search', !!q && !day.querySelector('[data-search]:not(.hidden-by-search)'));
for (const box of document.querySelectorAll('#list .shared:not([data-search])'))
box.classList.toggle('hidden-by-search', !!q && !box.querySelector('[data-search]:not(.hidden-by-search)'));
if (q) for (const fold of document.querySelectorAll('#list details.not-listed:not([open])'))
if (fold.querySelector('[data-search]:not(.hidden-by-search)')) fold.open = true;
// how many shows match, so a shorter list explains itself
const hits = q ? new Set([...document.querySelectorAll('#list [data-search]:not(.hidden-by-search)')].map(el => el.dataset.search)).size : 0;
let count = $('matchCount');
if (hits) {
if (!count) { count = document.createElement('div'); count.id = 'matchCount'; count.className = 'notice'; count.setAttribute('role', 'status'); }
count.textContent = `${hits} Treffer${view === 'week' ? ' in dieser Woche' : ''}`;
if (!count.isConnected) $('list').prepend(count);
} else count?.remove();
let none = $('noMatch');
if (q && items.length && !document.querySelector('#list [data-search]:not(.hidden-by-search)')) {
if (!none) {
none = document.createElement('div');
none.id = 'noMatch';
none.className = 'nomatch';
const message = document.createElement('span');
message.setAttribute('role', 'status');
const clear = document.createElement('button');
clear.type = 'button';
clear.className = 'pill';
clear.textContent = 'Suche leeren';
clear.onclick = () => {
$('search').value = '';
$('search').focus();
searchChanged();
};
none.append(message, clear);
}
none.firstElementChild.textContent = `Keine Serie passt zu „${$('search').value.trim()}“${view === 'week' ? ' in dieser Woche' : ''}.`;
if (!none.isConnected) $('list').prepend(none);
} else none?.remove();
}
const searching = () => !!norm($('search').value);
let searchedWeek = false;
function searchChanged() {
if (view === 'week' && range !== 'week' && searching() !== searchedWeek) load(true);
else applySearch();
searchedWeek = searching();
}
$('search').addEventListener('input', searchChanged);
$('list').addEventListener('click', e => {
const chip = e.target.closest('#airingWarnings');
if (!chip) return;
alertsOpen = !alertsOpen;
chip.setAttribute('aria-expanded', String(alertsOpen));
$('airingBody').hidden = !alertsOpen;
});
function openSearch(open) {
$('searchBox').classList.toggle('open', open);
document.body.classList.toggle('searching', open);
$('searchButton').setAttribute('aria-expanded', String(open));
$('searchButton').setAttribute('aria-label', open ? 'Suche leeren und schließen' : 'Serien suchen');
if (open) $('search').focus();
}
$('searchButton').onclick = () => {
const open = $('searchBox').classList.contains('open');
if (open) { $('search').value = ''; searchChanged(); }
openSearch(!open);
};
$('search').addEventListener('blur', e => {
if (e.relatedTarget === $('searchButton')) return;
if (!$('search').value) openSearch(false);
});
$('search').addEventListener('keydown', e => {
if (e.key !== 'Escape') return;
$('search').value = '';
searchChanged();
openSearch(false);
$('searchButton').focus();
});
{
let lastY = scrollY;
const header = document.querySelector('header');
addEventListener('scroll', () => {
const y = scrollY;
const keep = innerWidth > 560 || y <= 4 || document.body.classList.contains('searching')
|| document.querySelector('header .popover:not([hidden])') || header.contains(document.activeElement);
if (keep || y < lastY - 4) header.classList.remove('away');
else if (y > lastY + 4) header.classList.add('away');
if (Math.abs(y - lastY) > 4) lastY = y;
}, { passive: true });
}
function tick() {
const now = Date.now();
for (const r of document.querySelectorAll('.row[data-fade-at]'))
r.classList.toggle('aired', now >= Number(r.dataset.fadeAt));
document.querySelector('.now-line')?.remove();
const items = [...document.querySelectorAll('.day.is-today > .row[data-fade-at], .day.is-today > .shared:has(.row[data-fade-at])')];
const byRelease = choices.time === 'release';
const done = r => byRelease && r.dataset.at ? now >= Number(r.dataset.at) : r.classList.contains('aired');
const past = el => [...el.matches('.row') ? [el] : el.querySelectorAll('.row[data-fade-at]')].every(done);
const next = items.findIndex(el => !past(el));
if (next !== 0 && items.length)
(next > 0 ? items[next] : items.at(-1)).insertAdjacentHTML(next > 0 ? 'beforebegin' : 'afterend', '<div class="now-line" aria-hidden="true"><span>Jetzt</span></div>');
document.querySelector('.next-watch-slot')?.classList.remove('next-watch-slot');
if (!byRelease && next >= 0) items[next].classList.add('next-watch-slot');
if (document.visibilityState !== 'hidden' && new Date().toDateString() !== shownDay) freshen();
}
setInterval(tick, 30000);
const COME_BACK_MS = 30 * 60000;
let shownDay = new Date().toDateString();
let hiddenAt = 0;
async function freshen(fetchAgain = false) {
if (document.querySelector('dialog[open], #markAll.sure, .drop[data-sure], .move-dragging')) return;
shownDay = new Date().toDateString();
if (fetchAgain) {
const start = weekStart(weekOffset), lastWeek = new Date(start);
lastWeek.setDate(lastWeek.getDate() - 7);
forgetWeek(start); forgetWeek(lastWeek);
sheets.clear();
if (auth) await loadMe().catch(() => {});
}
return load(true);
}
document.addEventListener('visibilitychange', () => {
if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
const away = hiddenAt && Date.now() - hiddenAt >= COME_BACK_MS;
if (away || new Date().toDateString() !== shownDay) freshen(away).finally(restoreOpenedShow);
else restoreOpenedShow();
hiddenAt = 0;
});
const FIRST_SLOT = [19, 0];
const SLOT_MINUTES = 30;
function assignWatchTimes(day) {
const at = (h, m) => new Date(day.date).setHours(h < NIGHT_UNTIL ? h + 24 : h, m, 0, 0);
const taken = new Set();
for (const r of day.rows) {
const hm = parseTime(r.slot.time);
r.watchAt = hm ? at(...hm) : null;
if (hm) taken.add(r.watchAt);
}
let i = 0;
for (const r of day.rows.filter(r => r.watchAt === null).sort((a, b) => a.when - b.when)) {
do r.watchAt = at(FIRST_SLOT[0], FIRST_SLOT[1] + SLOT_MINUTES * i++); while (taken.has(r.watchAt));
taken.add(r.watchAt);
}
day.rows.sort((a, b) => a.watchAt - b.watchAt || a.when - b.when);
}
function delayClock(date, clock) {
const hm = parseTime(clock);
if (!hm) return null;
const at = new Date(date);
at.setHours(hm[0] + (hm[0] < NIGHT_UNTIL ? 24 : 0), hm[1], 0, 0);
return at.getTime();
}
// Date-specific preference, only used when an actual (non-manual) pause exists.
function pauseShiftEnabled(date) {
  try { return localStorage.getItem('pauseShift:' + date) !== '0'; } catch { return true; }
}
function applyDelays(day, timeline = day) {
const list = delaysOf(isoDay(day.date));
const keyOf = r => norm(r.show?.romaji || r.show?.english || '');
const startOf = x => x.show[0] === '@' ? delayClock(day.date, x.show.slice(1))
: timeline.rows.find(r => keyOf(r) === x.show)?.plannedAt ?? timeline.rows.find(r => keyOf(r) === x.show)?.watchAt;
day.delayStarts = list.map(x => ({ ...x, at: startOf(x) })).filter(x => x.at != null);
const planned = r => r.plannedAt ?? r.watchAt;
const slots = new Map();
for (const r of timeline.rows) slots.set(planned(r), [...slots.get(planned(r)) || [], r]);
// Automatic breaks may free a slot just like a manually skipped show.
// A Keep Time row is an anchor: never move it or pull later shows past it.
const autoMovePauses = pauseShiftEnabled(isoDay(day.date));
const freed = [...slots].filter(([, rs]) => rs.every(r => r.pause && !r.slot?.keepTime)
  && rs.some(r => r.skipped || autoMovePauses)).map(([at]) => at);
const anchors = [...slots].filter(([, rs]) => rs.some(r => r.slot?.keepTime)).map(([at]) => at);
// A double episode ("Doppelt") or an overlong one ("Lang", LiveChart) needs two slots: later shows move back.
const twoEpisodes = r => r.slot?.double && r.episodes?.length > 1;
const extraSlots = r => !r.pause && !r.extra && (twoEpisodes(r) || r.long) ? 1 : 0;
const longs = [...slots].map(([at, rs]) => [at, Math.max(0, ...rs.map(extraSlots))]).filter(([, n]) => n);
for (const r of day.rows) {
const shared = timeline.rows.find(other => keyOf(other) === keyOf(r));
if (shared && timeline !== day) r.watchAt = planned(shared);
const minutes = day.delayStarts.filter(x => r.watchAt >= x.at).reduce((n, x) => n + x.minutes, 0);
const anchor = Math.max(-Infinity, ...anchors.filter(at => at <= r.watchAt));
const earlier = r.pause || r.slot?.keepTime ? 0
  : freed.filter(at => at < r.watchAt && at > anchor).length * SLOT_MINUTES;
const later = r.pause || r.slot?.keepTime ? 0
  : longs.filter(([at]) => at < r.watchAt && at > anchor).reduce((n, [, k]) => n + k, 0) * SLOT_MINUTES;
if (minutes || earlier || later) Object.assign(r, { plannedAt: r.watchAt, delay: minutes, earlier, later, watchAt: r.watchAt + (minutes + later - earlier) * 60000 });
}
}
function nearDayName(date) {
const start = new Date(); start.setHours(0, 0, 0, 0);
const away = Math.round((new Date(date).setHours(0, 0, 0, 0) - start) / 86400000);
return away === 0 ? 'Heute' : away === 1 ? 'Morgen' : '';
}
function releaseOrder(groups) {
const releasedAt = group => Math.min(...group.map(r => r.it ? new Date(r.when).getTime() : Infinity));
return [...groups].sort((a, b) => {
const [x, y] = [releasedAt(a), releasedAt(b)];
return x === y ? 0 : x - y;
});
}
const LOADING_HTML = '<div class="status loading">Lädt…</div><div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
var enter = null;
// whether the overview chip above the week is open (kept across redraws)
var alertsOpen = false;
function episodeTags(episodes, total) {
const tag = text => `<span class="ep-tag">${text}</span>`;
if (total === 1) return '';
return (Math.min(...episodes) === 1 ? tag('Premiere') : '') + (total && Math.max(...episodes) === total ? tag('Finale') : '');
}
const artStyle = m => m?.coverImage?.medium ? `style="--art:url(&quot;${safeUrl(m.coverImage.medium)}&quot;)"` : '';
const calmMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
var lastWeekRender = null;
var glideFrom = null;
const GLIDERS = '#list .row, #list .day > h2';
const glideKey = el => el.matches('h2') ? 'day ' + el.parentElement.dataset.date : el.dataset.search || '';
const innerLeft = (el, part) => el.querySelector(part)?.getBoundingClientRect().left ?? null;
function rememberPlaces() {
if (calmMotion()) return;
glideFrom = new Map();
for (const el of document.querySelectorAll(GLIDERS)) {
const key = glideKey(el);
if (!glideFrom.has(key)) glideFrom.set(key, []);
const { left, top, bottom } = el.getBoundingClientRect();
glideFrom.get(key).push({ left, top, bottom, time: el.querySelector('.time')?.textContent, img: innerLeft(el, 'img'), info: innerLeft(el, '.info') });
}
}
function playGlide() {
const from = glideFrom;
glideFrom = null;
if (!from || calmMotion()) return;
const glide = { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)' }, fade = { duration: 200, easing: 'ease-out' };
const seen = (top, bottom) => bottom > 0 && top < innerHeight;
for (const el of document.querySelectorAll(GLIDERS)) {
const now = el.getBoundingClientRect(), was = from.get(glideKey(el))?.shift();
if (!seen(now.top, now.bottom) && !(was && seen(was.top, was.bottom))) continue;
for (const img of el.querySelectorAll('img')) { img.loading = 'eager'; img.decoding = 'sync'; }
if (!was || el.closest('.shared')) { el.animate?.([{ opacity: 0 }, { opacity: 1 }], fade); continue; }
if (was.left !== now.left || was.top !== now.top)
el.animate?.([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }], glide);
const time = el.querySelector('.time');
if (time && time.textContent !== was.time) time.animate?.([{ opacity: 0 }, { opacity: 1 }], fade);
for (const [part, left] of [['img', was.img], ['.info', was.info]]) {
const moved = left === null ? 0 : left - was.left - ((innerLeft(el, part) ?? now.left) - now.left);
if (moved) el.querySelector(part).animate?.([{ transform: `translateX(${moved}px)` }, { transform: 'none' }], glide);
}
}
}
function redrawWeek() {
if (view !== 'week' || !lastWeekRender || lastWeekRender[1].getTime() !== weekStart(weekOffset).getTime()) return false;
rememberPlaces();
render(...lastWeekRender);
glideFrom = null;
chaseLookups();
return true;
}
const redraw = () => { if (!redrawWeek()) load(true); };
function chaseLookups() {
if (pendingRewatch.size) lookUpRewatches().then(() => load(true));
if (pendingNext.size) lookUpNext().then(() => load(true));
if (pendingCovers.size) lookUpCovers().then(() => load(true));
}
function playEnter() {
playGlide();
const move = enter;
enter = null;
if (!move || calmMotion()) return;
$('list').animate?.([{ opacity: 0, transform: `translate(${move.x || 0}px, ${move.y || 0}px)` }, { opacity: 1, transform: 'none' }], { duration: 110, easing: 'ease-out' });
}
window.ResizeObserver && new ResizeObserver(() => document.documentElement.style.setProperty('--head', document.querySelector('header').offsetHeight + 'px')).observe(document.querySelector('header'));
function scrollToStart() {
const today = range === 'week' && weekOffset === 0 && !searching() && document.querySelector('#list .day.is-today');
const top = today ? today.getBoundingClientRect().top + window.scrollY - document.querySelector('header').offsetHeight - 10 : 0;
window.scrollTo(0, Math.max(0, top));
}
const showScores = new WeakMap();
const renderedDayHtml = new WeakMap();
function updateWeekMarkup(html, keepDays) {
const list = $('list');
if (!keepDays) {
list.innerHTML = html;
for (const day of list.querySelectorAll(':scope > .day[data-date]')) renderedDayHtml.set(day, day.outerHTML);
return;
}
const template = document.createElement('template');
template.innerHTML = html;
const nextDays = new Set([...template.content.querySelectorAll('.day[data-date]')].map(day => day.dataset.date));
const days = new Map();
for (const day of list.querySelectorAll(':scope > .day[data-date]')) {
if (nextDays.has(day.dataset.date)) days.set(day.dataset.date, day);
else day.remove();
}
let cursor = list.firstElementChild;
for (const next of [...template.content.children]) {
while (next.dataset.date && cursor && !cursor.dataset.date) {
const extra = cursor;
cursor = cursor.nextElementSibling;
extra.remove();
}
const old = days.get(next.dataset.date);
const markup = next.outerHTML;
const node = old && renderedDayHtml.get(old) === markup ? old : cursor?.isEqualNode(next) ? cursor : next;
if (node !== cursor) {
if (cursor && (next.dataset.date ? cursor === old : !cursor.dataset.date)) cursor.replaceWith(node);
else list.insertBefore(node, cursor);
}
cursor = node.nextElementSibling;
if (next.dataset.date) renderedDayHtml.set(node, markup);
}
while (cursor) {
const next = cursor.nextElementSibling;
cursor.remove();
cursor = next;
}
}
// shifted: the group's final times from a first pass (delays, Lang/Doppelt), so "ab 21:00" absences
// are checked at the time a show is really watched
function render(items, start, plans, everyone = false, keepDays = false, shifted = null) {
if (!everyone) lastWeekRender = [items, start, plans];
const restore = everyone ? null : preserveListPosition();
if (!everyone) updateFallbackControls();
const fallback = fallbackWeeks.has(start.getTime());
const people = everyone ? [...new Set([...plans.values()].flatMap(s => s.people))] : activePeople();
if (!people.length) {
$('list').innerHTML = '<div class="status">Keine Person ausgewählt.<button class="pill empty-action" data-pick-people>Personen auswählen</button></div>';
return;
}
const whoBySheet = new Map();
const chosen = new Map([...plans.values()].map(s => {
const merged = new Map();
const who = new Map();
for (const p of s.people)
for (const [show, slot] of picks(s, p)) {
if (people.includes(p) && !merged.get(show)?.time) merged.set(show, slot);
who.set(show, [...who.get(show) || [], p]);
}
for (const [show, slot] of merged) {
const mv = moveFor(show, start);
if (mv?.skip) merged.set(show, { ...slot, ...(mv.tag && { tag: mv.tag, time: mv.time }), skip: true, keepTime: !!mv.keepTime, from: slot });
else if (mv) merged.set(show, { ...slot, tag: mv.tag, time: mv.time, from: slot, ...(mv.double && { double: true }), ...(mv.long && { long: true }) });
}
whoBySheet.set(s, who);
return [s, merged];
}));
const showWho = $('who').checked;
const others = who => mode === 'solo' ? who?.filter(p => !activePeople().includes(p)) : who;
const whoChips = (all, away = [], maybe = []) => { const who = others(all); return showWho && who?.length
? `<span class="who">${who.map(p => away.includes(p) ? maybe.includes(p) ? `<span class="away maybe" title="Spontan da">${esc(p)}</span>` : `<span class="away" title="Abwesend">${esc(p)}</span>` : `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}${who.length > 2 ? `<button class="who-more" data-more="+${who.length - 2}" aria-expanded="false" aria-label="Alle anzeigen: ${esc(who.join(', '))}">+${who.length - 2}</button>` : ''}</span>` : ''; };
const found = new Set();
const droppedByMe = id => !everyone && !!auth && mode === 'solo' && soloPerson === ownPerson() && knownEntries.get(Number(id))?.status === 'DROPPED';
const today = new Date().toDateString();
const days = [];
for (let i = 0; i < 7; i++) {
const d = new Date(start);
d.setDate(d.getDate() + i);
days.push({ date: d, rows: [] });
}
const score = (s, m) => {
let known = showScores.get(s);
if (!known) showScores.set(s, known = new Map());
let value = known.get(m.id);
if (value === undefined) known.set(m.id, value = titleScore([s.romaji, s.english], mediaTitles(m)));
return value;
};
const best = new Map();
const showsOf = sheet => sheet ? [...sheet.shows, ...[...chosen.get(sheet).keys()].filter(s => !sheet.shows.includes(s))] : [];
for (const sheet of plans.values())
for (const s of showsOf(sheet)) best.set(s, Math.max(0, ...items.map(it => score(s, it.media))));
for (const it of items) {
const m = it.media;
MAL.rememberMedia(m);
if (m.isAdult) continue;
const when = new Date((it.airingAt + (streamsDe?.release?.[m.id]?.offset || 0)) * 1000);
const episode = it.episode - lagOf(m.id);
if (episode < 1) continue;
let show, sheet;
for (const tab of activeTabs(tabs, when)) {
sheet = plans.get(tab.gid);
const matches = showsOf(sheet).filter(s => best.get(s) > 0 && score(s, m) === best.get(s));
show = matches.find(s => chosen.get(sheet).has(s)) || matches[0];
if (show) break;
}
const slot = show && chosen.get(sheet).get(show);
if (!slot) continue;
rememberCover(m);
const links = streamLinks(m, show.wo, m.title.english || m.title.romaji);
const day = days.find(d => d.date.toDateString() === watchDay(when, slot.tag, slot.time).toDateString());
if (!day) continue;
found.add(show);
if (droppedByMe(m.id)) continue;
if (slot.skip) {
if (!day.rows.some(r => r.skipped && r.show === show)) day.rows.push({ pause: true, skipped: true, show, slot, when, episode, alId: m.id, links, who: whoBySheet.get(sheet)?.get(show) });
continue;
}
// LiveChart's recap broadcasts still appear in AniList's airing schedule. They
// are not regular episodes, even when watched on a different weekday.
const recap = (streamsDe?.status?.[m.id]?.recaps || []).find(r =>
  r.episode === it.episode && Math.abs(r.at * 1000 - it.airingAt * 1000) < 2 * 86400000);
const long = slot.long || (streamsDe?.status?.[m.id]?.long || []).some(r => r.finale ? it.episode === m.episodes
  : r.episode === it.episode && (!r.at || Math.abs(r.at * 1000 - it.airingAt * 1000) < 2 * 86400000));
if (recap) {
  if (!day.rows.some(r => r.show === show))
    day.rows.push({ pause: true, recap: true, show, slot, when, episode, alId: m.id, note: { text: 'Recap episode', at: it.airingAt }, news: [] });
  continue;
}
const existing = days.flatMap(d => d.rows).find(r => r.m?.id === m.id);
if (existing) existing.episodes.push(episode);
else day.rows.push({ it, m, links, when, slot, show, episodes: [episode], who: whoBySheet.get(sheet).get(show), ...(long && { long }) });
}
for (const x of moves.filter(m => m.extra && m.week === isoDay(start) && m.media?.id)) {
const day = days.find(d => isoDay(d.date) === x.day);
if (!day) continue;
const m = { ...x.media, coverImage: x.media.coverImage || { medium: '' }, title: x.media.title || {} };
const name = m.title.english || m.title.romaji || x.title;
const episodes = Array.from({ length: Math.max(1, x.last - x.first + 1) }, (_, i) => x.first + i);
day.rows.push({ extra: x, m, links: streamLinks(m, undefined, name), when: new Date(day.date), episodes, who: [],
slot: { tag: DAY_TAGS[(day.date.getDay() + 6) % 7], time: x.time || '' },
show: { romaji: `${m.title.romaji || name} · Nachholen`, english: `${name} · Nachholen` } });
}
const heads = p => p === 'MaRyo' ? 2 : 1;
const fullDays = !everyone && (delays.length || absent.length || moves.some(m => m.skip || m.double || m.long)
  || Object.values(streamsDe?.status || {}).some(s => s.long?.length)) ? render(items, start, plans, true) : null;
const showKey = (day, r) => isoDay(day.date) + '|' + norm(r.show?.romaji || r.show?.english || '');
const finalAt = shifted || (fullDays && new Map(fullDays.flatMap(d => d.rows.filter(r => !r.pause && r.watchAt != null).map(r => [showKey(d, r), r.watchAt]))));
for (const day of days) {
// planned times first, so "ab 21:00" / "bis 20:00" know when each show is (assigned again below)
assignWatchTimes(day);
const dayStart = new Date(day.date).setHours(0, 0, 0, 0);
day.rows = day.rows.map(r => {
if (r.pause || !r.episodes) return r;
if (r.slot?.double) { const first = Math.min(...r.episodes); if (first > 1 && !r.episodes.includes(first - 1)) r.episodes.unshift(first - 1); }
const at = finalAt?.get(showKey(day, r)) ?? r.watchAt;
const minute = at == null ? null : Math.round((at - dayStart) / 60000);
const isAway = p => awayAt(isoDay(day.date), p, minute);
const missing = (r.who || []).filter(isAway);
const left = (r.who || []).filter(p => !isAway(p)).reduce((n, p) => n + heads(p), 0);
if (!missing.length) return r;
const maybe = missing.filter(p => absent.some(x => x.day === isoDay(day.date) && x.maybe && x.people?.includes(p)));
if (left > 1) return { ...r, away: missing, maybe };
return { pause: true, skipped: true, show: r.show, slot: r.slot, when: r.when, episode: Math.min(...r.episodes), missing, maybe, alId: r.m?.id, links: r.links, who: r.who };
});
}
const weekTabs = new Set(days.map(d => tabFor(tabs, d.date).gid));
const weekEnd = days[6].date.getTime() + 86400000;
const unknown = [];
const breaks = [];
const busy = () => `${unreachable('AniList')}, daher ist unklar, ob sie läuft`;
for (const [show, slot] of !streamsDe ? [] : [...weekTabs].flatMap(gid => plans.has(gid) ? [...chosen.get(plans.get(gid))] : [])) {
if (found.has(show)) continue;
if ([...found].some(f => titleMatches([f.romaji, f.english], [show.romaji, show.english]))) continue;
const [alId, status] = Object.entries(streamsDe?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles)) || [];
if (droppedByMe(alId)) continue;
let upcoming = status?.next;
if (finishedBy(airingFacts.get(alId) || status?.airingStatus, weekEnd)) continue;
if (fallback) {
const day = days.find(d => WEEKDAYS.indexOf(norm(slot.tag).slice(0, 2)) === (d.date.getDay() + 6) % 7);
if (!day) { unknown.push({ show, why: 'Kein Guck-Tag im Guckplan eingetragen' }); continue; }
const note = (status?.notes || []).find(n => n.at * 1000 >= start.getTime() - 86400000 && n.at * 1000 < weekEnd);
if (upcoming?.at * 1000 >= weekEnd && note) {
const why = { note: note || null, news: status.news || [] };
const when = new Date(upcoming.at * 1000);
day.rows.push({ pause: true, show, slot, when, episode: upcoming.episode - lagOf(alId), alId, ...why });
breaks.push({ show, when, episode: upcoming.episode - lagOf(alId), ...why });
} else {
const m = { id: Number(alId) || 0, title: { romaji: show.romaji, english: show.english }, externalLinks: [], coverImage: { medium: coverFor(alId) } };
day.rows.push({ fallback: true, show, slot, when: day.date, m, links: streamLinks(m, show.wo, show.english || show.romaji), who: [...whoBySheet.values()].find(w => w.has(show))?.get(show) });
}
found.add(show);
continue;
}
if (status && (!upcoming || upcoming.at * 1000 < days[0].date.getTime())) {
const fresh = nextFromAniList(alId);
if (finishedBy(airingFacts.get(alId), weekEnd)) continue;
if (fresh === undefined) { unknown.push({ show, why: 'checking AniList…' }); continue; }
if (fresh === 'failed') { unknown.push({ show, why: busy() }); continue; }
upcoming = fresh && { episode: fresh.episode, at: fresh.at + (streamsDe?.release?.[alId]?.offset || 0) };
}
if (status && !upcoming) {
unknown.push({ show, why: airingFacts.get(alId)?.status === 'RELEASING'
? 'Läuft noch; nächster Folgentermin nicht angekündigt' : 'Ausstrahlung konnte nicht bestätigt werden' });
continue;
}
const day = days.find(d => WEEKDAYS.indexOf(norm(slot.tag).slice(0, 2)) === (d.date.getDay() + 6) % 7);
if (!day) { unknown.push({ show }); continue; }
if (weekEnd < Date.now()) {
const back = status && [...(status.airings || []), ...(upcoming ? [upcoming] : [])]
.filter(a => a.at * 1000 >= weekEnd).sort((a, b) => a.at - b.at)[0];
if (back?.episode - lagOf(alId) <= 1) continue;
if (!back) { unknown.push({ show }); continue; }
upcoming = back;
}
const next = upcoming && new Date(upcoming.at * 1000);
if (next && next >= weekEnd) {
const note = (status.notes || []).find(n => n.at * 1000 >= days[0].date.getTime() - 86400000 && n.at * 1000 < weekEnd);
const why = { note: note || null, news: status.news || [] };
day.rows.push({ pause: true, show, slot, when: next, episode: upcoming.episode - lagOf(alId), alId, ...why });
breaks.push({ show, when: next, episode: upcoming.episode - lagOf(alId), ...why });
found.add(show);
continue;
}
const media = !status && rewatchFor(show);
if (media && media !== 'failed' && droppedByMe(media.id)) continue;
if (media === 'failed') unknown.push({ show, why: busy() });
else if (media && media.status === 'FINISHED') {
if (finishedThisSeason(media, start)) continue;
const links = streamLinks(media, show.wo, media.title.english || media.title.romaji);
day.rows.push({ rewatch: true, m: media, links, slot, show, when: day.date, who: [...whoBySheet.values()].find(w => w.has(show))?.get(show) });
found.add(show);
} else if (media?.nextAiringEpisode && new Date(media.nextAiringEpisode.airingAt * 1000) >= weekEnd) {
const when = new Date((media.nextAiringEpisode.airingAt + (streamsDe?.release?.[media.id]?.offset || 0)) * 1000);
const why = { note: null, news: [] };
day.rows.push({ pause: true, show, slot, when, episode: media.nextAiringEpisode.episode - lagOf(media.id), alId: media.id, ...why });
breaks.push({ show, when, episode: media.nextAiringEpisode.episode - lagOf(media.id), ...why });
found.add(show);
} else unknown.push({ show, why: media === undefined ? 'Ausstrahlung wird geprüft…'
: media?.status === 'RELEASING' ? 'Läuft noch; kein Folgentermin für diese Woche bestätigt'
: 'Serie nicht gefunden oder Ausstrahlung nicht bestätigt' });
}
// A recap week can also come out as a break: AniList doesn't count the recap as an episode, so the
// show has none this week. LiveChart still has the recap (or its note) for this week: it's a recap.
const recapThisWeek = r => {
  const status = streamsDe?.status?.[r.alId];
  const inWeek = at => at * 1000 >= days[0].date.getTime() - 86400000 && at * 1000 < weekEnd;
  return (status?.recaps || []).some(x => inWeek(x.at)) || /\brecap/i.test(r.note?.text || '');
};
for (const d of days) for (const r of d.rows) if (r.pause && !r.skipped && !r.recap && recapThisWeek(r)) r.recap = true;
for (const d of days) {
assignWatchTimes(d);
applyDelays(d, fullDays?.find(full => isoDay(full.date) === isoDay(d.date)) || d);
for (const r of d.rows) if (r.extra) r.when = new Date(r.watchAt);
}
if (everyone && !shifted && absent.some(x => x.from || x.until) && days.some(d => d.rows.some(r => r.plannedAt != null && r.plannedAt !== r.watchAt)))
  return render(items, start, plans, true, keepDays, new Map(days.flatMap(d => d.rows.filter(r => !r.pause && r.watchAt != null).map(r => [showKey(d, r), r.watchAt]))));
if (everyone) return days;
const todayIndex = days.findIndex(d => d.date.toDateString() === today);
const picked = range === 'day' && !searching() && days.find(d => isoDay(d.date) === pickedDay);
const ordered = picked ? [picked] : searching() || todayIndex < 0 || range === 'week' ? days
: range === 'today' ? [days[todayIndex]] : days.slice(todayIndex);
let html = ordered.map(({ date, rows }) => {
const fullDate = `${dayName(date)}, ${germanDate(date)}`;
const heading = `<b>${esc(nearDayName(date) || dayName(date))}</b>, ${esc(germanDate(date))}`;
const hasAutoPause = rows.some(r => r.pause && !r.skipped && !r.slot?.keepTime);
const pauseOn = pauseShiftEnabled(isoDay(date));
const pauseShiftButton = hasAutoPause ? `<button type="button" class="pill pause-shift${pauseOn ? ' on' : ''}" data-pause-shift="${isoDay(date)}" aria-pressed="${pauseOn}" aria-label="Pause überspringen" title="Pause überspringen: ${pauseOn ? 'an · spätere Serien rücken in den freien Slot vor (feste Uhrzeiten bleiben)' : 'aus · alle behalten ihre geplante Zeit'}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 5l10 7-10 7zM19 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '';
const checkSpace = auth ? '<div class="drop-space"></div><div class="watch-space"></div>' : '';
const backLine = (when, note, news) => [when && Number.isFinite(new Date(when).getTime()) ? `Zurück am ${shortDayDate(when)}` : '', reasonHtml(note, news, '')].filter(Boolean).join(' · ');
const pause = ({ show, slot, when, episode, note, news, watchAt, skipped, missing, maybe, recap, alId, links, who }) => `
      <div class="row pause${skipped ? ' skipped' : ''}" ${searchKey(show.english, show.romaji)}>
        <div class="time">Pause</div>
        ${coverFor(alId) ? `<img src="${safeUrl(coverFor(alId))}" alt="" loading="lazy">` : '<span class="no-cover"></span>'}
        <div class="info">
          <div class="title">${esc(show.english || show.romaji)}${skipped || recap ? `<span class="ep-tag">${skipped ? (missing?.length ? 'Abwesend' : 'Skip') : 'Recap'}</span>` : ''}</div>
          <div class="ep">${skipped ? `<s>${new Date(watchAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}</s> · ${missing?.length ? missing.every(p => maybe?.includes(p)) ? `${missing.map(esc).join(', ')} spontan da` : `${missing.map(esc).join(', ')} ${missing.length === 1 ? 'fehlt' : 'fehlen'}` : `Folge ${episode}`}${slot.keepTime ? ' <span class="keep-time-note">Zeiten beibehalten</span>' : ''}` : recap ? 'Keine reguläre Folge' : backLine(when, note, news)}</div>
        </div>
        <div class="links">${skipped && alId ? linkButtons(links || [], alId, who) : ''}</div>
        ${skipped && alId && episode > 0 ? `${auth ? dropButton(alId) : ''}${watchButton(alId, episode)}` : checkSpace}${moveButton(show, slot)}
      </div>`;
const rewatch = ({ m, links, watchAt, who, show, slot }) => `
      <div class="row" ${artStyle(m)} data-watch-time="${new Date(watchAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}" data-fade-at="${watchAt}" ${searchKey(m.title.english, m.title.romaji)}>
        <div class="time">Rewatch</div>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">Rewatch</div>
        </div>
        <div class="links">${linkButtons(links, m.id, who)}</div>
        ${checkSpace}${moveButton(show, slot)}
      </div>`;
const plainRow = r => r.pause ? pause(r) : r.fallback ? fallbackRow(r) : r.rewatch ? rewatch(r) : episodeRow(r);
const hhmm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const row = r => !r.delay && !r.earlier && !r.later ? plainRow(r) : plainRow(r)
.replace(/data-watch-time="[^"]*"/, `data-watch-time="${hhmm(r.plannedAt)}"`)
.replace(/<div class="time"(?: title="[^"]*")?>/, `<div class="time${r.delay || r.later ? ' late' : ''}" title="Unser Plan, geplant ${hhmm(r.plannedAt)}${r.delay ? ` · +${r.delay} Min.` : ''}${r.earlier ? ` · ${r.earlier} Min. früher (Skip)` : ''}${r.later ? ` · ${r.later} Min. später (lange Folge davor)` : ''}">`);
const delayNote = g => (rows.length && date ? (days.find(d => d.date === date)?.delayStarts || []) : [])
.filter(x => {
const first = Math.min(...rows.map(r => r.plannedAt ?? r.watchAt).filter(at => at >= x.at));
return g.some(r => (r.plannedAt ?? r.watchAt) === first);
})
.map(x => `<div class="delay-note" role="note"><span><b>+${x.minutes} Min.</b> · ${esc(x.reason)}</span>${movesKey || delaysUrl ? `<button class="pill" data-delay-edit="${esc(x.show)}" title="Diese Verspätung ändern">Edit</button>` : ''}</div>`).join('');
const fallbackRow = ({ show, slot, watchAt, m, links, who }) => `<div class="row" data-watch-time="${new Date(watchAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}" ${searchKey(show.english, show.romaji)}>
      <div class="time" title="Unser Plan">${parseTime(slot.time) ? new Date(watchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : esc(slot.tag)}</div>
      ${m.coverImage.medium ? `<img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">` : ''}
      <div class="info"><div class="title">${esc(show.english || show.romaji)}</div><div class="ep">Folge nicht bestätigt${whoChips(who)}</div></div>
      <div class="links">${linkButtons(links, m.id, who)}</div>${checkSpace}${moveButton(show, slot)}</div>`;
const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timeCell = (when, watchAt) => {
const weekday = shortDayName(when);
const release = `${weekday} ${hm(when)}`;
const releaseCell = `<span class="time-day${when.toDateString() === date.toDateString() ? ' same' : ''}">${weekday}</span> ${hm(when)}`;
const watch = hm(new Date(watchAt));
return choices.time === 'watch' ? watch
: choices.time === 'both' ? `${watch}<small><span class="out">ab </span>${release}</small>` : releaseCell;
};
const timeHint = { watch: 'Unser Plan', release: 'Release', both: 'Unser Plan, darunter Release' }[choices.time] || 'Release';
const episodeRow = ({ it, m, links, when, watchAt, episodes, who, slot, show, extra, away, maybe, long }) => `
      <div class="row${extra ? ' catchup-planned' : ''}" ${artStyle(m)} data-watch-time="${hm(new Date(watchAt))}" data-at="${when.getTime()}" data-fade-at="${Math.max(when.getTime(), watchAt)}" ${searchKey(...mediaTitles(m))}>
        <div class="time" title="${extra ? 'Unser Plan (Nachholen)' : timeHint}">${extra ? hm(new Date(watchAt)) : timeCell(when, watchAt)}</div>
        ${m.coverImage.medium ? `<img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">` : ''}
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener" title="${esc(m.title.english || m.title.romaji)}">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">${extra ? '<span class="catchup-tag">Nachholen</span> ' : ''}${episodes.length > 1 ? `Folgen ${Math.min(...episodes)}–${Math.max(...episodes)}` : `Folge ${episodes[0]}`}${extra ? '' : behindTag(m, Math.min(...episodes))}${episodeTags(episodes, m.episodes)}${long ? '<span class="ep-tag" title="Lange Folge: braucht zwei Slots">Lang</span>' : ''}${whoChips(who, away, maybe)}</div>
        </div>
        <div class="links">${linkButtons(links, m.id, who)}</div>
        ${auth ? dropButton(m.id) : ''}${watchButton(m.id, Math.max(...episodes))}${extra ? (movesKey ? `<button class="move" data-extra="${esc(extra.show)}" title="Nachholen: Tag, Uhrzeit oder Folgen ändern, oder entfernen" aria-label="Nachholen ändern"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '') : moveButton(show, slot)}
      </div>`;
const groups = [];
// Pauses retain their own original slot, even if another show moves into it.
// Never present a pause and an active episode as a parallel watch slot.
const displayRows = [...rows].sort((a, b) => a.watchAt - b.watchAt || Number(!!b.pause) - Number(!!a.pause));
for (const r of displayRows) {
const previous = groups.at(-1)?.[0];
if (!r.pause && !r.skipped && previous && !previous.pause && !previous.skipped && previous.watchAt === r.watchAt) groups.at(-1).push(r);
else groups.push([r]);
}
const ordered = choices.time === 'release' ? releaseOrder(groups) : groups;
const body = ordered.length
? ordered.map(g => delayNote(g) + (g.length > 1
? `<div class="shared parallel-slot${choices.time === 'watch' ? ' parallel-plan' : ''}">${choices.time !== 'release' && parseTime(g[0].slot?.time) ? `<div class="parallel-heading"><b>${hm(new Date(g[0].watchAt))}</b><span>Parallel</span></div>` : ''}${g.map(row).join('')}</div>`
: row(g[0]))).join('')
: range === 'today' && !searching() ? '<div class="ep empty-day"><button class="pill" data-rest-of-week>Rest der Woche anzeigen</button></div>' : '';
const isToday = date.toDateString() === today;
// today, with a connected list: one button ticks every episode of the day that isn't ticked yet
const openToday = !auth || !isToday ? 0 : new Set(ordered.flat(Infinity).filter(r => r?.m?.id && r.episodes?.length && !r.pause && (myProgress.get(r.m.id) || 0) < Math.max(...r.episodes)).map(r => r.m.id)).size;
const watchedButton = openToday ? `<button type="button" class="pill day-absent-button day-watched" data-day-watched title="Alle ${openToday} heutigen Folgen als gesehen markieren" aria-label="Alle heutigen Folgen als gesehen markieren"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M2 13l4 4 9-10M11 16l2 1.5L22 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '';
return `<section class="day${isToday ? ' is-today' : ''}${ordered.length ? '' : ' empty'}" data-date="${isoDay(date)}" data-move-day="${['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'][date.getDay()]}"><h2${isToday ? ' aria-current="date"' : ''}${nearDayName(date) ? ` title="${esc(fullDate)}"` : ''}><span>${heading}</span>${ordered.length ? '' : '<span class="day-none">· keine Folgen</span>'}${pauseShiftButton}${watchedButton}${movesKey && isoDay(date) >= isoDay(new Date()) ? '<button class="pill day-edit day-discord" data-day-discord title="Als Discord-Nachricht" aria-label="Als Discord-Nachricht"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></button><button class="pill day-edit day-pencil" data-day-edit title="Tag bearbeiten" aria-label="Tag bearbeiten"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : ''}${(movesKey || delaysUrl) && ((isToday && ordered.length) || delays.some(x => x.day === isoDay(date))) ? `<button class="pill day-delay${delays.some(x => x.day === isoDay(date)) ? ' on' : ''}" data-day-delay title="Verspätung" aria-label="Verspätung"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : ''}${isoDay(date) >= isoDay(new Date()) ? `<button class="pill day-absent-button${awayText(isoDay(date)).length ? ' on' : ''}" data-day-absent title="${awayText(isoDay(date)).length ? esc('Abwesend: ' + awayText(isoDay(date)).join(', ')) : 'Abwesend'}" aria-label="Abwesend"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 21c0-3.9 3.1-7 7-7 1.4 0 2.7.4 3.8 1.1M16 17l5 5M21 17l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : ''}</h2>${awayText(isoDay(date)).length ? `<button type="button" class="away-note" data-day-absent>Abwesend: ${esc(awayText(isoDay(date)).join(', '))}</button>` : ''}${body}</section>`;
}).join('');
const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
const strip = `<nav class="daystrip" aria-label="Einen Tag anzeigen">${days.map(({ date, rows }) => {
const long = `${dayName(date)}, ${germanDate(date)}`;
const alone = !searching() && (range === 'day' ? isoDay(date) === pickedDay : range === 'today' && date.toDateString() === today);
const late = date >= nowDay && delays.some(x => x.day === isoDay(date));
const state = [date.toDateString() === today ? 'today' : date < nowDay ? 'past' : '', rows.length ? '' : 'free', alone ? 'picked' : '', late ? 'late' : ''].filter(Boolean).join(' ');
return `<button data-jump="${isoDay(date)}"${state ? ` class="${state}"` : ''}${date.toDateString() === today ? ' aria-current="date"' : ''} aria-pressed="${alone}" aria-label="${esc(long)}: ${rows.length} ${rows.length === 1 ? 'Serie' : 'Serien'}${late ? ', mit Verspätung' : ''}"${late ? ' title="Mit Verspätung"' : ''}><span>${esc(shortDayName(date))}</span> <b>${date.getDate()}</b></button>`;
}).join('')}</nav>`;
const daysOld = time => Math.floor((Date.now() - time) / 86400000);
const linksAge = streamsDe?.generated ? daysOld(Date.parse(streamsDe.generated)) : 0;
const statusAge = streamsDe ? daysOld(Math.max(Date.parse(streamsDe.generated) || 0, Date.parse(streamsDe.statusUpdated) || 0)) : 0;
let staleNotice = '';
if (statusAge >= 3) staleNotice = `<div class="notice">Die LiveChart-Daten wurden vor ${statusAge} Tagen zuletzt aktualisiert.</div>`;
else if (linksAge >= 14) staleNotice = `<div class="notice">Die Stream-Links wurden vor ${linksAge} Tagen zuletzt aktualisiert.</div>`;
// shows whose last episode is this week: the overview names them too
const finales = days.flatMap(d => d.rows.filter(r => !r.pause && !r.extra && r.m?.episodes > 1 && r.episodes?.length && Math.max(...r.episodes) === r.m.episodes).map(r => ({ r, date: d.date })));
const lines = [
...finales.map(({ r, date }) => `<div><b>${esc(r.m.title.english || r.m.title.romaji)}</b> · Finale am ${shortDayDate(date)}</div>`),
...breaks.map(b => `<div><b>${esc(b.show.english || b.show.romaji)}</b> · ${['Zurück am ' + shortDayDate(b.when), reasonHtml(b.note, b.news, '')].filter(Boolean).join(' · ')}</div>`),
...unknown.map(({ show: s, why }) => `<div><b>${esc(s.english || s.romaji)}</b> · <span class="why">${esc(why || 'Keine Folge für diese Woche bestätigt; Ausstrahlung unklar')}</span></div>`),
];
// The chip stays where it is (right of the day strip); what it lists opens underneath, across the full width.
const alerts = !lines.length ? '' : `<button type="button" id="airingWarnings" class="alerts-chip" aria-expanded="${alertsOpen}" aria-controls="airingBody"><span class="notice-count">${[breaks.length ? `${breaks.length} ${breaks.length === 1 ? 'Pause' : 'Pausen'}` : '', finales.length ? `${finales.length} Finale` : '', unknown.length ? `${unknown.length} unbestätigt` : ''].filter(Boolean).join(' · ')}</span></button>`;
const alertsBody = !lines.length ? '' : `<div id="airingBody" class="alerts alerts-body"${alertsOpen ? '' : ' hidden'}>${lines.join('')}</div>`;
html = `${staleNotice}<div class="weekline">${strip}${alerts}${alertsBody}</div>` + html;
const lastWeek = new Date(start); lastWeek.setDate(lastWeek.getDate() - 7);
html = notesHtml(['week:' + lastWeek.getTime(), 'week:' + start.getTime()]) + html;
document.body.style.removeProperty('--time-width');
updateWeekMarkup(html, keepDays);
tick();
const times = [...document.querySelectorAll('.time')];
document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
applySearch();
syncSavingButtons();
restore();
if (sharedShowKey) {
const show = [...$('list').querySelectorAll('.row[data-search]')].find(row => row.dataset.search === sharedShowKey && !row.closest('.hidden-by-search'));
if (show) {
show.classList.add('stream-return');
if (!sharedShowShown) {
sharedShowShown = true;
show.scrollIntoView?.({ block: 'center' });
setTimeout(() => {
sharedShowKey = '';
$('list').querySelector('.stream-return')?.classList.remove('stream-return');
}, 3500);
}
}
}
playEnter();
}
const LIST_QUERY = `query ($user: String) {
  MediaListCollection(userName: $user, type: ANIME, status_in: [CURRENT, REPEATING]) {
    lists { entries { progress status media {
      id status episodes duration siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day }
    } } }
  }
}`;
const LIST_CACHE_MS = 10 * 60 * 1000;
const friendList = $('friendList');
const listUser = () => friendList.value || $('anilistUser').value.trim();
function updateFriendOptions() {
const ownName = auth?.provider !== 'mal' ? auth?.name?.toLowerCase() : null;
for (const option of friendList.options) {
option.hidden = option.disabled = option.value.toLowerCase() === ownName;
if (option.hidden && option.selected) friendList.value = '';
}
}
fetch('wrapped-profiles.json').then(r => r.ok ? r.json() : {}).then(profiles => {
for (const [person, accounts] of Object.entries(profiles)) {
const ani = accounts.filter(account => account.provider === 'anilist');
for (const { name } of ani) {
const option = new Option(ani.length > 1 ? `${person} · ${name}` : person, name);
option.dataset.person = person;
friendList.add(option);
}
}
updateFriendOptions();
}).catch(() => {});
async function anilistList(user, fresh = false, publicOnly = false) {
if (!publicOnly && auth?.provider === 'mal' && user.toLowerCase() === auth.name.toLowerCase()) {
const result = await MAL.list(auth, fresh);
if (fresh && result.stale) throw new Error('MyAnimeList ist gerade nicht erreichbar; die gespeicherte Liste bleibt erhalten.');
setNote('list:' + user.toLowerCase(), result.stale ? `MyAnimeList antwortet nicht: Liste vom ${savedAt(result.stale)}.` : null);
return result.entries.filter(e => ['CURRENT', 'REPEATING'].includes(e.status));
}
const key = 'list:' + user.toLowerCase();
let saved = null;
try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
if (!fresh && saved && Date.now() - saved.time < LIST_CACHE_MS) return fixTitles(saved.entries);
try {
const entries = (await anilist(LIST_QUERY, { user })).MediaListCollection.lists.flatMap(l => l.entries);
try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), entries })); } catch {}
setNote(key, null);
return entries;
} catch (e) {
if (fresh || !saved) throw e;
setNote(key, `${unreachable('AniList')}: Liste von ${user} vom ${savedAt(saved.time)}.`);
return saved.entries;
}
}
$('refreshCatchup').onclick = async () => {
const button = $('refreshCatchup');
if (button.disabled || !listView()) return;
const user = listUser(), friend = friendList.value;
if (!user) return;
button.disabled = true;
button.setAttribute('aria-busy', 'true');
button.textContent = 'Lädt…';
try {
await anilistList(user, true, !!friend);
planShowsCache.time = 0;
if (!friend && auth && auth.name.toLowerCase() === user.toLowerCase()) await loadMe();
if (listView()) await loadCatchup(true);
notice('Liste aktualisiert.');
} catch (error) {
notice('Liste konnte nicht aktualisiert werden: ' + error.message);
} finally {
button.disabled = false;
button.removeAttribute('aria-busy');
button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
};
async function anilistAsMe(query, variables = {}, account = auth) {
if (!account || account.provider === 'mal') throw new Error('Dafür brauchst du ein AniList-Konto.');
try {
return await anilist(query, variables, account.token);
} catch (e) {
if (e.status === 401 && auth === account) disconnect();
throw e;
}
}
function disconnect() {
if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
if (auth?.provider === 'mal') MAL.logout(auth).catch(() => {});
accounts = accounts.filter(a => a !== auth);
useAccount(accounts[0] || null);
}
function useAccount(account) {
if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
auth = account;
myProgress.clear();
$('catchupCount').hidden = true; $('catchupCount').textContent = ''; catchupMinutes = 0;
knownEntries.clear(); notOnList.clear(); toScore = []; planShowsCache.time = 0; selecting = false; $('markAllStart').hidden = true;
saveAccounts();
if (auth?.name) {
$('anilistUser').value = auth.name;
try { localStorage.setItem('anilistUser', auth.name); } catch {}
}
updateConnect();
if (auth) {
const loadingFor = auth;
accountLoading = true; syncSavingButtons();
loadMe().catch(e => { if (auth === loadingFor) notice(e.message); }).finally(() => { if (auth !== loadingFor) return; accountLoading = false; syncSavingButtons(); load(true); });
}
else { accountLoading = false; syncSavingButtons(); load(true); }
}
addEventListener('mal-session-renewed', () => { saveAccounts(); updateConnect(); });
const connect = () => {
location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
};
function avatarOf(account, className) {
const span = document.createElement('span');
if (className) span.className = className;
span.textContent = (account?.name || '?').trim().charAt(0).toUpperCase();
if (!account?.avatar) return span;
const img = document.createElement('img');
img.src = safeUrl(account.avatar).replace(/&amp;/g, '&');
img.alt = '';
if (className) img.className = className;
img.onerror = () => img.replaceWith(span);
return img;
}
const LOGIN_SOON_MS = 7 * 86400000;
const loginEnds = account => account?.expires ? new Date(account.expires) : null;
const loginEndingSoon = account => !!account?.expires && account.expires - Date.now() < LOGIN_SOON_MS;
const loginDate = date => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) }).format(date);
const PERSON_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
function updateConnect() {
updateFriendOptions();
const button = $('accountButton');
button.classList.toggle('empty', !auth);
if (auth) button.replaceChildren(avatarOf(auth));
else button.innerHTML = PERSON_ICON;
button.classList.toggle('expiring', loginEndingSoon(auth));
button.title = auth?.name ? `${listService()}: ${auth.name}${loginEndingSoon(auth) ? ' · Login läuft bald ab' : ''}` : 'Listen-Konten';
button.setAttribute('aria-label', 'Listen-Konten');
$('anilistUser').readOnly = auth?.provider === 'mal';
$('anilistUser').placeholder = auth?.provider === 'mal' ? 'MyAnimeList-Konto' : 'AniList-Name';
const item = (text, onclick, { account = null, muted = false, current = false, label = null } = {}) => {
const b = document.createElement('button');
b.className = (muted ? 'muted' : '') + (current ? ' current' : '');
if (account) {
b.classList.add('account-choice');
b.setAttribute('aria-pressed', String(current));
const provider = account.provider === 'mal' ? 'MAL' : 'AniList';
const name = document.createElement('span'); name.className = 'account-name'; name.textContent = account.name || 'Konto';
const badge = document.createElement('span'); badge.className = 'provider-badge'; badge.textContent = provider;
b.append(avatarOf(account, 'avatar'), name, badge);
b.title = `${provider}: ${account.name || 'Konto'}${loginEnds(account) ? ` · Login bis ${loginDate(loginEnds(account))}` : ''}`;
b.setAttribute('aria-label', b.title);
} else b.append(text);
if (label) { b.setAttribute('aria-label', label); b.title = label; }
b.onclick = onclick;
return b;
};
const row = (...pills) => {
const div = document.createElement('div');
div.className = 'pill-row';
div.append(...pills);
return div;
};
$('accountSection').replaceChildren(
...accounts.map(a => item(`${a.provider === 'mal' ? 'MAL' : 'AniList'} · ${a.name || 'Konto'}`, () => a !== auth && useAccount(a), { account: a, current: a === auth })),
row(item('+ AniList', connect, { muted: true, label:'AniList verbinden' }), item('+ MAL', MAL.connect, { muted: true, label:'MyAnimeList verbinden' })),
...(auth ? [row(item('Abmelden', disconnect, { muted: true }))] : []),
...accounts.filter(loginEndingSoon).map(a => {
const line = document.createElement('div');
line.className = 'login-ending';
const text = document.createElement('span');
text.textContent = `${accounts.length > 1 ? `${a.name || 'Konto'}: ` : ''}Login bis ${loginDate(loginEnds(a))}`;
line.append(text, item('Erneuern', a.provider === 'mal' ? MAL.connect : connect, { muted: true, label: `${a.provider === 'mal' ? 'MyAnimeList' : 'AniList'}-Login von ${a.name || 'Konto'} erneuern` }));
return line;
}),
);
updateSyncControls();
}
function showMenu(menu, button, open) {
if (open) {
for (const [other, trigger] of [['miscMenu', 'miscButton'], ['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
if (other === menu) continue;
$(other).hidden = true;
$(trigger).setAttribute('aria-expanded', 'false');
}
}
$(menu).hidden = !open;
$(button).setAttribute('aria-expanded', open);
}
const showSettings = open => showMenu('settingsMenu', 'settingsButton', open);
$('miscButton').onclick = () => showMenu('miscMenu','miscButton',$('miscMenu').hidden);
$('miscMenu').addEventListener('click',e=>{ if(e.target.closest('a,button')) showMenu('miscMenu','miscButton',false); });
$('settingsButton').onclick = () => showSettings($('settingsMenu').hidden);
$('accountButton').onclick = () => showMenu('accountMenu', 'accountButton', $('accountMenu').hidden);
$('list').addEventListener('click', e => {
if (!e.target.closest('[data-connect]')) return;
e.stopPropagation();
scrollTo({ top: 0 });
showMenu('accountMenu', 'accountButton', true);
});
document.addEventListener('click', e => {
if (!e.target.closest('#miscMenu, #miscButton')) showMenu('miscMenu','miscButton',false);
if (!e.target.closest('#settingsMenu, #settingsButton')) showSettings(false);
if (!e.target.closest('#accountMenu, #accountButton')) showMenu('accountMenu', 'accountButton', false);
});
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let theme = 'auto';
function setTheme(choice) {
theme = choice === 'light' || choice === 'dark' ? choice : 'auto';
if (theme === 'auto') delete document.documentElement.dataset.theme;
else document.documentElement.dataset.theme = theme;
const dark = theme === 'dark' || (theme === 'auto' && systemDark.matches);
document.documentElement.toggleAttribute('data-dark', dark);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121216' : '#f6f6f8');
try { localStorage.setItem('theme', theme); } catch {}
for (const b of document.querySelectorAll('[data-theme-choice]')) b.setAttribute('aria-pressed', b.dataset.themeChoice === theme);
}
try { theme = localStorage.getItem('theme') || 'auto'; } catch {}
setTheme(theme);
systemDark.addEventListener('change', () => setTheme(theme));
for (const b of document.querySelectorAll('[data-theme-choice]')) b.onclick = () => setTheme(b.dataset.themeChoice);
const choices = { time: 'release', sort: 'oldest', accent: 'person' };
const CHOICE_OK = {
time: v => ['release', 'watch', 'both'].includes(v),
sort: v => ['oldest', 'behind', 'next', 'az'].includes(v),
accent: v => v === 'person' || /^#[0-9a-f]{6}$/i.test(v),
};
for (const name of Object.keys(choices))
try { const v = localStorage.getItem(name); if (CHOICE_OK[name](v)) choices[name] = v; } catch {}
function setChoice(name, value) {
choices[name] = value;
for (const b of document.querySelectorAll(`[data-set="${name}"]`))
b.setAttribute('aria-pressed', b.dataset.value === value);
try { localStorage.setItem(name, value); } catch {}
if (name === 'accent') applyAccent();
}
function applyAccent() {
const root = document.documentElement.style;
const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
const known = choices.accent === 'person' ? hex(personColor.get(soloPerson)) : hex(choices.accent);
let last = null;
try { if (known) localStorage.setItem('accentNow', known); else last = hex(localStorage.getItem('accentNow')); } catch {}
const c = known || last || '#f47521';
const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
root.setProperty('--accent', c);
root.setProperty('--accent-text', accentText(r, g, b));
root.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
}
for (const name of Object.keys(choices)) setChoice(name, choices[name]);
for (const b of document.querySelectorAll('[data-set]'))
b.onclick = () => {
setChoice(b.dataset.set, b.dataset.value);
if (b.dataset.set === 'time') redraw();
else if (b.dataset.set !== 'accent') load(true);
};
for (const [id, cls] of [['dropButtons', 'no-drop'], ['moveButtons', 'no-move']]) {
try { $(id).checked = id === 'moveButtons' ? localStorage.getItem(id) === '1' : localStorage.getItem(id) !== '0'; } catch { $(id).checked = id !== 'moveButtons'; }
document.body.classList.toggle(cls, !$(id).checked);
$(id).onchange = () => {
try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch {}
document.body.classList.toggle(cls, !$(id).checked);
if (id === 'moveButtons') syncMoveEditor();
};
}
$('list').addEventListener('click', e => {
  const button = e.target.closest('[data-pause-shift]');
  if (!button) return;
  const date = button.dataset.pauseShift;
  try { localStorage.setItem('pauseShift:' + date, pauseShiftEnabled(date) ? '0' : '1'); } catch {}
  load(true);
});
let editScope = 'week';
for (const b of document.querySelectorAll('[data-edit-scope]')) b.onclick = () => {
editScope = b.dataset.editScope;
for (const x of document.querySelectorAll('[data-edit-scope]')) x.setAttribute('aria-pressed', String(x === b));
};
function syncMoveEditor() {
$('editSchedule').hidden = $('moveToggle').hidden;
const on = $('moveButtons').checked;
$('editScope').hidden = $('editSchedule').hidden || !on;
$('editSchedule').textContent = 'Edit';
$('editSchedule').setAttribute('aria-pressed', String(on));
}
$('editSchedule').onclick = () => {
$('moveButtons').checked = !$('moveButtons').checked;
$('moveButtons').dispatchEvent(new Event('change'));
};
try { $('behind').checked = localStorage.getItem('behind') === '1'; } catch {}
$('behind').onchange = () => {
try { localStorage.setItem('behind', $('behind').checked ? '1' : '0'); } catch {}
redraw();
};
function behindTag(m, episode) {
if (!auth || !$('behind').checked || !myProgress.has(m.id)) return '';
const n = episode - 1 - myProgress.get(m.id);
return n > 0 ? `<button class="behind" data-behind="${esc(m.title.english || m.title.romaji)}" title="${n === 1 ? 'Eine frühere Folge' : `${n} frühere Folgen`} noch nicht gesehen: im Catch-up zeigen">${n} behind</button>` : '';
}
$('list').addEventListener('click', e => {
const b = e.target.closest('.behind[data-behind]');
if (!b) return;
$('search').value = jumpSearch = b.dataset.behind;
openSearch(true);
$('viewCatchup').click();
});
try { $('who').checked = localStorage.getItem('who') !== '0'; } catch { $('who').checked = true; }
$('who').onchange = () => {
try { localStorage.setItem('who', $('who').checked ? '1' : '0'); } catch {}
redraw();
};
const hiddenAnchorSelector = '.hidden-by-search, [hidden], details:not([open])';
function scrollAnchor() {
const below = document.querySelector('header').getBoundingClientRect().bottom;
const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest(hiddenAnchorSelector) && r.getBoundingClientRect().bottom > below);
return { y: scrollY, candidates: rows.map(row => ({
key: row.closest('[data-search]')?.dataset.search,
day: row.closest('.day')?.dataset.date,
episode: row.querySelector('.time')?.textContent,
top: row.getBoundingClientRect().top,
})).filter(r => r.key) };
}
function restoreAnchor(a) {
const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest(hiddenAnchorSelector));
for (const saved of a.candidates || []) {
const row = rows.find(r => r.closest('[data-search]')?.dataset.search === saved.key
&& r.closest('.day')?.dataset.date === saved.day
&& (saved.day || r.querySelector('.time')?.textContent === saved.episode));
if (row) { scrollBy(0, row.getBoundingClientRect().top - saved.top); return; }
}
scrollTo(0, a.y);
}
function preserveListPosition() {
const anchor = scrollAnchor();
const focused = document.activeElement;
const streamRow = focused?.matches('#list a.cr') ? focused.closest('.row[data-search]') : null;
const focusStream = streamRow && { show: streamRow.dataset.search, href: focused.href };
const focusMedia = focused?.closest('#list button[data-media]') ? { media: focused.dataset.media, ep: focused.dataset.ep,
kind: ['watch', 'drop', 'score', 'move'].find(c => focused.classList.contains(c)) } : null;
const focusedRow = focused?.matches?.('#list .row') ? keyRows().indexOf(focused) : -1;
const expanded = new Set([...document.querySelectorAll('#list details[open]')].map(d => d.id || d.querySelector('summary')?.textContent));
return () => {
for (const d of document.querySelectorAll('#list details')) d.open = expanded.has(d.id || d.querySelector('summary')?.textContent);
if (focusStream && !focused.isConnected && !document.querySelector('dialog[open]')) {
const next = [...document.querySelectorAll('#list .row[data-search] a.cr')].find(link =>
link.href === focusStream.href && link.closest('.row').dataset.search === focusStream.show &&
!link.closest('.hidden-by-search, details:not([open])'));
next?.focus({ preventScroll: true });
}
if (focusMedia && !focused.isConnected && !document.querySelector('dialog[open]')) {
const next = [...document.querySelectorAll('#list button[data-media]')].find(b => !b.disabled && b.dataset.media === focusMedia.media
&& b.dataset.ep === focusMedia.ep && b.classList.contains(focusMedia.kind));
next?.focus({ preventScroll: true });
}
if (focusedRow >= 0 && !focused.isConnected && !document.querySelector('dialog[open]')) {
const rows = keyRows();
if (rows.length) selectRow(rows[Math.min(focusedRow, rows.length - 1)]);
}
restoreAnchor(anchor);
};
}
async function loadMe() {
if (!auth) return;
const loadedFor = auth;
if (auth.provider === 'mal') {
const account = auth;
const me = await MAL.profile(account);
if (auth !== account) return;
account.name = me.name; account.scoreFormat = 'POINT_10';
account.avatar = typeof me.picture === 'string' ? me.picture : me.picture?.medium || me.picture?.large || '';
saveAccounts(); $('anilistUser').value = account.name; updateConnect();
const { entries } = await MAL.list(account);
if (auth !== account) return;
for (const e of entries) { myProgress.set(e.media.id, e.progress); knownEntries.set(e.media.id, { progress:e.progress, status:e.status, score:e.score }); }
await loadToScore();
return;
}
if (auth.name && auth.avatar === undefined) {
auth.avatar = (await anilistAsMe('{ Viewer { avatar { medium } } }')).Viewer.avatar?.medium || '';
if (auth !== loadedFor) return;
saveAccounts();
updateConnect();
}
if (!auth.name) {
const { Viewer } = await anilistAsMe('{ Viewer { name avatar { medium } } }');
if (auth !== loadedFor) return;
auth.name = Viewer.name;
auth.avatar = Viewer.avatar?.medium || '';
accounts = accounts.filter(a => a === auth || a.provider === 'mal' || a.name !== auth.name);
saveAccounts();
$('anilistUser').value = auth.name;
try { localStorage.setItem('anilistUser', auth.name); } catch {}
updateConnect();
}
const ownEntries = await anilistList(auth.name);
if (auth !== loadedFor) return;
for (const { progress, status, media } of ownEntries) {
myProgress.set(media.id, progress);
knownEntries.set(media.id, { progress, status });
}
try {
const dropped = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: DROPPED) {
      lists { entries { progress status media { id } } } } }`, { user: auth.name });
if (auth !== loadedFor) return;
for (const { progress, status, media } of dropped.MediaListCollection.lists.flatMap(l => l.entries))
if (!knownEntries.has(media.id)) knownEntries.set(media.id, { progress, status });
} catch {}
if (!auth.scoreFormat) {
try {
auth.scoreFormat = (await anilistAsMe('{ Viewer { mediaListOptions { scoreFormat } } }')).Viewer.mediaListOptions.scoreFormat;
saveAccounts();
} catch {}
}
await loadToScore();
}
const TO_SCORE_DAYS = 60;
let toScore = [];
async function loadToScore() {
if (!auth?.name) return;
const loadedFor = auth;
try {
if (auth.provider === 'mal') {
const { entries } = await MAL.list(auth);
if (auth !== loadedFor) return;
for (const e of entries.filter(e => e.status === 'COMPLETED')) knownEntries.set(e.media.id, { progress:e.progress, status:e.status, score:e.score });
const since = Date.now() - TO_SCORE_DAYS * 86400000;
toScore = entries.filter(e => e.status === 'COMPLETED' && !e.score && e.completedAt?.year)
.map(e => ({ media:e.media, completed:new Date(e.completedAt.year,e.completedAt.month-1,e.completedAt.day) }))
.filter(e => e.completed >= since).sort((a,b)=>b.completed-a.completed);
return;
}
const done = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: COMPLETED) {
      lists { entries { progress status score completedAt { year month day }
        media { id siteUrl synonyms title { romaji english } coverImage { medium } } } } } }`, { user: auth.name });
const entries = done.MediaListCollection.lists.flatMap(l => l.entries);
if (auth !== loadedFor) return;
for (const { progress, status, score, media } of entries)
if (!knownEntries.has(media.id) || knownEntries.get(media.id).status === 'COMPLETED') knownEntries.set(media.id, { progress, status, score });
const since = Date.now() - TO_SCORE_DAYS * 86400000;
toScore = entries.filter(e => !e.score && e.completedAt?.year
&& new Date(e.completedAt.year, (e.completedAt.month || 1) - 1, e.completedAt.day || 1) >= since)
.map(e => ({ media: e.media, completed: new Date(e.completedAt.year, (e.completedAt.month || 1) - 1, e.completedAt.day || 1) }))
.sort((a, b) => b.completed - a.completed);
} catch {}
}
const SAVE_PROGRESS = `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, score: $score) { id progress status score }
}`;
const knownEntries = new Map();
const notOnList = new Set();
async function entryNow(mediaId) {
return entryForAccount(auth, mediaId);
}
async function entryForAccount(account, mediaId) {
const entry = account.provider === 'mal' ? await MAL.entry(account, mediaId)
: (await anilist('query ($id: Int) { Media(id: $id) { mediaListEntry { progress status score } } }', { id: mediaId }, account.token)).Media.mediaListEntry;
return entry ? { onList: true, progress: entry.progress, status: entry.status, score: entry.score } : { onList: false };
}
const saveForAccount = async (account, mediaId, vars, autoComplete = false) => account.provider === 'mal'
? MAL.save(account, mediaId, vars, autoComplete)
: (await anilist(SAVE_PROGRESS, { mediaId, ...vars }, account.token, { retries:0 })).SaveMediaListEntry;
function invalidateAccount(account) {
if (account.provider === 'mal') MAL.invalidate(account);
else try { localStorage.removeItem('list:' + account.name.toLowerCase()); } catch {}
}
async function convertSyncScore(score, source, target) {
if (!score) return 0;
if (!target.scoreFormat && target.provider !== 'mal') {
target.scoreFormat = (await anilist('{ Viewer { mediaListOptions { scoreFormat } } }', {}, target.token)).Viewer.mediaListOptions.scoreFormat;
saveAccounts();
}
const max = a => a.provider === 'mal' ? 10 : ({POINT_100:100,POINT_10_DECIMAL:10,POINT_10:10,POINT_5:5,POINT_3:3}[a.scoreFormat] || 10);
const value = score / max(source) * max(target);
return target.provider !== 'mal' && target.scoreFormat === 'POINT_10_DECIMAL' ? Math.max(.1,Math.round(value*10)/10) : Math.max(1,Math.round(value));
}
const entryBefore = entryNow;
const ON_WATCHING_LIST = ['CURRENT', 'REPEATING'];
const pendingChanges = new Set();
let bulkSaving = false;
function syncSavingButtons() {
for (const b of document.querySelectorAll('#list button[data-media]')) {
const saving = pendingChanges.has(Number(b.dataset.media));
b.disabled = saving || bulkSaving || accountLoading;
if (saving || accountLoading || bulkSaving) {
if (!b.hasAttribute('data-idle-title')) b.dataset.idleTitle = b.title;
b.title = accountLoading ? 'Konto wird geladen. Bitte kurz warten.' : bulkSaving ? 'Mehrere Folgen werden gespeichert. Bitte kurz warten.' : `Speichert auf ${listService()}…`;
} else if (b.hasAttribute('data-idle-title')) {
b.title = b.dataset.idleTitle;
delete b.dataset.idleTitle;
}
if (saving) { b.setAttribute('aria-busy', 'true'); b.setAttribute('aria-label', b.title); }
else { b.removeAttribute('aria-busy'); b.setAttribute('aria-label', b.title); }
}
for (const id of ['markAll', 'markAllStart', 'cancelMark', 'noticeUndo']) {
const button = $(id);
if (button) button.disabled = accountLoading || bulkSaving || pendingChanges.size > 0;
}
$('syncTarget').disabled = bulkSaving || pendingChanges.size > 0;
$('syncBoth').disabled = bulkSaving || pendingChanges.size > 0 || !$('syncTarget').value;
}
async function change(mediaId, vars) {
if (pendingChanges.has(mediaId)) throw new Error('Diese Serie wird noch gespeichert.');
pendingChanges.add(mediaId);
syncSavingButtons();
try {
const sourceAccount = auth, targetAccount = syncTargetFor(auth);
const before = await entryBefore(mediaId);
const status = vars.status || (vars.progress !== undefined && !ON_WATCHING_LIST.includes(before.status) ? 'CURRENT' : undefined);
const saved = auth?.provider === 'mal' ? await MAL.save(auth, mediaId, { ...vars, status }, true)
: (await anilistAsMe(SAVE_PROGRESS, { mediaId, ...vars, status })).SaveMediaListEntry;
knownEntries.set(mediaId, { progress: saved.progress, status: saved.status, score: saved.score });
notOnList.delete(mediaId);
myProgress.set(mediaId, saved.progress);
listChanged(mediaId, saved.progress, !!status);
const record = { mediaId, before, after: { progress: saved.progress, status: saved.status, score: saved.score }, entryId: saved.id, account:sourceAccount };
if (targetAccount) {
let attemptedBefore;
const sync = async () => {
const targetId = targetAccount.provider === 'mal' ? mediaId : await MAL.anilistId(mediaId);
const targetBefore = await entryForAccount(targetAccount, targetId);
if (attemptedBefore && ['onList', 'progress', 'status', 'score'].some(key => attemptedBefore[key] !== targetBefore[key]))
throw new Error('Die Zielliste wurde inzwischen geändert.');
const synced = { ...vars };
if (vars.score !== undefined) synced.score = await convertSyncScore(vars.score, sourceAccount, targetAccount);
if (vars.progress !== undefined && !vars.status && !ON_WATCHING_LIST.includes(targetBefore.status)) synced.status = 'CURRENT';
if (vars.progress !== undefined && vars.progress > (before.progress || 0) && targetBefore.progress > vars.progress) {
record.syncMessage = `${targetAccount.name} ist schon weiter; der Fortschritt dort bleibt.`;
} else {
attemptedBefore = targetBefore;
const second = await saveForAccount(targetAccount, targetId, synced, true);
invalidateAccount(targetAccount);
record.linked = [{mediaId:targetId,before:targetBefore,after:{progress:second.progress,status:second.status,score:second.score},entryId:second.id,account:targetAccount}];
}
};
try { await sync(); }
catch (error) {
record.syncMessage = `Abgleich unvollständig für ${targetAccount.name}: ${error.message}`;
record.retrySync = async () => {
const current = await entryForAccount(sourceAccount, mediaId);
if (!current.onList || ['progress', 'status', 'score'].some(key => current[key] !== record.after[key]))
throw new Error('Die ursprüngliche Liste wurde inzwischen geändert.');
await sync();
delete record.retrySync;
};
}
}
return record;
} finally {
pendingChanges.delete(mediaId);
syncSavingButtons();
}
}
function listChanged(mediaId, progress, statusChanged) {
if (auth?.provider === 'mal') { MAL.invalidate(auth); planShowsCache.time = 0; return; }
try {
const key = 'list:' + auth.name.toLowerCase();
const list = JSON.parse(localStorage.getItem(key));
const entry = list?.entries.find(x => x.media.id === mediaId);
if (entry && !statusChanged) { entry.progress = progress; localStorage.setItem(key, JSON.stringify(list)); }
else localStorage.removeItem(key);
} catch {}
if (statusChanged) planShowsCache.time = 0;
}
const UNDO_MS = 10 * 60 * 1000;
const undoSteps = [];
function remember(records, text) {
if (!records.length || !auth) return;
const messages = [...new Set(records.map(r => r.syncMessage).filter(Boolean))];
const flattened = records.flatMap(r => [r, ...(r.linked || [])]);
const step = { records:flattened, time: Date.now(), token: auth.token, name: auth.name || 'dem anderen Konto' };
undoSteps.push(step);
if (messages.length) text += ' · ' + messages.join(' · ');
notice(text, true);
offerSyncRetry(step, records.filter(r => r.retrySync));
}
function offerSyncRetry(step, records) {
if (!records.length) return;
const button = $('noticeRetry');
button.hidden = false;
button.onclick = async () => {
if (undoSteps.at(-1) !== step || auth?.token !== step.token || Date.now() - step.time > UNDO_MS || pendingChanges.size || bulkSaving || undoing) return;
button.disabled = true;
records.forEach(r => pendingChanges.add(r.mediaId));
syncSavingButtons();
try {
for (const record of records) {
await record.retrySync();
if (record.linked) step.records.push(...record.linked);
}
notice('Listen-Abgleich abgeschlossen.', true);
} catch (error) {
notice('Abgleich weiterhin unvollständig: ' + error.message, true);
offerSyncRetry(step, records.filter(r => r.retrySync));
} finally {
records.forEach(r => pendingChanges.delete(r.mediaId));
button.disabled = false;
syncSavingButtons();
}
};
}
let undoing = false;
async function undo() {
if (!auth || undoing || bulkSaving || pendingChanges.size) return;
const last = undoSteps.at(-1);
if (!last) return;
if (Date.now() - last.time > UNDO_MS) { undoSteps.length = 0; notice('Zu spät zum Rückgängigmachen; ändere es stattdessen auf AniList.'); return; }
if (last.token !== auth.token) { notice(`Gemacht mit ${last.name}: wechsle zu diesem Konto, um es rückgängig zu machen.`); return; }
undoSteps.pop();
undoing = true;
notice('Wird rückgängig gemacht…');
const left = [...last.records];
let done = 0, elsewhere = 0, failed = null;
while (left.length) {
const { mediaId, before, after, entryId, account:originalAccount } = left.at(-1);
try {
const account = originalAccount ? accounts.find(a => accountKey(a) === accountKey(originalAccount)) : auth;
if (!account) throw new Error(`Verbinde ${originalAccount.name}, um die Änderung rückgängig zu machen.`);
const now = await entryForAccount(account, mediaId);
if (!now.onList || now.progress !== after.progress || now.status !== after.status || now.score !== after.score) elsewhere++;
else {
if (before.onList) {
await saveForAccount(account, mediaId, {progress:before.progress,status:before.status,score:before.score});
if (account === auth) { knownEntries.set(mediaId, { progress: before.progress, status: before.status, score: before.score }); myProgress.set(mediaId, before.progress); }
} else {
if (account.provider === 'mal') await MAL.remove(account, entryId);
else await anilist('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entryId }, account.token);
if (account === auth) { knownEntries.delete(mediaId); notOnList.add(mediaId); myProgress.delete(mediaId); }
}
invalidateAccount(account);
if (account === auth) listChanged(mediaId, before.progress || 0, true);
done++;
}
} catch (err) { failed = err; break; }
left.pop();
if (left.length) await new Promise(r => setTimeout(r, 700));
}
const parts = [];
if (done) parts.push(last.records.length > 1 ? `Rückgängig für ${done}` : 'Rückgängig gemacht');
if (elsewhere) parts.push(`${elsewhere === 1 ? (done || failed ? 'eine Serie wurde' : 'Diese Serie wurde') : `${elsewhere} Serien wurden`} inzwischen woanders geändert und so gelassen`);
if (failed) {
undoSteps.push({ ...last, records: left });
parts.push(`${left.length === 1 ? 'eine Serie ist' : `${left.length} Serien sind`} noch rückgängig zu machen (${failed.message})`);
}
const text = parts.join('; ');
notice(text.charAt(0).toUpperCase() + text.slice(1) + '.', !!failed);
undoing = false;
load(true);
}
document.addEventListener('keydown', e => {
if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
if (e.isComposing || e.altKey || document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
e.preventDefault();
undo();
});
let noticeTimer = null;
let pauseTimer = null;
onAniListPause = until => {
if (!pendingChanges.size && !bulkSaving && !undoing) return;
clearInterval(pauseTimer);
const show = () => {
const s = Math.ceil((until - Date.now()) / 1000);
if (s <= 0) { clearInterval(pauseTimer); return; }
notice(`AniList-Pause: ✓ geht wieder in ${s} s`);
};
show();
pauseTimer = setInterval(show, 1000);
};
let requestsPerTick = 2;
function ticksLeft() {
if (auth?.provider === 'mal' || !aniLimit.limit || !Number.isFinite(aniLimit.remaining)) return '';
const n = Math.floor(aniLimit.remaining / requestsPerTick);
return n > 5 ? '' : n > 0 ? ` · noch ${n} bis zur Pause` : ' · der nächste ✓ wartet kurz auf AniList';
}
function notice(text, withUndo = false) {
movesUndo = null;
delayUndo = null;
$('noticeText').textContent = text;
$('noticeUndo').hidden = !withUndo;
$('noticeRetry').hidden = true;
$('notice').hidden = false;
clearTimeout(noticeTimer);
noticeTimer = setTimeout(() => { $('notice').hidden = true; }, withUndo ? 20000 : 5000);
}
$('noticeUndo').onclick = () => delayUndo ? undoDelay() : movesUndo ? undoMove() : undo();
const rowTitle = el => el.closest('.shared, .row')?.querySelector('.title')?.textContent.trim() || 'Serie';
const failedTicks = new Map();
const tickKey = (mediaId, episode) => JSON.stringify([accountKey(auth), mediaId, episode]);
const watchButton = (mediaId, episode, add = false) => !auth ? '' :
`<button class="watch${failedTicks.has(tickKey(mediaId, episode)) ? ' save-failed' : (myProgress.get(mediaId) || 0) >= episode ? ' done' : ''}" data-media="${mediaId}" data-ep="${episode}"${add ? ' data-add="1"' : ''}
    title="${failedTicks.has(tickKey(mediaId, episode)) ? 'Nicht gespeichert · Nochmal versuchen' : `Folge ${episode} gesehen (${listService()})`}">${failedTicks.has(tickKey(mediaId, episode)) ? '↻' : '✓'}</button>`;
const before = new Map();
$('list').addEventListener('click', async e => {
const b = e.target.closest('.watch');
if (!b || !auth || b.disabled || bulkSaving || pendingChanges.has(Number(b.dataset.media)) || b.dataset.select) return;
const mediaId = Number(b.dataset.media), episode = Number(b.dataset.ep);
const key = tickKey(mediaId, episode);
const current = myProgress.get(mediaId) || 0;
const retry = failedTicks.get(key);
if (retry && retry.current !== current) {
failedTicks.delete(key);
notice('Fortschritt hat sich geändert. Bitte prüfe die Folge erneut.');
load(true);
return;
}
let progress;
if (retry) progress = retry.progress;
else if (current >= episode) progress = before.has(mediaId) ? before.get(mediaId) : episode - 1;
else { before.set(mediaId, current); progress = episode; }
b.disabled = true;
const title = rowTitle(b);
try {
const sent = aniLimit.count;
const record = await change(mediaId, { progress, status: b.dataset.add ? 'CURRENT' : undefined });
failedTicks.delete(key);
if (aniLimit.count > sent) requestsPerTick = aniLimit.count - sent;
clearInterval(pauseTimer);
const first = (record.before.progress || 0) + 1;
const result = progress > first ? `Folgen ${first}–${progress} als gesehen markiert`
: progress >= first ? `Folge ${progress} gesehen` : `Fortschritt auf ${progress} gesetzt`;
remember([record], `${title}: ${result}${ticksLeft()}`);
if (record.after.status === 'COMPLETED' && record.before.status !== 'COMPLETED' && !record.after.score) {
openScore(mediaId, title);
loadToScore().then(() => load(true));
}
} catch (err) {
failedTicks.set(key, { current, progress });
b.title = `Nicht gespeichert: ${err.message}`;
notice(`${title} nicht gespeichert: ${err.message}. Du kannst es nochmal versuchen.`);
}
load(true);
});
const SMILEYS = ['🙁', '😐', '🙂'];
const scoreFormat = () => auth?.scoreFormat || 'POINT_10_DECIMAL';
const showScore = score => scoreFormat() === 'POINT_5' ? '★'.repeat(score)
: scoreFormat() === 'POINT_3' ? SMILEYS[score - 1] || score : String(score);
const scoreButton = mediaId => {
const score = knownEntries.get(mediaId)?.score;
return `<button class="score${score ? ' scored' : ''}" data-score-media="${mediaId}" title="${score ? 'Bewertung ändern' : 'Bewerten'} auf ${listService()}">${score ? esc(showScore(score)) : '★ Bewerten'}</button>`;
};
let scoring = null;
function openScore(mediaId, title) {
scoring = { mediaId, title };
showSettings(false);
showMenu('accountMenu', 'accountButton', false);
const format = scoreFormat();
const current = knownEntries.get(mediaId)?.score || 0;
$('scoreName').textContent = title;
$('scoreService').textContent = 'Bewertung';
$('scoreService').title = `Abgeschlossen. Deine Bewertung auf ${listService()}`;
$('scoreMsg').textContent = '';
$('scoreClear').hidden = !current;
$('scoreSave').hidden = !['POINT_100', 'POINT_10_DECIMAL'].includes(format);
const box = $('scoreInput');
if (format === 'POINT_100' || format === 'POINT_10_DECIMAL') {
const max = format === 'POINT_100' ? 100 : 10;
box.innerHTML = `<input id="scoreValue" type="number" min="${max === 100 ? 1 : 0.5}" max="${max}" step="${max === 100 ? 1 : 0.5}"
      inputmode="decimal" value="${current || ''}" placeholder="${max === 100 ? 1 : 0.5}–${max}" aria-label="Bewertung von ${max}"><span class="muted">/ ${max}</span>`;
} else {
const values = { POINT_10: 10, POINT_5: 5, POINT_3: 3 }[format] || 10;
box.innerHTML = Array.from({ length: values }, (_, i) => i + 1).map(v =>
`<button type="button" class="pill${v === current ? ' primary' : ''}" data-score="${v}">${esc(format === 'POINT_5' ? v + '★' : showScore(v))}</button>`).join('');
}
$('scoreDlg').showModal();
$('scoreValue')?.focus();
}
async function saveScore(score) {
const { mediaId, title } = scoring;
$('scoreMsg').textContent = 'Speichert…';
try {
const record = await change(mediaId, { score });
$('scoreDlg').close();
toScore = toScore.filter(t => t.media.id !== mediaId || !score);
remember([record], score ? `${title}: mit ${showScore(record.after.score)} bewertet` : `${title}: Bewertung entfernt`);
load(true);
} catch (e) { $('scoreMsg').textContent = `Nicht gespeichert: ${e.message}`; }
}
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-score-media]');
if (b && auth) openScore(Number(b.dataset.scoreMedia), rowTitle(b));
});
$('scoreInput').addEventListener('click', e => {
const b = e.target.closest('[data-score]');
if (b) saveScore(Number(b.dataset.score));
});
$('scoreSave').onclick = () => {
const input = $('scoreValue');
if (!input) return;
const v = Math.round(Number(input.value.replace(',', '.')) * (input.step === '1' ? 1 : 10)) / (input.step === '1' ? 1 : 10);
if (!input.value || !(v >= Number(input.min) && v <= Number(input.max))) { $('scoreMsg').textContent = `Eine Bewertung von ${input.min} bis ${input.max}.`; return; }
saveScore(v);
};
$('scoreDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'scoreValue') { e.preventDefault(); $('scoreSave').click(); } });
$('scoreClear').onclick = () => saveScore(0);
const dropButton = mediaId => knownEntries.get(mediaId)?.status === 'DROPPED'
? '<span class="drop dropped" title="Auf AniList gedroppt">Gedroppt</span>'
: knownEntries.get(mediaId)?.status === 'COMPLETED' ? scoreButton(mediaId)
: `<button class="drop" data-media="${mediaId}" title="Auf ${listService()} droppen">Droppen</button>`;
$('list').addEventListener('click', async e => {
const b = e.target.closest('.drop');
if (!b || !auth || b.disabled) return;
if (!b.dataset.sure) {
b.dataset.sure = '1';
b.textContent = 'Sicher?';
setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.sure; b.textContent = 'Droppen'; } }, 4000);
return;
}
b.disabled = true;
const title = rowTitle(b);
try {
remember([await change(Number(b.dataset.media), { status: 'DROPPED' })], `${title} gedroppt`);
} catch (err) {
delete b.dataset.sure;
b.textContent = 'Droppen';
b.disabled = false;
notice(`${title} nicht gedroppt: ${err.message}. Du kannst es nochmal versuchen.`);
return;
}
load(true);
});
let catchupTargets = [];
let selecting = false;
let revealMarkBar = false;
const skipped = new Set();
const markAllLabel = () => `${catchupTargets.filter(t => !skipped.has(t.mediaId)).length} ✓`;
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-select]');
if (!b) return;
const id = Number(b.dataset.select);
skipped.has(id) ? skipped.delete(id) : skipped.add(id);
b.classList.toggle('done', !skipped.has(id));
$('markAll').textContent = markAllLabel();
});
$('list').addEventListener('click', e => {
if (!e.target.closest('#cancelMark')) return;
selecting = false;
load(true);
});
$('markAllStart').onclick = () => {
if (!auth || $('markAllStart').disabled) return;
selecting = true;
revealMarkBar = true;
skipped.clear();
load(true);
};
$('list').addEventListener('click', async e => {
const b = e.target.closest('#markAll');
if (!b || !auth || b.disabled) return;
b.disabled = true;
const targets = catchupTargets.filter(t => !skipped.has(t.mediaId));
bulkSaving = true;
syncSavingButtons();
selecting = false;
const records = [];
for (const [i, { mediaId, progress, add }] of targets.entries()) {
b.textContent = `Speichert ${i + 1}/${targets.length}…`;
try {
records.push(await change(mediaId, { progress, status: add ? 'CURRENT' : undefined }));
} catch (err) {
b.textContent = `Gestoppt bei ${i + 1}/${targets.length}: ${err.message}`;
remember(records, `${records.length} von ${targets.length} Serien als gesehen markiert`);
bulkSaving = false;
syncSavingButtons();
notice(`${records.length} von ${targets.length} Serien gespeichert. Gestoppt: ${err.message}`, records.length > 0);
load(true);
return;
}
await new Promise(r => setTimeout(r, 700));
}
remember(records, `${records.length} ${records.length === 1 ? 'Serie' : 'Serien'} als gesehen markiert`);
bulkSaving = false;
syncSavingButtons();
load(true);
});
// "Alle gesehen" on today's heading: every open tick of the day, one after the other (Rückgängig takes them all back)
$('list').addEventListener('click', async e => {
const b = e.target.closest('[data-day-watched]');
if (!b || !auth || b.disabled || bulkSaving || pendingChanges.size) return;
const targets = new Map();
for (const w of b.closest('.day').querySelectorAll('.watch:not(.done):not([data-select])')) {
const mediaId = Number(w.dataset.media), progress = Number(w.dataset.ep);
if (mediaId && progress > (targets.get(mediaId)?.progress || 0)) targets.set(mediaId, { mediaId, progress, add: !!w.dataset.add });
}
if (!targets.size) return;
b.disabled = true;
bulkSaving = true;
syncSavingButtons();
const records = [], all = [...targets.values()];
let stopped = '';
for (const [i, { mediaId, progress, add }] of all.entries()) {
notice(`Speichert ${i + 1}/${all.length}…`);
try { records.push(await change(mediaId, { progress, status: add ? 'CURRENT' : undefined })); }
catch (err) { stopped = err.message; break; }
await new Promise(r => setTimeout(r, 700));
}
bulkSaving = false;
syncSavingButtons();
if (records.length) remember(records, stopped ? `${records.length} von ${all.length} heutigen Folgen als gesehen markiert. Gestoppt: ${stopped}`
: `${records.length} ${records.length === 1 ? 'Folge' : 'Folgen'} von heute als gesehen markiert`);
else notice(`Nichts gespeichert: ${stopped}`);
load(true);
});
function dueAt(released, slot, show) {
const monday = new Date(released * 1000);
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
const mv = show && moveFor(show, monday);
// Skipped episodes enter Catch-up once aired; their cancelled viewing slot
// must not delay them. Already-watched episodes are filtered by progress.
if (mv?.skip) return released;
if (mv) slot = { tag: mv.tag, time: mv.time };
const day = watchDay(new Date(released * 1000), slot?.tag, slot?.time);
const hm = parseTime(slot?.time);
if (hm) day.setHours(hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0], hm[1], 0, 0);
else day.setDate(day.getDate() + 1);
return Math.max(released, day.getTime() / 1000);
}
function catchupRows(entries, planShows, plan, person = soloPerson) {
const now = Date.now() / 1000;
const week = 7 * 86400;
const mySlots = plan && person ? [...picks(plan, person)] : [];
const recent = m => {
const s = m.startDate;
if (!s?.year) return m.status !== 'FINISHED';
return new Date(s.year, (s.month || 1) - 1, s.day || 1) > Date.now() - 270 * 86400000;
};
const rows = [], ownPace = [];
for (const { progress, media: m, missing } of [...entries, ...planShows]) {
const offset = streamsDe?.release?.[m.id]?.offset || 0;
const next = m.nextAiringEpisode;
const show = plan?.shows.find(s => titleMatches([s.romaji, s.english], mediaTitles(m)));
const mine = mySlots.find(([s]) => titleMatches([s.romaji, s.english], mediaTitles(m)));
const slot = mine?.[1] || show;
const lag = lagOf(m.id);
const released = ep => next.airingAt - (next.episode - lag - ep) * week + offset;
let out = next ? next.episode - lag - 1 : m.status === 'FINISHED' ? m.episodes : 0;
while (next && out > progress && dueAt(released(out), slot, mine?.[0] || show) > now) out--;
if (!out || out <= progress) continue;
const first = progress + 1;
const since = next ? released(first) : 0;
const nextAt = next ? released(out + 1) : 0;
const row = { m, first, out, since, nextAt, missing, progress, links: streamLinks(m, show?.wo, m.title.english || m.title.romaji) };
(missing || show || recent(m) ? rows : ownPace).push(row);
}
return { rows, ownPace };
}
function showCatchupCount(rows) {
const count = rows.filter(r => !r.missing).reduce((sum, r) => sum + r.out - r.first + 1, 0);
catchupMinutes = rows.filter(r => !r.missing).reduce((sum, r) => sum + (r.out - r.first + 1) * (r.m.duration || 24), 0);
$('catchupCount').textContent = count || '';
$('catchupCount').hidden = !count;
$('catchupCount').title = count ? `${count} ${count === 1 ? 'Folge' : 'Folgen'} für Catch-up` : '';
return count;
}
let catchupMinutes = 0;
function catchupTime() {
const m = Math.round(catchupMinutes / 5) * 5;
if (!m) return '';
return ' · ≈ ' + (m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std.${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`);
}
let countingCatchup = null;
async function updateCatchupCount() {
const user = $('anilistUser').value.trim();
if (!user || (countingCatchup?.user === user && countingCatchup.account === auth)) return;
const job = {user, account:auth}; countingCatchup = job;
try {
const entries = await anilistList(user);
if (countingCatchup !== job || auth !== job.account || $('anilistUser').value.trim() !== user) return;
const plan = await sheetFor(tabFor(tabs, new Date()));
if (countingCatchup !== job || auth !== job.account || $('anilistUser').value.trim() !== user) return;
const { rows } = catchupRows(entries, await missingPlanShows(plan, entries), plan);
if (countingCatchup === job && auth === job.account && $('anilistUser').value.trim() === user) showCatchupCount(rows);
} catch {} finally { if (countingCatchup === job) countingCatchup = null; }
}
let catchupGeneration = 0;
async function loadCatchupContent(refresh = false) {
const generation = ++catchupGeneration, account = auth;
updateFallbackControls();
const user = listUser(), friend = friendList.value;
const provider = friend ? 'AniList' : listService();
const shown = view;
const current = () => generation === catchupGeneration && auth === account && view === shown && listUser() === user && friendList.value === friend;
const name = shown === 'pace' ? 'Non-seasonal' : 'Catch-up';
$('tabName').textContent = user ? `${name} · ${user} auf ${provider}${friend ? ' · Nur lesen' : ''}` : name;
if (!user) { $('list').innerHTML = '<div class="status">Kein AniList-Name eingetragen.</div>'; return; }
if (!document.querySelector('#list .row')) $('list').innerHTML = LOADING_HTML;
await ready;
if (!current()) return;
let entries;
try {
entries = await anilistList(user, false, !!friend);
} catch (e) {
if (refresh && current() && document.querySelector('#list .row')) {
notice(`${name} konnte nicht aktualisiert werden: ${e.message}. Es werden weiter die bisherigen Daten angezeigt.`);
return;
}
if (current() && friend && [403, 404].includes(e.status)) {
$('list').innerHTML = '<div class="status">Diese AniList-Liste ist privat oder wurde nicht gefunden.</div>';
return;
}
if (current()) $('list').innerHTML = failed(navigator.onLine === false
? `Du bist offline, und die AniList-Liste von ${user} ist in diesem Browser noch nicht gespeichert.` : `Die AniList-Liste von ${user} konnte nicht geladen werden (${e.message}).`);
return;
}
if (!current()) return;
let plan = null;
try {
plan = await sheetFor(tabFor(tabs, new Date()));
if (!current()) return;
setNote('catchup:plan', null);
} catch (e) {
if (!current()) return;
setNote('catchup:plan', `${unreachable('Google Sheets')}: ohne den Guckplan fehlen Guck-Slots und geplante Serien, die nicht auf der Liste sind.`);
}
const planShows = friend ? [] : await missingPlanShows(plan, entries);
if (!current()) return;
const { rows, ownPace } = catchupRows(entries, planShows, plan, friend ? friendList.selectedOptions[0]?.dataset.person : soloPerson);
const openEpisodes = showCatchupCount(rows);
const byTitle = (a, b) => (a.m.title.english || a.m.title.romaji).localeCompare(b.m.title.english || b.m.title.romaji);
rows.sort(choices.sort === 'az' ? byTitle
: choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first) || a.since - b.since
: choices.sort === 'next' ? (a, b) => (a.nextAt || Infinity) - (b.nextAt || Infinity) || a.since - b.since
: (a, b) => a.since - b.since);
const nextHint = (nextAt, out) => choices.sort !== 'next' || !nextAt ? ''
: `<span class="next-hint"> · ${nextAt * 1000 <= Date.now() ? `Folge ${out + 1} schon da` : 'neu ' + (new Date(nextAt * 1000).toDateString() === new Date().toDateString() ? 'heute' + savedAt(nextAt * 1000).slice(2) : savedAt(nextAt * 1000))}</span>`;
const mine = !friend && auth?.name && user.toLowerCase() === auth.name.toLowerCase();
catchupTargets = mine && shown === 'catchup' ? rows.map(r => ({ mediaId: r.m.id, progress: r.out, add: !!r.missing })) : [];
catchupById = new Map(rows.map(r => [r.m.id, r]));
const planIn = m => movesKey && !selecting ? `<button class="plan-in" data-plan="${m.id}" title="Einplanen: diese Woche in den Plan" aria-label="Einplanen"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : '';
const selector = m => `<button class="watch${skipped.has(m.id) ? '' : ' done'}" data-select="${m.id}"
    title="Bei „Alle ✓“ mitnehmen">✓</button>`;
const check = (m, ep, missing) => selecting ? selector(m) : watchButton(m.id, ep, missing);
const single = singleEpisodes;
const title = m => `<div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>`;
const seen = (progress, m) => m.episodes ? `${progress} von ${m.episodes} gesehen` : `${progress} gesehen`;
const grouped = ({ m, first, out, nextAt, missing, links, progress }) => `
    <div class="row catchup-single" ${artStyle(m)} ${searchKey(...mediaTitles(m))}>
      <div class="time"><span class="time-day">Folge</span> ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep"><span class="catchup-count">${out - first + 1} offen</span> ${seen(progress, m)}${nextHint(nextAt, out)}</div>
      </div>
      <div class="links">${linkButtons(links, m.id)}</div>
      ${mine ? dropButton(m.id) + check(m, out, missing) : ''}${planIn(m)}
    </div>`;
const perEpisode = ({ m, first, out, nextAt, missing, links, progress }) => {
const eps = Array.from({ length: out - first + 1 }, (_, i) => first + i);
if (eps.length === 1) return grouped({ m, first, out, nextAt, missing, links, progress });
return `<div class="shared catchup-show" ${searchKey(...mediaTitles(m))}>
      <div class="row show-head" ${artStyle(m)}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}<div class="ep"><span class="catchup-count">${eps.length} offen</span> Folgen ${first}–${out}${nextHint(nextAt, out)}</div></div>
        <div class="links">${linkButtons(links, m.id)}</div>
        ${mine ? dropButton(m.id) + (selecting ? selector(m) : '') : ''}${planIn(m)}
      </div>${eps.map(ep => `
      <div class="row compact">
        <div class="time">Folge ${ep}</div>
        <div class="info"></div>
        ${mine ? (selecting ? '<div class="watch-space"></div>' : watchButton(m.id, ep, missing)) : ''}
      </div>`).join('')}</div>`;
};
const paced = ({ m, first, out, progress, links }) => `
    <div class="row" ${artStyle(m)} ${searchKey(...mediaTitles(m))}>
      <div class="time"><span class="time-day">Folge</span> ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep">${progress} von ${m.episodes || out} gesehen</div>
      </div>
      <div class="links">${linkButtons(links, m.id)}</div>
      ${mine ? dropButton(m.id) + (selecting ? '<div class="watch-space"></div>' : watchButton(m.id, first)) : ''}
    </div>`;
if (!mine || shown === 'pace') selecting = false;
const restore = preserveListPosition();
if (shown === 'pace') {
ownPace.sort(choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first) : byTitle);
$('list').innerHTML = ownPace.length ? ownPace.map(paced).join('')
: '<div class="status">Keine älteren Serien offen auf der Watching-Liste.</div>';
} else {
$('markAllStart').hidden = !mine || !rows.length || selecting;
const top = !mine || !rows.length || !selecting ? ''
: `<div class="catchup-bar"><button id="cancelMark" class="pill">Abbrechen</button><button id="markAll" class="pill sure" title="Als gesehen markieren">${markAllLabel()}</button></div>`;
const show = single ? perEpisode : grouped;
const listed = rows.filter(r => !r.missing), notListed = rows.filter(r => r.missing);
let unfolded = false;
try { unfolded = localStorage.getItem('notListedOpen') === '1'; } catch {}
$('list').innerHTML = rows.length ? top + listed.map(show).join('') + (notListed.length
? `<details class="day not-listed"${unfolded || selecting || searching() ? ' open' : ''}><summary><h2 title="Noch nicht auf deiner ${listService()}-Liste">Nicht gelistet · ${notListed.length}<i class="fold" aria-hidden="true"></i></h2></summary>${notListed.map(show).join('')}</details>` : '')
: '<div class="status happy"><img src="icon-192.png" alt="">Alles aufgeholt.<button class="pill" data-back-to-week>Zum Zeitplan</button></div>';
$('list').querySelector('.not-listed > summary')?.addEventListener('click', e => {
try { localStorage.setItem('notListedOpen', e.currentTarget.parentElement.open ? '0' : '1'); } catch {}
});
const unscored = mine ? toScore.filter(t => !knownEntries.get(t.media.id)?.score) : [];
if (unscored.length) $('list').insertAdjacentHTML('beforeend', `<section class="day toscore"><h2 title="Beendet, noch nicht bewertet">Bewerten</h2>${unscored.map(({ media: m, completed }) => `
      <div class="row" ${searchKey(...mediaTitles(m))}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}
          <div class="ep">Abgeschlossen am ${completed.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </div>
        ${scoreButton(m.id)}
      </div>`).join('')}</section>`);
}
$('list').insertAdjacentHTML('afterbegin', notesHtml(['list:' + user.toLowerCase(), 'catchup:plan', 'catchup:missing']));
const listName = friend ? friendList.selectedOptions[0].textContent : user;
const readOnly = friend ? '<span class="catchup-count">Nur lesen</span>' : '';
if (shown === 'catchup') {
const fromPlan = rows.filter(row => row.missing).length;
const onList = rows.length - fromPlan;
$('list').insertAdjacentHTML('afterbegin', `<div class="catchup-summary${friend ? ' friend-summary' : ''}">
      <div class="friend-view"><strong>${esc(listName)}</strong>${readOnly}</div>
      <span>${openEpisodes} ${openEpisodes === 1 ? 'Folge' : 'Folgen'} offen${catchupTime()}${onList ? ` · ${onList} ${onList === 1 ? 'Serie' : 'Serien'}` : ''}${fromPlan ? ` · ${fromPlan} aus dem Guckplan` : ''}</span>
      ${friend ? '<button type="button" class="pill" data-own-list>Eigene Liste</button>' : ''}
    </div>`);
} else if (friend) {
$('list').insertAdjacentHTML('afterbegin', `<div class="friend-view"><strong>${esc(listName)}</strong>${readOnly}</div>`);
}
if (!friend && !mine && !auth && document.querySelector('#list .row')) $('list').insertAdjacentHTML('afterbegin', '<div class="notice">Zum Abhaken und Droppen: <button type="button" class="pill" data-connect>Konto verbinden</button></div>');
const times = [...document.querySelectorAll('.time')];
document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
applySearch();
syncSavingButtons();
restore();
resumeScroll();
if (revealMarkBar) { revealMarkBar = false; window.scrollTo({ top: 0 }); }
playEnter();
}
let planShowsCache = { key: '', time: 0, media: [] };
async function missingPlanShows(plan, entries) {
if (!plan || !soloPerson) return [];
const account = auth, person = soloPerson;
const current = () => auth === account && soloPerson === person;
const listed = new Set(entries.map(e => e.media.id));
const ids = [];
for (const show of picks(plan, soloPerson).keys()) {
const id = Object.entries(streamsDe?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles))?.[0];
if (id && !listed.has(Number(id))) ids.push(Number(id));
}
if (!ids.length) return [];
const key = ids.join() + (auth ? ':' + (auth.provider || 'anilist') + ':' + auth.name : '');
if (planShowsCache.key !== key || Date.now() - planShowsCache.time > LIST_CACHE_MS) {
const query = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
      id status episodes duration siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } ${auth ? 'mediaListEntry { progress status }' : ''}
    } } }`;
try {
let data;
if (account?.provider === 'mal') {
data = await anilist(query.replace('mediaListEntry { progress status }', 'idMal'), { ids });
for (const m of data.Page.media) { if (!current()) return []; MAL.rememberMedia(m); m.mediaListEntry = await MAL.entry(account, m.id); }
} else data = auth ? await anilistAsMe(query, { ids }, account) : await anilist(query, { ids });
if (!current()) return [];
planShowsCache = { key, time: Date.now(), media: data.Page.media };
setNote('catchup:missing', null);
} catch {
if (!current()) return [];
setNote('catchup:missing', `${unreachable('AniList')}: geplante Serien, die nicht auf der AniList-Liste sind, konnten nicht geprüft werden.`);
return [];
}
}
if (!current()) return [];
if (auth) for (const m of planShowsCache.media) {
if (m.mediaListEntry) knownEntries.set(m.id, { progress: m.mediaListEntry.progress, status: m.mediaListEntry.status });
else notOnList.add(m.id);
}
return planShowsCache.media
.filter(m => !['COMPLETED', 'DROPPED'].includes(m.mediaListEntry?.status))
.map(m => ({ progress: m.mediaListEntry?.progress || 0, media: m, missing: true }));
}
async function loadContent(refresh = false) {
if (listView()) return loadCatchup(refresh);
const start = weekStart(weekOffset);
const end = new Date(start); end.setDate(end.getDate() + 6);
const currentWeek = () => view === 'week' && start.getTime() === weekStart(weekOffset).getTime();
const year = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== new Date().getFullYear();
const fmt = d => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }) });
const dates = `${fmt(start)} – ${fmt(end)}`;
const selectedDay = range === 'today' ? new Date() : range === 'day' && pickedDay ? new Date(pickedDay + 'T12:00:00') : null;
$('week').textContent = selectedDay ? `${shortDayName(selectedDay)} ${fmt(selectedDay)}` : dates;
$('weekSub').textContent = selectedDay ? `${$('week').textContent} · Einzelansicht` : dates;
$('week').title = dates;
if (!weekCached(start) && !(refresh && document.querySelector('#list .row'))) $('list').innerHTML = LOADING_HTML;
const lastWeek = new Date(start); lastWeek.setDate(lastWeek.getDate() - 7);
const airings = Promise.all([fetchWeek(lastWeek), fetchWeek(start)]);
airings.catch(() => {});
await tabsReady;
if (!currentWeek()) return;
const needed = new Map();
for (const date of [lastWeek, start, end]) for (const t of activeTabs(tabs, date)) needed.set(t.gid, t);
const plans = new Map();
const problems = [];
await Promise.all([...needed.values()].map(t => sheetFor(t)
.then(sheet => { plans.set(t.gid, sheet); setNote('missing ' + t.gid, null); })
.catch(e => {
problems.push(`${t.name}: ${e.message}`);
setNote('missing ' + t.gid, `${unreachable('Google Sheets')}: „${t.name}“ konnte nicht gelesen werden, seine Serien fehlen.`);
})));
const weekTabs = [...new Set([tabFor(tabs, start), tabFor(tabs, end)])];
if (!currentWeek()) return;
if (!weekTabs.some(t => plans.has(t.gid))) {
if (refresh && document.querySelector('#list .row')) {
notice("Der Guckplan konnte nicht aktualisiert werden. Es werden weiter die bisherigen Daten angezeigt.");
return;
}
$('list').innerHTML = failed(navigator.onLine === false ? "Du bist offline, und dieser Guckplan ist in diesem Browser noch nicht gespeichert."
: `Der Guckplan konnte nicht gelesen werden (${problems.join('; ') || 'unbekannter Fehler'}).`);
return;
}
$('tabName').textContent = weekTabs.map(t => t.name).join(' / ');
rememberColors(plans.values());
fillPeople([...new Set(weekTabs.flatMap(t => plans.get(t.gid)?.people || []))]);
try {
const items = (await airings).flat();
if (!currentWeek()) return;
render(items, start, plans);
chaseLookups();
if (!refresh) scrollToStart();
resumeScroll();
updateCatchupCount();
readyNeighbours(start);
} catch (e) {
if (!currentWeek()) return;
if (refresh && document.querySelector('#list .row')) {
notice(`Der Zeitplan konnte nicht aktualisiert werden: ${e.message}. Es werden weiter die bisherigen Daten angezeigt.`);
return;
}
$('list').innerHTML = failed(`Der Zeitplan konnte nicht geladen werden: ${e.message}`);
}
}
$('list').addEventListener('click', e => { if (e.target.closest('.retry')) load(); });
$('list').addEventListener('click', e => {
const more = e.target.closest('.who-more');
if (!more) return;
const open = more.parentElement.classList.toggle('open');
more.setAttribute('aria-expanded', open);
more.textContent = open ? '–' : more.dataset.more;
});
let range = 'rest';
let pickedDay = null;
function pickDay(iso) {
const isToday = weekOffset === 0 && iso === isoDay(new Date());
if (isToday ? range === 'today' : range === 'day' && pickedDay === iso) setRange(weekOffset === 0 ? 'rest' : 'week');
else if (isToday) setRange('today');
else { setRange('day'); pickedDay = iso; }
enter = { y: 4 };
load();
}
function stepDay(by) {
const [y, m, d] = (range === 'today' ? isoDay(new Date()) : pickedDay).split('-').map(Number);
const next = new Date(y, m - 1, d + by);
if (next < weekStart(weekOffset)) weekOffset--;
else if (next >= weekStart(weekOffset + 1)) weekOffset++;
if (weekOffset === 0 && isoDay(next) === isoDay(new Date())) setRange('today');
else { setRange('day'); pickedDay = isoDay(next); }
enter = { x: by * 14 };
load();
}
function setRange(next) {
range = next;
if (next !== 'day') pickedDay = null;
$('fullWeek').setAttribute('aria-pressed', range === 'week');
$('jumpToday').setAttribute('aria-current', weekOffset === 0 && range === 'today' ? 'date' : 'false');
$('fullWeek').title = range === 'week' ? 'Ganze Woche wird angezeigt · Klick: wieder ab heute' : 'Alle sieben Tage anzeigen';
$('fullWeek').setAttribute('aria-label', $('fullWeek').title);
}
setRange('rest');
let resumeY = null;
try {
const place = JSON.parse(sessionStorage.getItem('resumePlace'));
sessionStorage.removeItem('resumePlace');
if (place) { weekOffset = place.weekOffset; setRange(place.range); pickedDay = place.pickedDay; resumeY = place.y; }
} catch {}
let sharedShowKey = '';
let sharedShowShown = false;
{
const params = new URLSearchParams(location.search);
const date = params.get('day');
if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
const picked = new Date(date + 'T12:00:00');
if (isoDay(picked) === date) {
const today = weekStart(0);
weekOffset = Math.floor(Math.round((Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate()) -
Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000) / 7);
view = 'week';
setRange('day');
pickedDay = date;
sharedShowKey = params.get('show') || '';
}
}
}
function resumeScroll() {
if (resumeY !== null) scrollTo(0, resumeY);
resumeY = null;
}
$('prev').onclick = () => { weekOffset--; setRange('week'); enter = { x: -14 }; load(); };
$('next').onclick = () => { weekOffset++; setRange('week'); enter = { x: 14 }; load(); };
$('jumpToday').onclick = () => { setView('week'); weekOffset = 0; setRange('today'); enter = { y: 4 }; load(); };
$('fullWeek').onclick = () => {
if (range === 'week') { weekOffset = 0; setRange('rest'); }
else setRange('week');
enter = { y: 4 };
load();
};
$('list').addEventListener('click', e => {
if (e.target.closest('[data-rest-of-week]')) { setRange('rest'); enter = { y: 4 }; load(); }
const jump = e.target.closest('[data-jump]');
if (jump) pickDay(jump.dataset.jump);
});
{
let from = null;
$('list').addEventListener('touchstart', e => {
const t = e.touches[0];
from = e.touches.length === 1 && view === 'week' && document.body.classList.contains('no-move')
&& t.clientX > 24 && t.clientX < innerWidth - 24 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
}, { passive: true });
$('list').addEventListener('touchend', e => {
if (!from) return;
const t = e.changedTouches[0], dx = t.clientX - from.x, dy = t.clientY - from.y, quick = Date.now() - from.at < 700;
from = null;
if (!quick || Math.abs(dx) <= 70 || Math.abs(dx) <= 2 * Math.abs(dy)) return;
if ((range === 'day' || range === 'today') && !searching()) stepDay(dx < 0 ? 1 : -1);
else $(dx < 0 ? 'next' : 'prev').click();
}, { passive: true });
}
try { localStorage.removeItem('todayFirst'); } catch {}
try { localStorage.removeItem('others'); } catch {}
const MOVES_API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/moves.json';
let moves = [];
let delays = [];
let absent = [];
// absent: [{ day, people }] for the whole day, or with from ("ab 21:00") / until ("bis 20:00"),
// or maybe: true ("spontan da": not planned with, but might turn up).
const absentOn = date => absent.filter(x => x.day === date && !x.from && !x.until && !x.maybe).flatMap(x => x.people || []);
const clockMinutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
// minute: minutes after the day's midnight (after midnight counts on: 00:30 = 1470); null = unknown time
const awayAt = (date, person, minute) => absent.some(x => x.day === date && x.people?.includes(person)
&& (!x.from || (minute != null && minute >= clockMinutes(x.from)))
&& (!x.until || (minute != null && minute < clockMinutes(x.until))));
const awayLabel = x => x.maybe ? 'spontan da' : x.from ? `ab ${x.from}` : x.until ? `bis ${x.until}` : 'ganztägig';
const awayText = date => absent.filter(x => x.day === date).flatMap(x => (x.people || []).map(p => x.from || x.until || x.maybe ? `${p} (${awayLabel(x)})` : p));
let reasonList = [];
let delaysUrl = '';
config().then(c => { if (c.delaysUrl) { delaysUrl = c.delaysUrl; if (lastWeekRender && view === 'week') render(...lastWeekRender); } });
let movesKey = '';
try { movesKey = localStorage.getItem('movesKey') || ''; } catch {}
function isoDay(d) {
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function loadMoves() {
let site = null, own = null;
try {
const res = await fetch('moves.json', { cache: 'no-cache' });
site = res.status === 404 ? { moves: [] } : await res.json();
setNote('moves', null);
} catch {
setNote('moves', `${unreachable('Die Seite')}: verschobene Serien konnten nicht geladen werden, daher stehen alle Serien in ihren Guckplan-Slots.`);
}
try { own = JSON.parse(localStorage.getItem('movesOwn')); } catch {}
const newest = own && (!site || !site.updated || Date.parse(own.updated) > Date.parse(site.updated)) ? own : site;
moves = newest?.moves || [];
delays = newest?.delays || [];
absent = Array.isArray(newest?.absent) ? newest.absent : [];
reasonList = goodReasons(newest?.reasons);
}
function moveFor(show, monday) {
const key = norm(show.romaji || show.english);
return moves.find(m => m.show === key && m.week === isoDay(monday)) || moves.find(m => m.show === key && !m.week);
}
let movesQueue = Promise.resolve(), movesPending = 0;
function saveMoves(next, changeDelays = null, reasons = null, absentNext = null) {
next = next.filter(m => !m.week || Date.parse(m.week) > Date.now() - 14 * 86400000);
const before = { moves, absent };
if (!changeDelays) {
moves = next;
if (absentNext) absent = absentNext;
if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true);
}
movesPending++;
const job = movesQueue.catch(() => {}).then(() => saveMovesNow(next, changeDelays, reasons, absentNext)).finally(() => movesPending--);
movesQueue = job;
return job.catch(e => {
if (!changeDelays) { moves = before.moves; absent = before.absent; if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true); }
throw e;
});
}
let movesWritten = null;
async function saveMovesNow(next, changeDelays, reasons, absentNext) {
const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
for (let attempt = 0; attempt < 4; attempt++) {
if (attempt) await new Promise(r => setTimeout(r, 800 * attempt));
const current = await fetch(MOVES_API + '?ref=main&_=' + Date.now(), { headers, cache: 'no-store' });
let meta = current.ok ? await current.json() : null;
let remote = {};
try { if (meta?.content) remote = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch {}
if (meta?.sha && movesWritten && meta.sha === movesWritten.replaced) { remote = movesWritten.file; meta = { sha: movesWritten.sha }; }
let nextDelays = remote.delays || [];
if (changeDelays) nextDelays = changeDelays(nextDelays);
nextDelays = nextDelays.filter(d => Date.parse(d.day) > Date.now() - 2 * 86400000);
const remoteReasons = goodReasons(remote.reasons);
const nextAbsent = (absentNext || (Array.isArray(remote.absent) ? remote.absent : [])).filter(x => Date.parse(x.day) > Date.now() - 2 * 86400000 && x.people?.length);
const file = { updated: new Date().toISOString(), moves: changeDelays ? (remote.moves || next) : next, ...(nextDelays.length && { delays: nextDelays }), ...(nextAbsent.length && { absent: nextAbsent }), reasons: reasons || (remoteReasons.length ? remoteReasons : DELAY_REASONS) };
const content = btoa(unescape(encodeURIComponent(JSON.stringify(file, null, 1) + '\n')));
const res = await fetch(MOVES_API, { method: 'PUT', headers,
body: JSON.stringify({ message: reasons ? 'Verspätungsgründe' : absentNext ? 'Abwesend' : changeDelays ? 'Verspätung' : 'Move shows', content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
if (res.ok) {
const sha = (await res.json().catch(() => null))?.content?.sha;
movesWritten = sha && meta?.sha ? { replaced: meta.sha, sha, file } : null;
const later = movesPending > 1;
if (!later) { moves = file.moves; absent = nextAbsent; }
delays = nextDelays;
reasonList = file.reasons;
movesSeen = movesStamp();
try { localStorage.setItem('movesOwn', JSON.stringify(file)); } catch {}
return;
}
if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : `GitHub antwortet ${res.status}`);
}
throw new Error('gerade gleichzeitig gespeichert, bitte nochmal versuchen');
}
const movesStamp = () => JSON.stringify([moves, delays, absent]);
let movesSeen = '';
let followingMoves = false;
const canFollowMoves = () => document.visibilityState === 'visible' && view === 'week' && lastWeekRender &&
lastWeekRender[1].getTime() === weekStart(weekOffset).getTime() &&
!movesPending && !document.querySelector('dialog[open]') && !document.body.classList.contains('dnd-moving');
async function followMoves() {
if (followingMoves || !canFollowMoves()) return;
const known = new Set(delays.map(d => d.id));
followingMoves = true;
try {
await loadMoves();
} finally {
followingMoves = false;
}
if (!canFollowMoves()) return;
const stamp = movesStamp();
if (stamp === movesSeen) return;
const fresh = movesSeen && delays.filter(d => !known.has(d.id) && d.day === isoDay(new Date()));
movesSeen = stamp;
render(...lastWeekRender, false, true);
if (fresh?.length) notice(fresh.map(d => `Verspätung: +${d.minutes} Min. ab ${d.title || d.show}`).join(' · '));
}
setInterval(followMoves, 30000);
$('movesSetup').hidden = $('moveToggle').hidden = !movesKey;
syncMoveEditor();
function openKeyDialog() {
$('keyInput').value = '';
$('keyMsg').textContent = movesKey ? 'In diesem Browser ist ein Schlüssel gespeichert.' : '';
$('keyDlg').showModal();
}
$('movesSetup').onclick = openKeyDialog;
if (location.hash === '#moves') { history.replaceState(null, '', location.pathname + location.search); openKeyDialog(); }
$('keySave').onclick = async () => {
const key = $('keyInput').value.trim();
if (!key) return;
$('keyMsg').textContent = 'Wird geprüft…';
try {
const res = await fetch('https://api.github.com/repos/RyoTsushigawa/anime-schedule', { headers: { Authorization: `Bearer ${key}` } });
const repo = res.ok ? await res.json() : null;
if (!repo?.permissions?.push) throw new Error(res.ok ? "dieser Schlüssel kann die Seite nicht ändern" : `GitHub antwortet ${res.status}`);
movesKey = key;
try { localStorage.setItem('movesKey', key); } catch {}
$('movesSetup').hidden = $('moveToggle').hidden = false;
syncMoveEditor();
$('keyMsg').textContent = 'Gespeichert.';
load(true);
} catch (e) { $('keyMsg').textContent = `Nicht gespeichert: ${e.message}`; }
};
$('keyRemove').onclick = () => {
movesKey = '';
$('moveToggle').hidden = true;
$('movesSetup').hidden = true;
syncMoveEditor();
try { localStorage.removeItem('movesKey'); } catch {}
$('keyMsg').textContent = 'Aus diesem Browser entfernt.';
load(true);
};
let moving = null, moveScope = 'week';
const syncMoveDialog = () => {
const double = ['moveDouble', 'moveLong'].some(id => $(id).getAttribute('aria-pressed') === 'true');
if (double) setMoveScope('week');
$('moveAlways').disabled = double;
};
const setMoveScope = scope => {
moveScope = scope;
$('moveWeek').setAttribute('aria-pressed', scope === 'week');
$('moveAlways').setAttribute('aria-pressed', scope === 'always');
};
$('moveWeek').onclick = () => setMoveScope('week');
$('moveAlways').onclick = () => setMoveScope('always');
$('list').addEventListener('click', e => {
const b = e.target.closest('.move');
if (!b || document.body.dataset.suppressMoveClick) return;
if (b.dataset.extra) { const x = moves.find(m => m.extra && m.show === b.dataset.extra && m.week === isoDay(weekStart(weekOffset))); if (x) openPlan(x); return; }
openMoveDialog(b);
});
function openMoveDialog(b, destination = null) {
if (!movesKey || !b) return;
moving = { key: norm(b.dataset.moveTitle), name: b.dataset.moveName };
const week = isoDay(weekStart(weekOffset));
const mv = moves.find(m => m.show === moving.key && m.week === week) || moves.find(m => m.show === moving.key && !m.week);
$('moveName').textContent = moving.name;
const thisWeek = moves.find(m => m.show === moving.key && m.week === week);
$('moveFrom').textContent = thisWeek?.skip ? 'Diese Woche geskippt; „Zurücksetzen“ holt sie zurück.'
: mv ? `Verschoben ${mv.week ? 'für diese Woche' : 'ab jetzt immer'}; „Zurücksetzen“ setzt sie in den Guckplan-Slot zurück.` : `Guckplan: ${slotLabel({ tag: b.dataset.tag, time: b.dataset.time })}`;
$('moveTag').value = b.dataset.tag || 'Mo.';
$('moveTime').value = b.dataset.time || '';
setMoveScope(mv && !mv.week ? 'always' : 'week');
$('moveReset').hidden = !mv;
$('moveMsg').textContent = '';
$('moveSkip').hidden = !!thisWeek?.skip;
$('keepSkipOption').hidden = !!thisWeek?.skip;
$('keepSkipTime').checked = false;
moving.mates = [...b.closest('.parallel-slot')?.querySelectorAll('.move:not([data-extra])') || []].filter(x => x !== b)
.map(x => ({ key: norm(x.dataset.moveTitle), name: x.dataset.moveName }));
const all = [moving.name, ...moving.mates.map(m => m.name)].join(', ');
$('moveBoth').hidden = !moving.mates.length;
$('moveBoth').title = `Zusammen verschieben: ${all}`;
$('skipBoth').hidden = !moving.mates.length || !!thisWeek?.skip;
$('skipBoth').title = `Zusammen skippen: ${all}`;
$('moveDouble').setAttribute('aria-pressed', String(!!thisWeek?.double));
$('moveLong').setAttribute('aria-pressed', String(!!thisWeek?.long));
syncMoveDialog();
if (destination) {
$('moveTag').value = destination.tag;
$('moveTime').value = destination.time;
setMoveScope('week');
$('moveMsg').textContent = destination.parallel ? 'Sie teilt sich dann den Slot mit der Zielserie.' : '';
}
$('moveDlg').showModal();
}
let movesUndo = null, delayUndo = null;
async function placeByDrag(b, to) {
const key = norm(b.dataset.moveTitle), thisWeek = isoDay(weekStart(weekOffset)), before = moves;
const week = editScope === 'week' ? thisWeek : '';
const home = to.tag === b.dataset.fromTag && to.time === clockOf(b.dataset.fromTime);
const was = week ? moves.find(m => m.show === key && m.week === thisWeek) : null;
const double = !!(was?.double || was?.long);
let next = moves.filter(m => !(m.show === key && (m.week === week || (!week && m.week === thisWeek))));
if (!home || double || (week && next.some(m => m.show === key && !m.week))) next = next.concat({ show: key, title: b.dataset.moveTitle, tag: to.tag, time: to.time, week, ...(was?.double && { double: true }), ...(was?.long && { long: true }) });
try { await saveMoves(next); } catch (e) { notice(`Nicht verschoben: ${e.message}`); return; }
notice(`${b.dataset.moveName}: ${slotLabel(to)}${to.parallel ? ' (daneben)' : ''}, ${week ? 'diese Woche' : 'ab jetzt'}.`, true);
movesUndo = before;
load(true);
}
async function undoMove() {
const before = movesUndo;
try { await saveMoves(before); notice('Rückgängig gemacht.'); load(true); } catch (e) { notice(`Nicht rückgängig gemacht: ${e.message}`); }
}

// Keep a pending save attached to the editor that started it.
function beginEditorSave(dialogId, messageId) {
 const dialog = $(dialogId), message = $(messageId);
 const token = Symbol('editor-save');
 dialog.saveToken = token;
 const controls = [...dialog.querySelectorAll('input, select, textarea, button')].map(el => [el, el.disabled]);
 controls.forEach(([el]) => { el.disabled = true; });
 dialog.setAttribute('aria-busy', 'true');
 message.setAttribute('role', 'status');
 message.textContent = 'Speichert…';
 const cancel = e => e.preventDefault();
 dialog.addEventListener('cancel', cancel);
 const finish = () => {
  if (dialog.saveToken !== token) return;
  controls.forEach(([el, disabled]) => { el.disabled = disabled; });
  dialog.removeAttribute('aria-busy');
  dialog.removeEventListener('cancel', cancel);
  dialog.removeEventListener('close', finish);
  delete dialog.saveToken;
 };
 dialog.addEventListener('close', finish, { once: true });
 return { active: () => dialog.saveToken === token && dialog.open, finish,
  failed: error => { if (dialog.saveToken === token) message.textContent = 'Nicht gespeichert: ' + error.message + '. Deine Eingaben bleiben erhalten. Bitte erneut speichern.'; } };
}
let refreshingViews = 0;
async function withRefreshFeedback(refresh, action) {
 const visible = refresh && !!document.querySelector('#list .row');
 let badge = document.getElementById('refreshFeedback');
 if (visible) {
  if (!badge) { badge = document.createElement('span'); badge.id = 'refreshFeedback'; badge.setAttribute('role', 'status'); document.body.append(badge); }
  refreshingViews++; badge.hidden = false; badge.textContent = 'Wird aktualisiert…';
 }
 try { return await action(); }
 finally { if (visible && --refreshingViews === 0) badge.hidden = true; }
}
async function load(refresh = false) { return withRefreshFeedback(refresh, () => loadContent(refresh)); }
async function loadCatchup(refresh = false) { return withRefreshFeedback(refresh, () => loadCatchupContent(refresh)); }

async function storeMoves(next, done, dlg = 'moveDlg', msg = 'moveMsg') {
  if ($(dlg).saveToken) return;
  const editor = beginEditorSave(dlg, msg);
$(msg).textContent = 'Speichert…';
try {
await saveMoves(next);
if (editor.active()) $(dlg).close();
notice(`${done} Alle sehen es in etwa einer Minute.`);
load(true);
} catch (e) { editor.failed(e); } finally { editor.finish(); }
}
$('moveTag').addEventListener('change', syncMoveDialog);
for (const id of ['moveDouble', 'moveLong']) $(id).onclick = () => {
$(id).setAttribute('aria-pressed', String($(id).getAttribute('aria-pressed') !== 'true'));
syncMoveDialog();
};
const namesOf = shows => shows.map(s => s.name).join(' und ');
const moveShows = shows => {
const double = $('moveDouble').getAttribute('aria-pressed') === 'true';
const long = $('moveLong').getAttribute('aria-pressed') === 'true';
const time = $('moveTime').value.trim();
if (time && !parseTime(time)) { $('moveMsg').textContent = 'Uhrzeit wie 21:00, oder leer für den nächsten freien Slot.'; return; }
const week = moveScope === 'week' || double || long ? isoDay(weekStart(weekOffset)) : '';
const keys = shows.map(s => s.key);
const next = moves.filter(m => !(keys.includes(m.show) && m.week === week))
.concat(shows.map(s => ({ show: s.key, title: s.name, tag: $('moveTag').value, time, week, ...(double && { double: true }), ...(long && { long: true }) })));
storeMoves(next, `${namesOf(shows)}${double ? ' mit Doppelfolge' : long ? ' mit langer Folge' : ''} auf ${slotLabel({ tag: $('moveTag').value, time })}${week ? ' (diese Woche)' : ''}.`);
};
$('moveSave').onclick = () => moveShows([moving]);
$('moveBoth').onclick = () => moveShows([moving, ...moving.mates]);
const skipShows = shows => {
const week = isoDay(weekStart(weekOffset)), keys = shows.map(s => s.key);
const next = moves.filter(m => !(keys.includes(m.show) && m.week === week))
.concat(shows.map(s => {
const current = moves.find(m => m.show === s.key && m.week === week) || moves.find(m => m.show === s.key && !m.week);
return { show: s.key, title: s.name, tag: current?.tag || '', time: current?.time || '', week, skip: true,
...($('keepSkipTime').checked && { keepTime: true }) };
}));
storeMoves(next, `${namesOf(shows)} ${shows.length > 1 ? 'werden' : 'wird'} diese Woche geskippt.`);
};
$('moveSkip').onclick = () => skipShows([moving]);
$('skipBoth').onclick = () => skipShows([moving, ...moving.mates]);
$('moveReset').onclick = () => {
const week = isoDay(weekStart(weekOffset));
const own = m => m.week === week || !m.week;
const mine = moves.find(m => m.show === moving.key && m.week === week) || moves.find(m => m.show === moving.key && !m.week);
const same = m => mine && m.week === mine.week && m.tag === mine.tag && m.time === mine.time && !!m.skip === !!mine.skip && !!m.keepTime === !!mine.keepTime;
const shows = [moving, ...moving.mates.filter(s => moves.some(m => m.show === s.key && same(m)))], keys = shows.map(s => s.key);
storeMoves(moves.filter(m => !(keys.includes(m.show) && own(m))), `${namesOf(shows)}: zurück im Guckplan-Slot.`);
};
let catchupById = new Map(), planning = null;
function openPlan(source) {
if (!movesKey) return;
const x = source.extra ? source : null;
const r = x ? null : source;
const m = x ? x.media : r.m;
const first = x ? x.first : r.first, out = x ? x.out : r.out;
planning = { m: x ? x.media : { id: m.id, title: { romaji: m.title.romaji, english: m.title.english }, coverImage: { medium: m.coverImage?.medium || '' }, siteUrl: m.siteUrl, episodes: m.episodes || null, externalLinks: (m.externalLinks || []).map(l => ({ site: l.site, url: l.url })) }, first, out, old: x };
const name = m.title.english || m.title.romaji;
$('planName').textContent = `Einplanen · ${name}`;
$('planFrom').textContent = x ? 'Nachholen, diese Woche.' : `Offen ab Folge ${first}.`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const days = Array.from({ length: 7 }, (_, i) => { const d = weekStart(0); d.setDate(d.getDate() + i); return d; }).filter(d => d >= today);
$('planDay').innerHTML = days.map(d => `<option value="${isoDay(d)}">${esc(nearDayName(d) || dayName(d))}, ${esc(germanDate(d))}</option>`).join('');
if (x && days.some(d => isoDay(d) === x.day)) $('planDay').value = x.day;
$('planTime').value = x?.time || '';
const count = Math.max(1, out - first + 1);
$('planCount').innerHTML = Array.from({ length: count }, (_, i) => `<option value="${i + 1}">${i ? `Folgen ${first}–${first + i}` : `Folge ${first}`}</option>`).join('');
$('planCount').value = String(x ? x.last - x.first + 1 : 1);
$('planRemove').hidden = !x;
$('planSave').textContent = x ? 'Speichern' : 'Einplanen';
$('planMsg').textContent = '';
$('planDlg').showModal();
}
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-plan]');
const r = b && catchupById.get(Number(b.dataset.plan));
if (r) openPlan(r);
});
$('planSave').onclick = () => {
const time = $('planTime').value.trim();
if (time && !parseTime(time)) { $('planMsg').textContent = 'Uhrzeit wie 21:00, oder leer für den nächsten freien Slot.'; return; }
const day = $('planDay').value;
if (!day) { $('planMsg').textContent = 'Diese Woche ist kein Tag mehr übrig.'; return; }
const { m, first, out, old } = planning;
const week = isoDay(weekStart(0)), key = `extra:${m.id}`, last = first + Number($('planCount').value || 1) - 1;
const name = m.title.english || m.title.romaji;
const entry = { show: key, title: name, extra: true, media: m, first, last, out, day, time, week };
const next = moves.filter(x => !(x.show === key && x.week === week) && x !== old).concat(entry);
const label = new Date(day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' });
storeMoves(next, `${name} (${last > first ? `Folgen ${first}–${last}` : `Folge ${first}`}) eingeplant: ${label}${time ? ' ' + time : ''}.`, 'planDlg', 'planMsg');
};
$('planRemove').onclick = () => {
const { m, old } = planning;
storeMoves(moves.filter(x => x !== old), `${m.title.english || m.title.romaji}: Nachholen entfernt.`, 'planDlg', 'planMsg');
};
// Nicknames for the Discord message (nicknames.json, written with the GitHub key from the Discord dialog).
// Keyed by AniList ID, or "t:" + lower-case title (the ID wins when both exist).
const NICKNAMES_API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/nicknames.json';
let nicknames = {};
const nickKey = r => (r.m?.id || r.alId) ? String(r.m?.id || r.alId) : 't:' + String(r.show.english || r.show.romaji).trim().toLowerCase();
const titleKey = r => 't:' + String(r.show.english || r.show.romaji).trim().toLowerCase();
const savedNick = r => nicknames[nickKey(r)] || nicknames[titleKey(r)] || '';
const nickOf = r => savedNick(r) || r.show.english || r.show.romaji;
const cleanNicknames = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
.filter(([k, v]) => typeof v === 'string' && v.trim() && !LINKISH.test(v)).map(([k, v]) => [k, v.trim().slice(0, 80)]));
const nicknamesReady = fetch('nicknames.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {})
.then(j => applyNickFile(j)).catch(() => {});
// nicknames.json as a whole: names and emotes (also used by tools/discord-daily.mjs)
function applyNickFile(j) {
nicknames = cleanNicknames(j?.names);
emotes = { ...DEFAULT_EMOTES, ...cleanEmotes(j?.emotes) };
}
const planPeople = () => lastWeekRender ? [...new Set([...lastWeekRender[2].values()].flatMap(s => s.people))] : [];
// Discord emotes: a webhook can't turn ":name:" into a server emote, so the message carries the full
// <:name:id> code. Every code typed into a nickname is remembered, after that ":name:" is enough.
// always known, so the message for an empty day can use it
const DEFAULT_EMOTES = { kek: '<:kek:1074622036648939550>' };
let emotes = { ...DEFAULT_EMOTES };
const EMOTE_CODE = /<(a?):(\w{2,32}):(\d{15,21})>/g;
const cleanEmotes = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
.filter(([k, v]) => /^\w{2,32}$/.test(k) && typeof v === 'string' && /^<a?:\w{2,32}:\d{15,21}>$/.test(v)));
const learnEmotes = text => Object.fromEntries([...String(text).matchAll(EMOTE_CODE)].map(([code, , name]) => [name, code]));
const withEmotes = text => text.replace(/(^|[^<a\w]):(\w{2,32}):(?!\d)/g, (all, before, name) => emotes[name] ? before + emotes[name] : all);
// The dialog shows the message the way Discord will: "@Sophie" for a ping code, ":name:" for an emote
// code. Copying puts the codes back, so Discord still pings and shows the emote.
const pingNames = () => Object.entries(DISCORD_PINGS).map(([name, code]) =>
['@' + (planPeople().find(p => p.toLowerCase() === name) || name[0].toUpperCase() + name.slice(1)), code]);
const readable = text => {
for (const [label, code] of pingNames()) text = text.split(code).join(label);
for (const [name, code] of Object.entries(emotes)) text = text.split(code).join(`:${name}:`);
return text;
};
const forDiscord = text => {
for (const [label, code] of pingNames()) text = text.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\wäöüß])', 'g'), code);
return withEmotes(text);
};
// why a planned show isn't on the list, so nobody wonders where it went
const skipReason = r => r.skipped ? 'Skip' : r.recap ? 'Recap' : 'Pause';
function discordMessage({ date, groups, skipped = [] }) {
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
const when = date.toDateString() === new Date().toDateString() ? 'Heute'
: date.toDateString() === tomorrow.toDateString() ? 'Morgen' : `Am ${dayName(date)}`;
const lines = groups.map(g => {
const names = [...new Set(g.map(r => nickOf(r) + (r.slot?.double && r.episodes?.length > 1 ? ' (x2)' : '')))];
const tags = [...new Set(g.flatMap(r => r.who || []).map(p => DISCORD_PINGS[p.toLowerCase()]).filter(Boolean))];
const time = new Date(g[0].watchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
return `${time} ${names.join(' / ')}${tags.length ? ' ' + tags.join(' ') : ''}`;
});
const out = [...new Map(skipped.map(r => [nickKey(r), r])).values()].map(r => `${nickOf(r)} – ${skipReason(r)}`);
// who is away that day ("Rei, Terra (ab 20:00)"); only when something is planned, an empty day needs no list
const away = lines.length ? awayText(isoDay(date)) : [];
return withEmotes((lines.length ? `${when} stehen an:\n\n${lines.join('\n')}\n\nPasst?` : `${when} steht nichts an. ${DEFAULT_EMOTES.kek}`)
+ (away.length ? `\n\nAbwesend: ${away.join(', ')}` : '')
+ (out.length ? `\n\nFällt aus:\n${out.join('\n')}` : ''));
}
function discordDay(iso) {
const found = lastWeekRender && render(...lastWeekRender, true).find(d => isoDay(d.date) === iso);
if (!found) return null;
const groups = [];
for (const r of found.rows.filter(r => !r.pause)) {
if (groups.at(-1)?.[0].watchAt === r.watchAt) groups.at(-1).push(r);
else groups.push([r]);
}
const skipped = found.rows.filter(r => r.pause).sort((a, b) => (a.watchAt ?? 0) - (b.watchAt ?? 0));
return { date: found.date, groups, skipped };
}
let discordOpen = null;
// Conservative, local suggestions: never written to nicknames.json without a save.
function nicknameSuggestions(title) {
  const original = String(title || '').trim();
  const out = [];
  const add = value => {
    const name = String(value || '').replace(/\s+/g, ' ').trim().replace(/[\s:–—-]+$/, '');
    if (name.length >= 3 && name.length < original.length && name.length <= 40
      && !out.some(x => x.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  const main = original.split(/\s+[–—|]\s+|:\s+/)[0];
  if (main !== original) add(main);
  const withoutExtra = original.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (withoutExtra !== original) add(withoutExtra);
  const afterAs = original.match(/\b(?:as|als)\s+(?:an?\s+|the\s+|ein(?:e[smnr]?)?\s+)?([^?!:,.]{3,35})[?!]?$/i);
  if (afterAs) add(afterAs[1]);
  const words = main.replace(/[^\p{L}\p{N}' -]/gu, '').split(/\s+/);
  if (words.length > 4) {
    const meaningful = words.filter(x => !/^(the|a|an|of|in|on|to|is|are|and|with|my|your|what|how|that|this|i|was|at|for|der|die|das|ein|eine|und|im|in|von)$/i.test(x));
    if (meaningful.length >= 2) add(meaningful.slice(0, 3).join(' '));
  }
  return out.slice(0, 3);
}
function seasonNicknameRows(date) {
  const rows = new Map();
  const add = (r, weekday) => {
    if (!r.show) return;
    const title = r.show.english || r.show.romaji;
    const key = norm(r.show.romaji || title);
    if (!key) return;
    let entry = rows.get(key);
    if (!entry) rows.set(key, entry = { ...r, nickDays: new Set() });
    if (r.m?.id && !entry.m?.id) entry.m = r.m;
    if (weekday >= 0) entry.nickDays.add(weekday);
  };
  // Include every day of this schedule week, including broadcasts on break.
  const days = render(...lastWeekRender, true) || [];
  for (const day of days)
    for (const r of day.rows) if (!r.extra) add(r, (day.date.getDay() + 6) % 7);
  // The complete season plan includes shows without an episode this week.
  // Respect week-specific moves when determining which weekday to list.
  const statuses = Object.entries(streamsDe?.status || {}).filter(([id]) => /^[0-9]+$/.test(id));
  const planIds = new Set(days.map(d => tabFor(tabs, d.date).gid));
  for (const gid of planIds) {
    const plan = lastWeekRender[2].get(gid);
    if (!plan) continue;
    for (const person of plan.people)
      for (const [show, slot] of picks(plan, person)) {
        if (show.hidden) continue;
        const move = moveFor(show, lastWeekRender[1]);
        const weekday = WEEKDAYS.indexOf(norm(move?.tag || slot.tag).slice(0, 2));
        const match = statuses.find(([, status]) => titleMatches([show.romaji, show.english], status.titles || []));
        add({ show, ...(match && { m: { id: Number(match[0]) } }) }, weekday);
      }
  }
  return [...rows.values()].sort((a, b) => (a.show.english || a.show.romaji).localeCompare(b.show.english || b.show.romaji, 'de'));
}
let nickDayFilter = 'all';
function filterNickFields() {
  const term = norm($('discordNickSearch').value.trim());
  let visible = 0;
  const items = $('discordNickList').querySelectorAll('.nick-item');
  for (const item of items) {
    item.hidden = (nickDayFilter !== 'all' && !item.dataset.days.split(',').includes(nickDayFilter))
      || (!!term && !norm(item.dataset.title).includes(term));
    if (!item.hidden) visible++;
  }
  $('discordNickCount').textContent = visible + ' / ' + items.length;
  for (const button of $('discordNickDays').querySelectorAll('[data-nick-day]'))
    button.setAttribute('aria-pressed', String(button.dataset.nickDay === nickDayFilter));
}
function showNickFields() {
const rows = seasonNicknameRows(discordOpen.date);
$('discordNicks').hidden = !rows.length;
$('discordNickToggle').hidden = !rows.length;
$('discordNickSearch').value = '';
$('discordNickList').innerHTML = rows.map(r => {
const title = r.show.english || r.show.romaji;
const chips = nicknameSuggestions(title).map(name => `<button type="button" class="nick-suggestion" data-nick-suggest="${esc(name)}" title="Vorschlag übernehmen (noch nicht speichern)">${esc(name)}</button>`).join('');
return `<div class="nick-item" data-days="${[...r.nickDays].join(',')}" data-title="${esc([title, r.show.romaji].filter(Boolean).join(' '))}"><label class="nick-row"><span title="${esc(title)}">${esc(title)}</span><input data-nick="${esc(nickKey(r))}" data-nick-title="${esc(titleKey(r))}" value="${esc(savedNick(r))}" placeholder="Eigener Kurzname" maxlength="80" autocomplete="off" aria-label="Spitzname für ${esc(title)}"></label>${chips ? `<div class="nick-suggestions"><span>Vorschläge</span>${chips}</div>` : ''}</div>`;
}).join('');
filterNickFields();
}
// a name saved by title moves to the show's ID when saved here, so clearing the field really clears it
const typedNicks = () => Object.fromEntries([...$('discordNickList').querySelectorAll('[data-nick]')]
.flatMap(i => [[i.dataset.nickTitle, ''], [i.dataset.nick, i.value.trim()]]));
const previewNicks = () => {
const saved = nicknames;
nicknames = cleanNicknames({ ...saved, ...typedNicks() });
$('discordText').value = readable(discordMessage(discordOpen));
nicknames = saved;
};
async function openNickEditor(date, day = null, setup = false) {
  if (!lastWeekRender) await load();
  if (!lastWeekRender) { notice('Der Guckplan muss zuerst geladen werden.'); return; }
  await nicknamesReady;
  discordOpen = day || discordDay(isoDay(date));
  if (!discordOpen) { notice('Für diesen Tag ist kein Guckplan verfügbar.'); return; }
  nickDayFilter = setup ? 'all' : String((date.getDay() + 6) % 7);
  $('discordDlg').classList.toggle('nickname-setup', setup);
  $('discordName').textContent = setup ? 'Spitznamen einrichten' : `${dayName(date)}, ${germanDate(date)}`;
  $('discordText').value = readable(discordMessage(discordOpen));
  $('discordMsg').textContent = '';
  showNickFields();
  $('discordNicks').hidden = false;
  $('discordNickToggle').setAttribute('aria-expanded', 'true');
  $('discordDlg').showModal();
  (setup ? $('discordNickSearch') : $('discordCopy')).focus();
}
$('settingsNicknames').onclick = async () => {
  showSettings(false);
  await openNickEditor(weekStart(weekOffset), null, true);
};
$('discordNickDays').addEventListener('click', e => {
  const button = e.target.closest('[data-nick-day]');
  if (!button) return;
  nickDayFilter = button.dataset.nickDay;
  filterNickFields();
});
$('list').addEventListener('click', async e => {
const b = e.target.closest('[data-day-discord]');
if (!b || !lastWeekRender) return;
const date = new Date(b.closest('.day').dataset.date + 'T12:00:00');
await openNickEditor(date);
});
$('discordNickSearch').addEventListener('input', filterNickFields);
$('discordNickList').addEventListener('input', previewNicks);
$('discordNickList').addEventListener('click', e => {
  const chip = e.target.closest('[data-nick-suggest]');
  if (!chip) return;
  const input = chip.closest('.nick-item')?.querySelector('[data-nick]');
  if (!input) return;
  input.value = chip.dataset.nickSuggest;
  input.focus();
  previewNicks();
  $('discordMsg').textContent = 'Vorschlag übernommen, noch nicht gespeichert.';
});
$('discordNickToggle').onclick = () => {
  const panel = $('discordNicks');
  panel.hidden = !panel.hidden;
  $('discordNickToggle').setAttribute('aria-expanded', String(!panel.hidden));
};
$('discordNickSave').onclick = async () => {
const typed = typedNicks();
if (Object.values(typed).some(v => LINKISH.test(v))) { $('discordMsg').textContent = 'Keine Links in Spitznamen.'; return; }
$('discordNickSave').disabled = true;
$('discordMsg').textContent = 'Speichere …';
try {
nicknames = await saveNicknames(typed);
$('discordText').value = readable(discordMessage(discordOpen));
$('discordMsg').textContent = 'Spitznamen gespeichert, auch für den täglichen Post.';
} catch (err) {
$('discordMsg').textContent = `Nicht gespeichert: ${err.message}.`;
} finally {
$('discordNickSave').disabled = false;
}
};
async function saveNicknames(changes) {
const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
for (let attempt = 0; attempt < 4; attempt++) {
if (attempt) await new Promise(r => setTimeout(r, 800 * attempt));
const current = await fetch(NICKNAMES_API + '?ref=main&_=' + Date.now(), { headers, cache: 'no-store' });
const meta = current.ok ? await current.json() : null;
let remote = {};
try { if (meta?.content) remote = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch {}
const names = cleanNicknames(remote.names);
for (const [k, v] of Object.entries(changes)) { if (v) names[k] = v.slice(0, 80); else delete names[k]; }
const known = { ...cleanEmotes(remote.emotes), ...learnEmotes(Object.values(changes).join(' ')) };
emotes = { ...DEFAULT_EMOTES, ...known };
const file = { updated: new Date().toISOString(), names, ...(Object.keys(known).length && { emotes: known }) };
const content = btoa(unescape(encodeURIComponent(JSON.stringify(file, null, 1) + '\n')));
const res = await fetch(NICKNAMES_API, { method: 'PUT', headers,
body: JSON.stringify({ message: 'Spitznamen', content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
if (res.ok) return names;
if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : `GitHub antwortet ${res.status}`);
}
throw new Error('gerade gleichzeitig gespeichert, bitte nochmal versuchen');
}
$('discordCopy').onclick = async () => {
const text = forDiscord($('discordText').value);
try { await navigator.clipboard.writeText(text); }
catch { $('discordText').select(); if (!document.execCommand?.('copy')) { $('discordMsg').textContent = 'Kopieren ging nicht: Text markieren und Strg+C.'; return; } }
$('discordDlg').close();
notice('Für Discord kopiert.');
};
const DELAY_REASONS = ['Verzögerungen im Betriebsablauf', 'Verspätung eines vorausfahrenden Zuschauers',
'Reparatur am Gaming-Stuhl', 'Personen im Gleis (Küche)', 'Warten auf Anschlussreisende', 'Technische Störung am Monitor',
'Signalstörung im WLAN', 'Kurzfristiger Personalausfall', 'Unwetter: Pizza noch im Ofen', 'Notarzteinsatz am Snackregal',
'Weichenstörung in der Mikrowelle', 'Polizeieinsatz: Maus vermisst', 'Bauarbeiten am Discord-Server',
'Tiere auf der Strecke (Katze auf der Tastatur)', 'Hohes Reiseaufkommen im Bad', 'Geänderte Wagenreihung',
'Stellwerksstörung am Router', 'Verspätete Bereitstellung des Zuschauers', 'Unerwartete Updates (Windows)',
'Ein Zuschauer steckt noch im Bus fest', 'Kopfhörer werden noch geladen', 'Wartung des Snackvorrats',
'Probleme bei der Parkplatzsuche',
'Baum in der Internetleitung', 'Bagger hat das Glasfaserkabel gefunden', 'Router wird neu gestartet (zum dritten Mal)',
'Ping-Stau auf der Datenautobahn', 'Buffering im Gegenverkehr', 'Paketverlust zwischen Router und PC',
'WLAN-Signal hängt im Treppenhaus fest', 'Discord-Update wird installiert', 'Discord-Stream ruckelt (Pixelbrei)',
'Streamingdienst verlangt erneut das Passwort', 'Crunchyroll lädt nur in 240p', 'Bildschirmfreigabe zeigt nur Schwarz',
'DNS-Störung im Stellwerk', 'Downloadgeschwindigkeit auf Bahn-WLAN-Niveau', 'Techniker ist informiert',
'Mikrofon steht noch auf stumm', 'Solutions30 macht 30 Probleme',
'Eine Isekai-Reise dauert länger als geplant', 'Ein Truck-kun ist auf der Strecke liegen geblieben',
'Opening wird noch ein letztes Mal angehört', 'Filler-Folge im Betriebsablauf', 'Zoro sucht noch den Weg zum Bahnhof',
'Ein Charakter hält noch seinen Power-up-Monolog',
'Flashback auf der Strecke', 'Tsundere weigert sich zuzugeben, dass sie mitschauen will',
'Training im Hyperbolischen Zeitraum dauert noch', 'Ein Zuschauer wurde von einem Stand angegriffen',
'Beach-Folge: Zuschauer trocknen noch ab', 'Ein Zuschauer musste erst noch das Manga-Kapitel lesen',
'Endlose Abspannszene: es kommt bestimmt noch was', 'Gruppenbild für die Season-Abschluss-Party',
'Ein Zuschauer ist am Schreibtisch eingeschlafen', 'Ein Zuschauer schaut noch die Folge von letzter Woche nach',
'Uneinigkeit über Sub oder Dub', 'Abstimmung über die Snackauswahl läuft', 'Zuschauer im Gleisbett des Kühlschranks',
'Ein Zuschauer sucht noch seine Lieblingsdecke', 'Verspätete Ankunft aus dem Homeoffice', 'Ein Zuschauer hat Spoiler gelesen und muss sich erholen',
'Bereitstellung des Lieferdienstes verzögert sich', 'Ein Zuschauer ist im Gacha-Spiel hängen geblieben',
'Haustier fordert Aufmerksamkeit', 'Zuschauer im falschen Discord-Kanal', 'Ein Zuschauer muss noch „nur kurz“ etwas erledigen', 'Escanor'];
const LINKISH = /https?:|www\.|discord\.gg|\]\(|[a-z0-9-]+\.(com|net|org|de|gg|io|ly|me|xyz|ru|co)\b/i;
const goodReasons = list => Array.isArray(list)
? [...new Set(list.filter(r => typeof r === 'string').map(r => r.trim()).filter(r => r && r.length <= 80 && !LINKISH.test(r)))].slice(0, 300) : [];
const reasonPool = () => reasonList.length ? reasonList : DELAY_REASONS;
const randomReason = () => { const pool = reasonPool(); return pool[Math.floor(Math.random() * pool.length)]; };
const fillReasons = () => { $('delayReason').innerHTML = reasonPool().map(r => `<option>${esc(r)}</option>`).join(''); };
fillReasons();
let delayDay = null;
const hhmmOf = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const delaysOf = date => [...new Map(delays.filter(x => x.day === date).map(x => [x.show, x])).values()];
function openDelay(date, show) {
const found = lastWeekRender && render(...lastWeekRender, true).find(d => isoDay(d.date) === date);
if (!found) return;
const rows = found.rows.filter(r => !r.pause && r.show);
const keyOf = r => norm(r.show.romaji || r.show.english);
delayDay = { date, rows: [...new Map(rows.map(r => [keyOf(r), r])).values()].map(r => ({ key: keyOf(r), title: r.show.english || r.show.romaji, at: r.plannedAt ?? r.watchAt, now: r.watchAt })) };
delayDay.keyFor = x => {
if (x.show[0] !== '@') return x.show;
const at = delayClock(found.date, x.show.slice(1));
return delayDay.rows.filter(r => r.at >= at).sort((p, q) => p.at - q.at)[0]?.key;
};
if (show?.[0] === '@') show = delayDay.keyFor({ show });
$('delayName').textContent = `Verspätung · ${dayName(found.date)}, ${germanDate(found.date)}`;
const has = new Map(delaysOf(date).map(x => [delayDay.keyFor(x), x]));
const from = show && delayDay.rows.find(r => r.key === show) || delayDay.rows.find(r => r.now > Date.now()) || delayDay.rows[0];
$('delayFrom').innerHTML = delayDay.rows.map(r => `<option value="${esc(r.key)}"${r === from ? ' selected' : ''}>ab ${hhmmOf(r.at)} ${esc(r.title)}${has.get(r.key) ? ` · +${has.get(r.key).minutes}` : ''}</option>`).join('');
$('delayMsg').textContent = delayDay.rows.length ? '' : 'An diesem Tag steht nichts an.';
$('delaySave').disabled = !delayDay.rows.length;
fillDelay();
$('delayDlg').showModal();
}
function fillDelay() {
const current = delayDay && delaysOf(delayDay.date).find(x => delayDay.keyFor(x) === $('delayFrom').value) || null;
delayDay.current = current;
const minutes = current?.minutes || 15;
const chip = $('delayMinutes').querySelector(`[data-min="${minutes}"]`);
for (const x of $('delayMinutes').querySelectorAll('[data-min]')) x.setAttribute('aria-pressed', String(x === chip));
$('delayCustom').value = chip ? '' : minutes;
fillReasons();
$('delayReason').value = reasonPool().includes(current?.reason) ? current.reason : randomReason();
$('delayRemove').hidden = !current;
$('delayList').hidden = !movesKey;
}
for (const id of ['delayReason', 'delayCustom'])
$(id).addEventListener('keydown', e => {
if (e.key !== 'Enter' || e.isComposing || $('delaySave').disabled) return;
e.preventDefault();
$('delaySave').click();
});
$('delayFrom').addEventListener('change', fillDelay);
const delayMinutes = () => Number($('delayCustom').value) || Number($('delayMinutes').querySelector('[aria-pressed="true"]')?.dataset.min) || 0;
$('delayMinutes').addEventListener('click', e => {
const b = e.target.closest('[data-min]');
if (!b) return;
for (const x of $('delayMinutes').querySelectorAll('[data-min]')) x.setAttribute('aria-pressed', String(x === b));
$('delayCustom').value = '';
});
$('delayCustom').addEventListener('input', () => {
if ($('delayCustom').value) for (const x of $('delayMinutes').querySelectorAll('[data-min]')) x.setAttribute('aria-pressed', 'false');
});
$('delayDice').onclick = () => { $('delayReason').value = randomReason(); };
$('delayList').onclick = () => {
$('reasonsText').value = reasonPool().join('\n');
$('reasonsMsg').textContent = `${reasonPool().length} Gründe, einer pro Zeile.`;
$('reasonsDlg').showModal();
$('reasonsText').scrollTop = 0;
$('reasonsText').setSelectionRange(0, 0);
};
$('reasonsDefault').onclick = () => {
$('reasonsText').value = DELAY_REASONS.join('\n');
$('reasonsMsg').textContent = `${DELAY_REASONS.length} Gründe (Standard), noch nicht gespeichert.`;
};
$('reasonsSave').onclick = async () => {
const lines = $('reasonsText').value.split('\n').map(l => l.trim()).filter(Boolean);
const bad = lines.find(l => l.length > 80 || LINKISH.test(l));
if (bad) { $('reasonsMsg').textContent = `„${bad.length > 40 ? bad.slice(0, 40) + '…' : bad}“: ${bad.length > 80 ? 'höchstens 80 Zeichen' : 'keine Links'}.`; return; }
const list = [...new Set(lines)];
if (!list.length || list.length > 300) { $('reasonsMsg').textContent = 'Bitte 1 bis 300 Gründe.'; return; }
$('reasonsMsg').textContent = 'Speichert…';
$('reasonsSave').disabled = true;
try {
await saveMoves(moves, d => d, list);
$('reasonsDlg').close();
const picked = $('delayReason').value;
fillReasons();
$('delayReason').value = reasonPool().includes(picked) ? picked : randomReason();
$('delayMsg').textContent = `Liste gespeichert: ${list.length} Gründe.`;
} catch (e) { $('reasonsMsg').textContent = `Nicht gespeichert: ${e.message}`; }
finally { $('reasonsSave').disabled = false; }
};
async function postDelay(op) {
const send = async () => {
for (let attempt = 0; ; attempt++) {
const response = await fetch(delaysUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
if (response.status !== 409 || attempt >= 3) return response;
await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
}
};
let res;
try { res = await send(); } catch {
await new Promise(r => setTimeout(r, 1500));
try { res = await send(); } catch { throw new Error('der Speicherdienst (workers.dev) ist nicht erreichbar. Blockt ein Adblocker oder das Netzwerk ihn?'); }
}
const body = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(body.error || `der Speicherdienst antwortet ${res.status}`);
moves = body.moves || moves;
delays = body.delays || [];
absent = Array.isArray(body.absent) ? body.absent : absent;
if (body.reasons) reasonList = goodReasons(body.reasons);
movesSeen = movesStamp();
try { localStorage.setItem('movesOwn', JSON.stringify(body)); } catch {}
}
async function changeDelays(day, show, add, oldShow = show) {
const mine = x => x.day === day && (x.show === show || x.show === oldShow);
const old = delays.filter(mine);
if (movesKey && !delaysUrl) {
await saveMoves(moves, d => d.filter(x => !mine(x)).concat(add || []));
return;
}
if (!delaysUrl) throw new Error('Speichern für alle ist noch nicht eingerichtet');
if (add) await postDelay({ add });
for (const x of old) await postDelay({ remove: x.id });
}
async function undoDelay() {
const { day, show, add } = delayUndo;
try { await changeDelays(day, show, add); notice('Verspätung wieder da.'); if (lastWeekRender) render(...lastWeekRender); }
catch (e) { notice(`Nicht rückgängig gemacht: ${e.message}`); }
}
async function storeDelay(add, done, undo = null) {
 if ($('delayDlg').saveToken) return;
 const editor = beginEditorSave('delayDlg', 'delayMsg');
$('delayMsg').textContent = 'Speichert…';
$('delaySave').disabled = $('delayRemove').disabled = true;
try {
await changeDelays(delayDay.date, $('delayFrom').value, add, delayDay.current?.show);
if (editor.active()) $('delayDlg').close();
notice(`${done} Alle sehen es in etwa einer Minute.`, !!undo);
delayUndo = undo;
if (lastWeekRender) render(...lastWeekRender);
} catch (e) { editor.failed(e); }
finally { editor.finish(); }
}
$('delaySave').onclick = () => {
const minutes = Math.round(delayMinutes());
if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 99999) { $('delayMsg').textContent = 'Bitte 1 bis 99999 Minuten eingeben.'; return; }
const from = delayDay.rows.find(r => r.key === $('delayFrom').value);
if (!from) return;
const reason = reasonPool().includes($('delayReason').value) ? $('delayReason').value : randomReason();
const id = Math.random().toString(36).slice(2, 10);
storeDelay({ id, day: delayDay.date, show: from.key, at: hhmmOf(from.at), title: from.title, minutes, reason },
`${delayDay.current ? 'Verspätung geändert: ' : ''}+${minutes} Min. ab ${from.title}.`);
};
$('delayRemove').onclick = () => {
const removed = delayDay.current;
storeDelay(null, 'Verspätung entfernt.', removed && { day: delayDay.date, show: removed.show, add: removed });
};
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-day-delay]');
if (b) openDelay(b.closest('.day').dataset.date);
const edit = e.target.closest('[data-delay-edit]');
if (edit) openDelay(edit.closest('.day').dataset.date, edit.dataset.delayEdit);
});
// Abwesenheiten: a month calendar (top bar button, or any day's "Abwesend") where planned absences
// go in for one day or a range, the whole day or only "ab"/"bis" a time. Shows with too few people
// left are skipped on the schedule and in the Discord message.
const awayCal = { month: null, start: null, end: null, mode: 'day', repeat: 'once' };
const AWAY_REPEAT_WEEKS = 12;
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const allPeople = () => {
const fromPlan = lastWeekRender ? [...new Set([...lastWeekRender[2].values()].flatMap(s => s.people))] : [];
return fromPlan.length ? fromPlan : [...$('soloPerson').options].map(o => o.value);
};
const dayOf = iso => new Date(iso + 'T12:00:00');
const addDay = (iso, n) => { const d = dayOf(iso); d.setDate(d.getDate() + n); return isoDay(d); };
const shortDate = iso => `${shortDayName(dayOf(iso))} ${germanDate(dayOf(iso))}`;
function selectedDays() {
if (!awayCal.start) return [];
const days = [];
for (let d = awayCal.start; d <= (awayCal.end || awayCal.start) && days.length < 92; d = addDay(d, 1)) days.push(d);
return days;
}
function openAway(date) {
const today = isoDay(new Date());
const pick = date && date >= today ? date : null;
awayCal.month = (pick || today).slice(0, 7);
awayCal.start = pick; awayCal.end = null; awayCal.mode = 'day'; awayCal.repeat = 'once';
// in Solo view the dialog starts with that person chosen, until someone picks by hand
awayCal.me = mode === 'solo' && soloPerson ? soloPerson : null;
$('awayMsg').textContent = '';
drawAway();
$('awayDlg').showModal();
}
function drawAway() {
const today = isoDay(new Date());
const [y, m] = awayCal.month.split('-').map(Number);
const first = new Date(y, m - 1, 1);
const length = new Date(y, m, 0).getDate();
// in the current month the grid starts with this week: past weeks can't be changed anyway
const thisMonth = awayCal.month === today.slice(0, 7);
const startDay = thisMonth ? Math.max(1, Number(today.slice(8)) - (new Date().getDay() + 6) % 7) : 1;
const lead = (new Date(y, m - 1, startDay).getDay() + 6) % 7;
$('awayMonth').textContent = `${MONTHS[m - 1]} ${y}`;
$('awayPrev').disabled = awayCal.month <= today.slice(0, 7);
$('awayToday').disabled = awayCal.month === today.slice(0, 7);
const chosen = selectedDays();
const sel = new Set(chosen);
$('awayHint').textContent = !awayCal.start
  ? (awayCal.repeat === 'weekly' ? 'Wochentag auswählen · Wird 12-mal wiederholt.' : 'Tag auswählen · Für einen Zeitraum danach den letzten Tag wählen.')
  : awayCal.end
    ? `${chosen.length} Tage ausgewählt · ${shortDate(chosen[0])} – ${shortDate(chosen.at(-1))}.`
    : awayCal.repeat === 'weekly' ? `Wöchentlich ab ${shortDate(awayCal.start)} · ${AWAY_REPEAT_WEEKS} Termine.` : `Start: ${shortDate(awayCal.start)} · Für einen Zeitraum den letzten Tag wählen.`;
const cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<span class="away-wd">${d}</span>`);
for (let i = 0; i < lead; i++) cells.push('<span class="away-empty" aria-hidden="true"></span>');
for (let n = startDay; n <= length; n++) {
const iso = `${awayCal.month}-${String(n).padStart(2, '0')}`;
const entries = absent.filter(x => x.day === iso);
const dots = entries.flatMap(x => (x.people || []).map(p => `<i style="${personStyle(p)}" title="${esc(p)} ${awayLabel(x)}"${x.maybe ? ' class="maybe"' : x.from || x.until ? ' class="part"' : ''}></i>`)).join('');
cells.push(`<button type="button" class="away-day${iso === today ? ' today' : ''}${sel.has(iso) ? ' sel' : ''}${entries.length ? ' has-entries' : ''}" data-away-day="${iso}"${iso < today ? ' disabled' : ''}${iso === today ? ' aria-current="date"' : ''} aria-pressed="${sel.has(iso)}" aria-label="${esc(shortDate(iso))}${entries.length ? ': ' + esc(awayText(iso).join(', ')) : ''}"><b>${n}</b><span class="away-dots">${dots}</span></button>`);
}
$('awayGrid').innerHTML = cells.join('');
drawAwayEditor();
drawAwayList();
}
function drawAwayEditor() {
const days = selectedDays();
$('awayEditor').hidden = !days.length;
if (!days.length) return;
$('awayRange').textContent = days.length > 1 ? `${shortDate(days[0])} – ${shortDate(days.at(-1))}` : shortDate(days[0]);
for (const b of $('awayMode').querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === awayCal.mode));
$('awayTime').hidden = awayCal.mode === 'day' || awayCal.mode === 'maybe';
for (const b of $('awayRepeat').querySelectorAll('[data-repeat]')) b.setAttribute('aria-pressed', String(b.dataset.repeat === awayCal.repeat));
$('awayRepeatHint').textContent = awayCal.repeat === 'weekly'
  ? `Wiederholt sich ${AWAY_REPEAT_WEEKS} Wochen lang. Für die Wiederholung nur einen Tag auswählen.`
  : 'Einmaliger Termin oder mehrtägiger Zeitraum.';
// whole day: pressed = away on every chosen day, "mixed" = on some (left alone unless clicked)
$('awayPeople').innerHTML = allPeople().map(p => {
const on = awayCal.mode === 'day' ? days.filter(d => absentOn(d).includes(p)).length : 0;
const state = on === days.length && on ? 'true' : on ? 'mixed' : p === awayCal.me ? 'true' : 'false';
return `<button type="button" class="pill" data-away="${esc(p)}" aria-pressed="${state}" style="${personStyle(p)}">${esc(p)}</button>`;
}).join('');
}
function drawAwayList() {
const today = isoDay(new Date());
const entries = absent.filter(x => x.day >= today).flatMap(x => (x.people || []).map(p => ({ p, day: x.day, cond: awayLabel(x) })));
const byPerson = new Map();
for (const it of entries) {
  const key = JSON.stringify([it.p, it.cond]);
  if (!byPerson.has(key)) byPerson.set(key, []);
  byPerson.get(key).push(it);
}
const runs = [];
for (const group of byPerson.values()) {
  const dates = [...new Set(group.map(it => it.day))].sort();
  if (!dates.length) continue;
  const { p, cond } = group[0];
  // Preserve consecutive-day ranges. A recurring absence is a sequence of
  // matching weekdays separated by exactly seven days (at least 3 repeats).
  const consecutive = dates.some((d, i) => i > 0 && addDay(dates[i - 1], 1) === d);
  if (!consecutive) {
    let rest = [];
    const flushRest = () => {
      for (const day of rest) runs.push({ p, cond, from: day, to: day, days: [day] });
      rest = [];
    };
    for (let i = 0; i < dates.length;) {
      let j = i + 1;
      while (j < dates.length && addDay(dates[j - 1], 7) === dates[j]) j++;
      if (j - i >= 3) {
        flushRest();
        runs.push({ p, cond, from: dates[i], to: dates[j - 1], days: dates.slice(i, j), weekly: true });
      } else rest.push(...dates.slice(i, j));
      i = j;
    }
    flushRest();
  } else {
    for (const d of dates) {
      const prev = runs.at(-1);
      if (prev && prev.p === p && prev.cond === cond && !prev.weekly && addDay(prev.to, 1) === d) {
        prev.to = d; prev.days.push(d);
      } else runs.push({ p, cond, from: d, to: d, days: [d] });
    }
  }
}
runs.sort((a, b) => a.from.localeCompare(b.from) || a.p.localeCompare(b.p));
$('awayList').innerHTML = runs.length ? runs.map(r => {
  const dates = r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} – ${shortDate(r.to)}`;
  const label = r.weekly ? `Jede Woche · ${r.days.length} Termine · ${dates}` : dates;
  const action = r.weekly ? 'Wiederholung entfernen' : 'Eintrag entfernen';
  const payload = esc(JSON.stringify(r));
  return `<li><span class="away-who" style="${personStyle(r.p)}">${esc(r.p)}</span><span>${esc(label)} · ${esc(r.cond)}</span><span class="away-entry-actions"><button type="button" class="pill" data-away-edit="${payload}" aria-label="Eintrag bearbeiten: ${esc(r.p)}" title="Eintrag bearbeiten">Bearbeiten</button><button type="button" class="pill" data-away-remove="${payload}" aria-label="${action}: ${esc(r.p)}" title="${action}">✕</button></span></li>`;
}).join('') : '<li class="muted">Niemand hat etwas eingetragen.</li>';
}
// Saves the absences of the given days (the rest stay as they are).
async function saveAway(next, days) {
if (movesKey) return saveMoves(moves, d => d, null, next);
if (!delaysUrl) throw new Error('Speichern für alle ist noch nicht eingerichtet');
try { await postDelay({ absent: next.filter(x => days.includes(x.day)), days }); }
catch (e) { throw /nichts zu tun|unbekannt|unknown|not allowed|ungültig/i.test(e.message) ? new Error('der Speicherdienst kann Abwesenheiten noch nicht speichern. Bis zum Update geht es mit dem Bearbeitungszugang') : e; }
}
async function storeAway(next, days, done) {
$('awayMsg').textContent = 'Speichert…';
for (const b of $('awayDlg').querySelectorAll('button')) b.disabled = true;
try {
await saveAway(next, days);
} catch (e) { $('awayMsg').textContent = `Nicht gespeichert: ${e.message}.`; return; }
finally { for (const b of $('awayDlg').querySelectorAll('button')) b.disabled = false; }
absent = next;
$('awayMsg').textContent = `${done} Alle sehen es in etwa einer Minute.`;
drawAway();
try { if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true); } catch (e) { console.error(e); }
}
$('awayButton').onclick = () => openAway();
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-day-absent]');
if (b) openAway(b.closest('.day').dataset.date);
});
$('awayPrev').onclick = () => { const d = dayOf(awayCal.month + '-01'); d.setMonth(d.getMonth() - 1); awayCal.month = isoDay(d).slice(0, 7); drawAway(); };
$('awayNext').onclick = () => { const d = dayOf(awayCal.month + '-01'); d.setMonth(d.getMonth() + 1); awayCal.month = isoDay(d).slice(0, 7); drawAway(); };
$('awayToday').onclick = () => { awayCal.month = isoDay(new Date()).slice(0, 7); drawAway(); };
$('awayGrid').addEventListener('click', e => {
const iso = e.target.closest('[data-away-day]')?.dataset.awayDay;
if (!iso) return;
// first tap: one day; second tap on a later day: the range up to it; one more tap starts over
if (awayCal.repeat !== 'weekly' && awayCal.start && !awayCal.end && iso > awayCal.start) awayCal.end = iso;
else { awayCal.start = iso; awayCal.end = null; }
$('awayMsg').textContent = '';
drawAway();
});
$('awayMode').addEventListener('click', e => {
const mode = e.target.closest('[data-mode]')?.dataset.mode;
if (!mode) return;
awayCal.mode = mode;
drawAwayEditor();
if (mode === 'from' || mode === 'until') $('awayClock').focus();
});
$('awayRepeat').addEventListener('click', e => {
const repeat = e.target.closest('[data-repeat]')?.dataset.repeat;
if (!repeat) return;
awayCal.repeat = repeat;
if (repeat === 'weekly') awayCal.end = null;
drawAway();
});
$('awayPeople').addEventListener('click', e => {
const b = e.target.closest('[data-away]');
if (b) { awayCal.me = null; b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); }
});
$('awaySave').onclick = () => {
const selected = selectedDays();
if (!selected.length) { $('awayMsg').textContent = 'Bitte einen Tag wählen.'; return; }
if (awayCal.repeat === 'weekly' && selected.length !== 1) { $('awayMsg').textContent = 'Für die wöchentliche Wiederholung nur einen Tag auswählen.'; return; }
const days = awayCal.repeat === 'weekly'
  ? Array.from({ length: AWAY_REPEAT_WEEKS }, (_, i) => addDay(selected[0], 7 * i))
  : selected;
const chips = [...$('awayPeople').querySelectorAll('[data-away]')];
const on = chips.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.away);
const off = chips.filter(b => b.getAttribute('aria-pressed') === 'false').map(b => b.dataset.away);
if (awayCal.repeat === 'weekly' && !on.length) { $('awayMsg').textContent = 'Für die Wiederholung mindestens eine Person auswählen.'; return; }
let next;
if (awayCal.mode === 'day') {
next = absent.flatMap(x => {
if (!days.includes(x.day)) return [x];
// a whole day for someone replaces their "ab"/"bis" there; other people's times stay
const timed = x.from || x.until || x.maybe;
const people = (x.people || []).filter(p => !on.includes(p) && (timed || awayCal.repeat === 'weekly' || !off.includes(p)));
return people.length ? [{ ...x, people }] : [];
}).concat(on.length ? days.map(day => ({ day, people: on })) : []);
} else {
const time = awayCal.mode === 'maybe' ? true : clockOf($('awayClock').value);
if (!time) { $('awayMsg').textContent = 'Uhrzeit wie 21:00.'; return; }
if (!on.length) { $('awayMsg').textContent = 'Wer? Mindestens eine Person auswählen.'; return; }
// one entry per person and day: a time replaces their whole day or their other time
next = absent.flatMap(x => {
if (!days.includes(x.day)) return [x];
const people = (x.people || []).filter(p => !on.includes(p));
return people.length ? [{ ...x, people }] : [];
}).concat(days.map(day => ({ day, people: on, [awayCal.mode]: time })));
}
next = next.sort((a, b) => a.day.localeCompare(b.day));
const label = (awayCal.mode === 'day' ? (on.length ? `Abwesend: ${on.join(', ')}.` : 'Gespeichert.') : awayCal.mode === 'maybe' ? `${on.join(', ')}: spontan da.` : `${on.join(', ')} ${awayCal.mode === 'from' ? 'ab' : 'bis'} ${clockOf($('awayClock').value)}.`)
  + (awayCal.repeat === 'weekly' ? ` Jede Woche bis ${shortDate(days.at(-1))} (${AWAY_REPEAT_WEEKS} Termine).` : '');
storeAway(next, days, label);
};
$('awayList').addEventListener('click', e => {
const edit = e.target.closest('[data-away-edit]')?.dataset.awayEdit;
if (edit) {
  const run = JSON.parse(edit);
  awayCal.month = run.from.slice(0, 7);
  awayCal.start = run.from;
  awayCal.end = run.weekly ? null : run.to !== run.from ? run.to : null;
  awayCal.repeat = run.weekly ? 'weekly' : 'once';
  const existing = absent.find(x => x.day === run.from && (x.people || []).includes(run.p) && awayLabel(x) === run.cond);
  awayCal.mode = existing?.maybe ? 'maybe' : existing?.from ? 'from' : existing?.until ? 'until' : 'day';
  if (existing?.from || existing?.until) $('awayClock').value = existing.from || existing.until;
  $('awayMsg').textContent = 'Eintrag ausgewählt. Änderungen vornehmen und speichern.';
  drawAway();
  for (const b of $('awayPeople').querySelectorAll('[data-away]'))
    b.setAttribute('aria-pressed', String(b.dataset.away === run.p));
  $('awayEditor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return;
}
const raw = e.target.closest('[data-away-remove]')?.dataset.awayRemove;
if (!raw) return;
const run = JSON.parse(raw);
if (run.weekly && !confirm(`Alle ${run.days.length} wöchentlichen Termine für ${run.p} entfernen?`)) return;
const days = Array.isArray(run.days) ? run.days : selectedDays();
const next = absent.flatMap(x => {
if (!days.includes(x.day) || awayLabel(x) !== run.cond) return [x];
const people = (x.people || []).filter(p => p !== run.p);
return people.length ? [{ ...x, people }] : [];
});
storeAway(next, days, `${run.p}: entfernt.`);
});
let dayEdit = null;
// Wochenübersicht: every show one person watches, by weekday and time. Regular slots from the
// Guckplan with permanent moves ("Dauerhaft"); this week's one-off changes don't count.
function overviewShows(person) {
const found = new Map();
for (const sheet of lastWeekRender?.[2]?.values() || []) {
if (!sheet.people.includes(person)) continue;
for (const [show, slot] of picks(sheet, person)) {
const key = norm(show.romaji || show.english);
if (found.has(key)) continue;
const mv = moves.find(m => m.show === key && !m.week);
const tag = mv?.tag || slot.tag || '', time = clockOf(mv?.time || slot.time);
const hm = parseTime(time);
const others = [...new Set([...lastWeekRender[2].values()].flatMap(s => s.people.filter(p => p !== person && [...picks(s, p).keys()].some(x => norm(x.romaji || x.english) === key))))];
found.set(key, { title: show.english || show.romaji, tag, time, day: DAY_TAGS.indexOf(tag), minute: hm ? (hm[0] < 6 ? 24 + hm[0] : hm[0]) * 60 + hm[1] : 9999, others });
}
}
return [...found.values()].sort((a, b) => (a.day < 0 ? 7 : a.day) - (b.day < 0 ? 7 : b.day) || a.minute - b.minute || a.title.localeCompare(b.title));
}
function drawOverview() {
const person = $('overviewPerson').value;
const shows = overviewShows(person);
let day = null;
$('overviewList').innerHTML = shows.map(s => {
const head = s.tag !== day ? `<li class="overview-day">${esc(s.day < 0 ? (s.tag || 'Ohne Tag') : s.tag.slice(0, 2))}</li>` : '';
day = s.tag;
return `${head}<li><span class="overview-time">${esc(s.time || '–')}</span><span class="overview-title">${esc(s.title)}</span>${s.others.length ? `<span class="overview-who" title="${esc('Mit ' + s.others.join(', '))}">${s.others.length === 1 ? esc(s.others[0]) : `+${s.others.length}`}</span>` : '<span class="overview-who">allein</span>'}</li>`;
}).join('') || '<li class="muted">Keine Serien im Guckplan.</li>';
$('overviewCount').textContent = shows.length ? `${shows.length} ${shows.length === 1 ? 'Serie' : 'Serien'} pro Woche.` : '';
}
$('overviewButton').onclick = () => {
const people = allPeople();
const solo = soloPerson || (() => { try { return localStorage.getItem('soloPerson'); } catch { return null; } })() || $('soloPerson')?.value || DEFAULT_PERSON;
const pick = people.includes(solo) ? solo : (people[0] || solo);
$('overviewPerson').innerHTML = people.map(p => `<option${p === pick ? ' selected' : ''}>${esc(p)}</option>`).join('');
$('overviewPerson').value = pick;
drawOverview();
$('overviewDlg').showModal();
};
$('overviewPerson').onchange = drawOverview;
const DAY_TAGS = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];
const clockOf = time => { const hm = parseTime(time); return hm ? `${String(hm[0]).padStart(2, '0')}:${String(hm[1]).padStart(2, '0')}` : ''; };
function weekShows() {
const shows = new Map();
for (const b of document.querySelectorAll('#list .move')) {
const key = norm(b.dataset.moveTitle);
if (!shows.has(key)) shows.set(key, { key, title: b.dataset.moveTitle, name: b.dataset.moveName,
tag: b.dataset.tag, time: clockOf(b.dataset.time), fromTag: b.dataset.fromTag, fromTime: clockOf(b.dataset.fromTime), skip: !!b.dataset.skip, keepTime: !!b.dataset.keepTime });
}
return [...shows.values()];
}
const setDayScope = scope => {
dayEdit.scope = scope;
$('dayWeek').setAttribute('aria-pressed', scope === 'week');
$('dayAlways').setAttribute('aria-pressed', scope === 'always');
};
$('dayWeek').onclick = () => setDayScope('week');
$('dayAlways').onclick = () => setDayScope('always');
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-day-edit]');
if (!b || !movesKey) return;
const section = b.closest('.day');
const all = weekShows();
const keys = new Set([...section.querySelectorAll('.move:not([data-extra])')].map(m => norm(m.dataset.moveTitle)));
const order = s => { const hm = parseTime(s.time); return hm ? (hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0]) * 60 + hm[1] : Infinity; };
const shows = all.filter(s => keys.has(s.key)).sort((a, b) => order(a) - order(b));
dayEdit = { tag: section.dataset.moveDay, label: section.querySelector('h2 > span').textContent.trim(), all, shows, scope: 'week', missing: [] };
$('dayName').textContent = dayEdit.label;
$('dayText').value = shows.map(s => `${s.time ? s.time + ' ' : ''}${s.name}${s.skip ? ' ' + skipMark(s.keepTime) : ''}`).join('\n') + '\n';
$('dayMissing').hidden = true; $('dayMissing').innerHTML = '';
$('dayMsg').textContent = '';
closeSuggest();
setDayScope(editScope);
$('dayDlg').showModal();
$('dayKeepTime').checked = false;
const t = $('dayText'); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
});
const skipMark = keepTime => keepTime ? '(Skip · Zeiten beibehalten)' : '(Skip)';
const skipSuffix = /\s*\(skip( · zeiten beibehalten)?\)\s*$/i;
const parseLine = line => {
const marker = line.match(skipSuffix);
const m = line.replace(skipSuffix, '').match(/^\s*(\d{1,2}[:.]\d{2})?\s*(.*?)\s*$/);
return { time: m[1] ? clockOf(m[1]) : '', text: m[2], skip: !!marker, keepTime: !!marker?.[1] };
};
function toggleDaySkip(keepTime) {
const t = $('dayText'), { index, lines } = currentLine();
const line = lines[index] || '';
if (!parseLine(line).text) { $('dayMsg').textContent = 'Erst in die Zeile der Serie klicken.'; t.focus(); return; }
const parsed = parseLine(line);
const unmarked = line.replace(skipSuffix, '');
lines[index] = parsed.skip && parsed.keepTime === keepTime ? unmarked : `${unmarked.trimEnd()} ${skipMark(keepTime)}`;
t.value = lines.join('\n');
const end = lines.slice(0, index + 1).join('\n').length;
t.focus(); t.setSelectionRange(end, end);
$('dayMsg').textContent = '';
};
$('daySkip').onclick = () => toggleDaySkip($('dayKeepTime').checked);
function findShow(text) {
const q = norm(text);
if (!q) return { none: true };
const names = s => [s.name, s.title].map(norm);
const exact = dayEdit.all.filter(s => names(s).includes(q));
if (exact.length) return { show: exact[0] };
const part = dayEdit.all.filter(s => names(s).some(n => n.includes(q)));
return part.length === 1 ? { show: part[0] } : part.length ? { many: true } : { none: true };
}
let suggest = { items: [], active: 0, line: -1 };
function closeSuggest() { suggest = { items: [], active: 0, line: -1 }; $('daySuggest').hidden = true; }
function currentLine() {
const t = $('dayText'), before = t.value.slice(0, t.selectionStart);
return { index: before.split('\n').length - 1, lines: t.value.split('\n') };
}
function updateSuggest() {
const { index, lines } = currentLine();
const { text } = parseLine(lines[index] || '');
const q = norm(text);
const items = q.length < 2 ? [] : dayEdit.all.filter(s => [s.name, s.title].some(n => norm(n).includes(q)) && norm(s.name) !== q).slice(0, 6);
if (!items.length) return closeSuggest();
suggest = { items, active: 0, line: index };
$('daySuggest').innerHTML = items.map((s, i) => `<button type="button" role="option" data-pick="${i}" aria-selected="${i === 0}">${esc(s.name)}<span>${esc(slotLabel(s))}</span></button>`).join('');
$('daySuggest').hidden = false;
}
function pickSuggest(i) {
const s = suggest.items[i];
if (!s) return;
const t = $('dayText'), lines = t.value.split('\n');
const { time, skip, keepTime } = parseLine(lines[suggest.line]);
lines[suggest.line] = `${time ? time + ' ' : ''}${s.name}${skip ? ' ' + skipMark(keepTime) : ''}`;
t.value = lines.join('\n');
const end = lines.slice(0, suggest.line + 1).join('\n').length;
t.focus(); t.setSelectionRange(end, end);
closeSuggest();
}
$('dayText').addEventListener('input', updateSuggest);
$('dayText').addEventListener('click', updateSuggest);
$('dayText').addEventListener('keydown', e => {
if ($('daySuggest').hidden) return;
if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
e.preventDefault();
suggest.active = (suggest.active + (e.key === 'ArrowDown' ? 1 : suggest.items.length - 1)) % suggest.items.length;
$('daySuggest').querySelectorAll('[data-pick]').forEach((b, i) => b.setAttribute('aria-selected', i === suggest.active));
} else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSuggest(suggest.active); }
else if (e.key === 'Escape') { e.preventDefault(); closeSuggest(); }
});
$('daySuggest').addEventListener('mousedown', e => e.preventDefault());
$('daySuggest').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) pickSuggest(Number(b.dataset.pick)); });
function moveTo(next, s, tag, time) {
const week = dayEdit.scope === 'week' ? isoDay(weekStart(weekOffset)) : '';
if (tag === s.tag && time === s.time) return next;
const home = tag === s.fromTag && time === s.fromTime;
const was = week ? moves.find(m => m.show === s.key && m.week === week) : null;
const double = !!(was?.double || was?.long);
next = next.filter(m => !(m.show === s.key && (m.week === week || (!week && m.week === isoDay(weekStart(weekOffset))))));
if (home && !double && (!week || !next.some(m => m.show === s.key && !m.week))) return next;
return next.concat({ show: s.key, title: s.title, tag, time, week, ...(was?.double && { double: true }), ...(was?.long && { long: true }) });
}
$('daySave').onclick = () => {
const placed = new Map(), problems = [];
$('dayText').value.split('\n').forEach((line, i) => {
const { time, text, skip, keepTime } = parseLine(line);
if (!text) return;
const found = findShow(text);
if (!found.show) problems.push(`Zeile ${i + 1}: „${text}“ ${found.many ? 'passt zu mehreren Serien' : 'ist keine Serie dieser Woche'}`);
else placed.set(found.show.key, { show: found.show, time, skip, keepTime });
});
if (problems.length) { $('dayMsg').textContent = problems.join('. ') + '.'; return; }
const missing = dayEdit.shows.filter(s => !placed.has(s.key));
const asked = new Set(dayEdit.missing.map(s => s.key));
if (missing.some(s => !asked.has(s.key)) || missing.length !== asked.size) {
dayEdit.missing = missing;
$('dayMissing').innerHTML = missing.length ? `<div class="muted" title="Nicht mehr in der Liste">Wohin?</div>${missing.map(s => `
      <div class="dlg-row day-missing" data-key="${esc(s.key)}"><span>${esc(s.name)}</span>
        <select aria-label="Tag">${DAY_TAGS.map(t => `<option value="${t}"${t === dayEdit.tag ? ' selected' : ''}>${t.slice(0, 2)}</option>`).join('')}</select>
        <input value="${esc(s.time)}" placeholder="Uhrzeit" inputmode="numeric" maxlength="5" aria-label="Uhrzeit"></div>`).join('')}` : '';
$('dayMissing').hidden = !missing.length;
if (missing.length) { $('dayMsg').textContent = ''; $('dayMissing').querySelector('select').focus(); return; }
}
let next = moves;
const thisWeek = isoDay(weekStart(weekOffset));
for (const { show, time, skip, keepTime } of placed.values()) {
if (skip) {
if (!show.skip || keepTime !== show.keepTime || time !== show.time || dayEdit.tag !== show.tag) {
next = next.filter(m => !(m.show === show.key && m.week === thisWeek)).concat({
show: show.key, title: show.title, tag: dayEdit.tag, time, week: thisWeek, skip: true, ...(keepTime && { keepTime: true }),
});
}
continue;
}
if (show.skip) next = next.filter(m => !(m.show === show.key && m.week === thisWeek && m.skip));
next = moveTo(next, show.skip ? { ...show, tag: null, skip: false } : show, dayEdit.tag, time);
}
for (const row of $('dayMissing').querySelectorAll('.day-missing')) {
const s = dayEdit.all.find(x => x.key === row.dataset.key);
const time = row.querySelector('input').value.trim();
if (time && !parseTime(time)) { $('dayMsg').textContent = `${s.name}: Uhrzeit wie 21:00, oder leer.`; return; }
next = moveTo(next, s, row.querySelector('select').value, clockOf(time));
}
if (next === moves) { $('dayDlg').close(); return; }
storeMoves(next, `${dayEdit.label} gespeichert${dayEdit.scope === 'week' ? ' (diese Woche)' : ''}.`, 'dayDlg', 'dayMsg');
};
async function firstTabs() {
try {
if (localStorage.getItem('tabs')) return;
const res = await fetch('tabs.json', { signal: AbortSignal.timeout(1500) });
const list = res.ok ? await res.json() : null;
if (Array.isArray(list) && list.length && list.every(t => t && /^\d+$/.test(t.gid) && typeof t.name === 'string' && Number.isFinite(t.start)))
localStorage.setItem('tabs', JSON.stringify(list));
} catch {}
}
const streamsReady = fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json())
.then(json => { streamsDe = json; }, e => {
console.warn('streams-de.json not loaded:', e);
setNote('streams', `${unreachable('Die Seite')}: die Stream-Daten wurden nicht geladen, daher kommen die Links von AniList, und Pausen und Rewatches fehlen.`);
});
const tabsReady = firstTabs().then(() => savedOrFresh('tabs', guckplanTabs, list => { tabs = list; load(true); }))
.then(list => { tabs = list; }, e => {
console.warn('Sheet tabs not loaded:', e);
setNote('tabs', `${unreachable('Google Sheets')}: die Liste der Guckplan-Tabs ist unbekannt, daher wird „${FALLBACK_TAB.name}“ angezeigt.`);
});
const ready = Promise.all([
tabsReady,
streamsReady,
loadFallbackLinks().then(() => { if (lastWeekRender && view === 'week') redraw(); }),
loadMoves().then(() => {
movesSeen = movesStamp();
if (lastWeekRender && view === 'week') redraw();
}),
]);
accountLoading = !!auth || !!malLoginCode;
const accountLoad = (async () => {
if (malLoginCode) {
const account = await MAL.exchange(malLoginCode);
accounts = accounts.filter(a => a.provider !== 'mal' || a.name !== account.name);
accounts.push(account); auth = account; saveAccounts(); updateConnect();
}
await loadMe();
})().catch(e => { console.warn('List account not loaded:', e); if (malLoginCode) notice(e.message); })
.finally(() => { accountLoading = false; syncSavingButtons(); });
ready.then(() => accountLoad.then(() => load(true)));
updateConnect();
load();
let updateWaiting = false;
let reloadPage = () => location.reload();
const inTheMiddleOfSomething = () => !!document.querySelector('dialog[open]') || searching() || selecting || bulkSaving || pendingChanges.size > 0 || $('moveButtons').checked || (!$('notice').hidden && !$('noticeUndo').hidden);
function reloadWhenAway() {
if (!updateWaiting || document.visibilityState !== 'hidden' || inTheMiddleOfSomething()) return;
try { sessionStorage.setItem('resumePlace', JSON.stringify({ weekOffset, range, pickedDay, y: scrollY })); } catch {}
reloadPage();
}
document.addEventListener('visibilitychange', reloadWhenAway);
if ('serviceWorker' in navigator) {
const hadWorker = !!navigator.serviceWorker.controller;
navigator.serviceWorker.register('sw.js').then(reg => {
let lastUpdateCheck = Date.now();
document.addEventListener('visibilitychange', () => {
if (document.visibilityState !== 'visible' || Date.now() - lastUpdateCheck < 60000) return;
lastUpdateCheck = Date.now();
reg.update().catch(() => {});
});
}).catch(e => console.warn('No offline copy:', e));
navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) { updateWaiting = true; $('update').hidden = false; reloadWhenAway(); } });
}
$('updateReload').onclick = () => {
try { sessionStorage.setItem('resumePlace', JSON.stringify({ weekOffset, range, pickedDay, y: scrollY })); } catch {}
reloadPage();
};
const PATCH_NOTES = [
{ id: '2026-11-10', title: 'Long episodes, clearer days and a tidier editor', items: [
'Long episodes: „Lang“ in the move dialog gives an episode two slots, and later shows move back 30 minutes. LiveChart notes such as „Double-length premiere“ are picked up automatically. A „Lang“ tag marks the episode, and pushed times are coloured.',
'„Doppelt“ now also takes two slots, survives dragging and the day editor, and shows as „(x2)“ in the Discord message.',
'Absences: on a show that still runs, the names of absent watchers are struck through. „ab“/„bis“ absences are checked at the time a show is really watched, after delays and long episodes.',
'Recap weeks are named „Recap“ in the Discord message; a plain break stays „Pause“.',
'„Pause überspringen“ is now a small icon on the day heading, next to delay and absence.',
'The move dialog is grouped into where, how and actions. „Edit“ moved to the top row, so the header stays at two lines.',
'The daily Discord post is started by the Cloudflare helper at 08:50 and posted at 09:00, since GitHub\'s own timer proved unreliable.',
'Help: new sections on the day icons, absences, pauses and long episodes.',
'Pause rows share one „Pause“ label, with the reason (Recap, Skip, Abwesend) as a tag next to the show. The day\'s edit button is a pencil icon.',
] },
{ id: '2026-11-09', title: 'Calendar, Discord and a cleaner schedule', items: [
'New absence calendar: mark one day or a date range, including absences starting or ending at a particular time. A legend, clearer selection and a Today shortcut make it easier to use.',
'Weekly absences: repeat a selected day for 12 weeks, see recurring dates grouped in the list and remove the series together.',
'The watch plan and Discord messages take absences into account. If too few people are available, affected shows are skipped and later watch slots can move up.',
'Broadcast breaks and recap episodes now appear as pauses. A day-specific option automatically moves later shows into free slots while respecting fixed times.',
'Daily Discord schedule posts at 09:00 German time can ping the weekday role, use custom anime nicknames and show which titles dropped out of today’s plan.',
'Nickname editing is available both in the Discord day view and in Settings: filter by weekday (including shows on break), search titles or show every anime in the season. Suggested names are only saved when confirmed.',
'Discord messages now follow the group’s layout, with tidier formatting, short reasons and emote support.',
'Settings, schedule controls, dialogs and the Watch Planner received a more consistent pill design, spacing and mobile styling.',
] },
{ id: '2026-11-08', title: 'Skips, absences and catching up', items: [
'A show can be skipped for a week. When the slot becomes empty, later shows move up unless you select „Beim Skip Zeiten beibehalten“.',
'Away for a day? It can be marked now. Shows left with just one watcher are skipped (MaRyo counts as two), and the evening moves up.',
'Double episodes: last week\'s episode can come along in this week\'s slot.',
'Catch-up shows can be put into the plan. They show up as "Nachholen" on their day.',
'Two shows sharing a slot can be moved or skipped together.',
'Shows dragged to a new place land in 30-minute steps.',
'Edit windows are tidier: "Once" is for this week only, "Permanent" for every week from now on.',
] },
];
const NOTES_KEY = 'notesSeen';
function showNotes(list) {
$('notesList').innerHTML = list.map(n => `<section class="notes-entry"><h3>${esc(n.title)}<span>${esc(new Date(n.id + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></h3>
    <ul>${n.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('');
$('notesDlg').showModal();
$('notesDlg').scrollTop = 0;
}
function newNotes() {
const newest = PATCH_NOTES[0]?.id;
if (!newest) return;
let seen = null;
try { seen = localStorage.getItem(NOTES_KEY); localStorage.setItem(NOTES_KEY, newest); } catch { return; }
if (!seen && !returningVisitor) return;
const fresh = PATCH_NOTES.filter(n => !seen || n.id > seen);
if (fresh.length && !document.querySelector('dialog[open]')) showNotes(fresh);
}
$('notesButton').onclick = () => {
showSettings(false);
showNotes(PATCH_NOTES);
};
setTimeout(newNotes, 1200);
config().then(c => {
const url = typeof c.feedbackUrl === 'string' && /^https:\/\/(discord\.com|discord\.gg|ptb\.discord\.com|canary\.discord\.com)\//.test(c.feedbackUrl) ? c.feedbackUrl : '';
$('feedbackLink').hidden = !url;
if (url) $('feedbackLink').href = url;
});
function setMode(next) {
mode = next;
document.body.classList.toggle('solo', mode === 'solo');
document.body.classList.toggle('group', mode === 'group');
$('modeSolo').setAttribute('aria-pressed', mode === 'solo');
$('modeGroup').setAttribute('aria-pressed', mode === 'group');
try { localStorage.setItem('mode', mode); } catch {}
}
setMode(mode);
function listView() { return view === 'catchup' || view === 'pace'; }
let jumpSearch = '';
function setView(next) {
if (next === 'week' && jumpSearch) {
if ($('search').value === jumpSearch) { $('search').value = ''; openSearch(false); searchedWeek = false; }
jumpSearch = '';
}
view = next;
document.body.classList.toggle('catchup', listView());
document.body.classList.toggle('pace', view === 'pace');
$('viewWeek').setAttribute('aria-pressed', view === 'week');
$('viewCatchup').setAttribute('aria-pressed', view === 'catchup');
$('viewPace').setAttribute('aria-pressed', view === 'pace');
try { localStorage.setItem('view', view); } catch {}
}
setView(view);
$('viewWeek').onclick = () => { setView('week'); enter = { y: 4 }; load(); };
$('viewCatchup').onclick = () => { setView('catchup'); enter = { y: 4 }; load(); };
$('viewPace').onclick = () => { setView('pace'); enter = { y: 4 }; load(); };
let singleEpisodes = false;
try { singleEpisodes = localStorage.getItem('singleEpisodes') === '1'; } catch {}
function setSingleEpisodes(on) {
singleEpisodes = on;
$('perShow').setAttribute('aria-pressed', String(!on));
$('perEpisode').setAttribute('aria-pressed', String(on));
try { localStorage.setItem('singleEpisodes', on ? '1' : '0'); } catch {}
}
setSingleEpisodes(singleEpisodes);
$('perShow').onclick = () => { setSingleEpisodes(false); load(true); };
$('perEpisode').onclick = () => { setSingleEpisodes(true); load(true); };
$('anilistUser').onchange = () => {
friendList.value = '';
try { localStorage.setItem('anilistUser', $('anilistUser').value.trim()); } catch {}
load();
};
friendList.onchange = () => {
selecting = false;
catchupTargets = [];
$('markAllStart').hidden = true;
$('list').innerHTML = '';
load();
};
$('list').addEventListener('click', event => {
if (!event.target.closest('[data-own-list]')) return;
friendList.value = '';
friendList.onchange();
friendList.focus();
});
$('modeSolo').onclick = () => { setMode('solo'); redraw(); };
$('modeGroup').onclick = () => { setMode('group'); redraw(); };
function updateGroupButton() {
const names = [...selectedPeople];
$('groupButton').textContent = !names.length ? 'Leute wählen'
: names.length <= 2 ? names.join(', ')
: `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
updateGroupButton();
function showPeople(open) {
showMenu('people', 'groupButton', open);
}
$('groupButton').onclick = () => showPeople($('people').hidden);
document.addEventListener('click', e => { if (!e.target.closest('.picker')) showPeople(false); });
document.addEventListener('keydown', e => {
if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
for (const [menu, button] of [['miscMenu', 'miscButton'], ['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
if ($(menu).hidden) continue;
e.preventDefault();
    showMenu(menu, button, false);
$(button).focus();
break;
}
});
$('soloPerson').onchange = () => {
soloPerson = $('soloPerson').value;
colorSolo();
try { localStorage.setItem('soloPerson', soloPerson); } catch {}
redraw();
};
function colorSolo() {
const select = $('soloPerson');
select.style.cssText = personStyle(select.value);
for (const o of select.options) o.style.cssText = personStyle(o.value)
.replace('--person:', 'background-color:').replace(';--person-text:', ';color:');
applyAccent();
}
function fillPeople(people) {
const select = $('soloPerson');
if ([...select.options].map(o => o.value).join() !== people.join()) {
select.replaceChildren(...people.map(p => new Option(p, p)));
if (!people.includes(soloPerson) && people.length) soloPerson = people.includes(DEFAULT_PERSON) ? DEFAULT_PERSON : people[0];
select.value = soloPerson;
}
colorSolo();
const box = $('people');
const chips = () => [...box.querySelectorAll('[data-name]')];
if (chips().map(b => b.dataset.name).join() === people.join()) {
for (const b of chips()) b.style.cssText = personStyle(b.dataset.name);
return;
}
const all = document.createElement('button');
all.className = 'chip';
all.textContent = 'Alle';
all.setAttribute('aria-label', 'Alle Personen auswählen');
const saveSelection = () => {
for (const b of chips()) b.setAttribute('aria-pressed', selectedPeople.has(b.dataset.name));
all.setAttribute('aria-pressed', people.every(name => selectedPeople.has(name)));
try { localStorage.setItem('people', JSON.stringify([...selectedPeople])); } catch {}
updateGroupButton();
redraw();
};
all.setAttribute('aria-pressed', people.every(name => selectedPeople.has(name)));
all.onclick = () => {
selectedPeople.clear();
for (const name of people) selectedPeople.add(name);
saveSelection();
};
box.replaceChildren(all, ...people.map(name => {
const b = document.createElement('button');
b.className = 'chip';
b.dataset.name = name;
b.textContent = name;
b.style.cssText = personStyle(name);
b.setAttribute('aria-pressed', selectedPeople.has(name));
b.onclick = () => {
selectedPeople.has(name) ? selectedPeople.delete(name) : selectedPeople.add(name);
saveSelection();
};
return b;
}));
}
let helpReturnFocus = null;
function openHelp(atShortcuts = false) {
helpReturnFocus = atShortcuts ? document.activeElement : $('settingsButton');
showSettings(false);
showMenu('accountMenu', 'accountButton', false);
showPeople(false);
$('helpDialog').showModal();
$('helpDialog').scrollTop = 0;
if (atShortcuts) $('helpKeys').scrollIntoView?.({ block: 'start' });
}
$('helpButton').onclick = () => openHelp();
$('helpClose').onclick = () => $('helpDialog').close();
const helpTopics = [...$('helpDialog').querySelectorAll('[data-help-topic]')];
let helpStep = -1;
function showHelpStep(index) {
helpStep = index;
const section = index < 0 ? null : $(helpTopics[index].dataset.helpTopic);
for (const item of $('helpDialog').querySelectorAll('.help-sections > section')) item.hidden = !!section && item !== section;
$('helpSteps').hidden = !section;
for (const [i, topic] of helpTopics.entries()) topic.setAttribute('aria-pressed', String(i === index));
if (!section) return;
$('helpPrevious').disabled = index === 0;
$('helpNext').textContent = index === helpTopics.length - 1 ? 'Fertig' : 'Weiter';
$('helpProgress').textContent = `${index + 1} / ${helpTopics.length}`;
section.focus();
}
$('helpDialog').addEventListener('click', event => {
const topic = event.target.closest('[data-help-topic]');
if (topic) showHelpStep(helpTopics.indexOf(topic));
});
$('helpOverview').onclick = () => {
const previous = helpTopics[helpStep];
showHelpStep(-1);
previous?.focus();
};
$('helpPrevious').onclick = () => showHelpStep(helpStep - 1);
$('helpNext').onclick = () => {
if (helpStep === helpTopics.length - 1) $('helpOverview').click();
else showHelpStep(helpStep + 1);
};
$('helpDialog').addEventListener('close', () => {
showHelpStep(-1);
helpReturnFocus?.focus({ preventScroll: true });
});
for (const [id, key, hint] of [
['prev', 'ArrowLeft', 'Vorherige Woche (←)'], ['next', 'ArrowRight', 'Nächste Woche (→)'],
['viewWeek', '1', 'Zeitplan (1)'], ['viewCatchup', '2', 'Catch-up (2)'], ['viewPace', '3', 'Non-seasonal (3)'],
['modeSolo', 'G', 'Solo (G)'], ['modeGroup', 'G', 'Gruppe (G)'],
['searchButton', '/', 'Serien suchen (/)'], ['helpButton', 'Shift+/', 'Hilfe (?)'],
]) {
$(id).setAttribute('aria-keyshortcuts', key);
$(id).title = hint;
}
function keyRows() {
return [...document.querySelectorAll('#list .row:not(.pause):not(.show-head)')].filter(r => !r.closest('.hidden-by-search, details:not([open])'));
}
function selectRow(row) {
row.tabIndex = -1;
row.classList.add('selected-row');
row.onblur = () => {
if (document.activeElement === row) return;
row.onblur = null;
row.removeAttribute('tabindex');
row.classList.remove('selected-row');
};
row.focus({ preventScroll: true });
}
function stepRow(by) {
const rows = keyRows();
const at = rows.indexOf(document.activeElement?.closest?.('#list .row'));
const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
const row = at < 0 ? rows.find(r => r.getBoundingClientRect().top >= headerBottom) || rows[0]
: rows[Math.min(rows.length - 1, Math.max(0, at + by))];
if (!row) return;
selectRow(row);
const box = row.getBoundingClientRect();
const clear = headerBottom + (row.closest('.day')?.querySelector('h2')?.offsetHeight || 0) + 8;
if (box.top < clear) scrollTo(0, scrollY + box.top - clear);
else if (box.bottom > innerHeight - 8) scrollTo(0, scrollY + box.bottom - innerHeight + 8);
}
let openedShow = null;
function restoreOpenedShow() {
const opened = openedShow;
openedShow = null;
if (!opened || opened.view !== view || Date.now() - opened.time > 4 * 3600000 || document.querySelector('dialog[open]')) return;
const row = [...document.querySelectorAll('#list .row')].find(r => r.closest('[data-search]')?.dataset.search === opened.key &&
!r.closest('.hidden-by-search, details:not([open])'));
if (!row) return;
row.classList.add('stream-return');
setTimeout(() => row.classList.remove('stream-return'), 3500);
const bounds = row.getBoundingClientRect();
if (bounds.bottom <= document.querySelector('header').getBoundingClientRect().bottom || bounds.top >= innerHeight)
row.scrollIntoView?.({ block: 'center' });
}
try { $('markOnOpen').checked = localStorage.getItem('markOnOpen') === '1'; } catch {}
$('markOnOpen').onchange = () => { try { localStorage.setItem('markOnOpen', $('markOnOpen').checked ? '1' : '0'); } catch {} };
document.addEventListener('click', event => {
const row = event.target.closest?.('#list .row .links a')?.closest('.row');
if (!row) return;
const key = row.closest('[data-search]')?.dataset.search;
if (key) openedShow = { key, view, time: Date.now() };
if (!keyRows().includes(row)) return;
selectRow(row);
if ($('markOnOpen').checked && !(Number(row.dataset.at) > Date.now())) row.querySelector('.watch:not(.done):not(:disabled):not([data-select])')?.click();
});
document.addEventListener('keydown', event => {
if (event.defaultPrevented || (event.repeat && !/^[jk]$/i.test(event.key)) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
if (document.body.classList.contains('dnd-moving') || document.querySelector('dialog[open], .popover:not([hidden])')) return;
const key = event.key.toLowerCase();
if (event.shiftKey && key !== '?') return;
let action;
const selected = event.target.matches?.('#list .row') ? event.target : null;
const oneDay = (range === 'day' || range === 'today') && !searching();
if (key === 'arrowleft' && view === 'week') action = () => oneDay ? stepDay(-1) : $('prev').click();
else if (key === 'arrowright' && view === 'week') action = () => oneDay ? stepDay(1) : $('next').click();
else if (key === 'g' && view === 'week') action = () => $(mode === 'solo' ? 'modeGroup' : 'modeSolo').click();
else if (key === 'j') action = () => stepRow(1);
else if (key === 'k') action = () => stepRow(-1);
else if (key === 'escape' && selected) action = () => selected.blur();
else if (key === 'enter' && selected) {
const link = selected.querySelector('.links a') || selected.closest('.catchup-show')?.querySelector('.links a');
if (link) action = () => link.click();
} else if (key === 'w' && selected) {
const tick = selected.querySelector('.watch:not(.done):not(:disabled):not([data-select])');
if (tick) action = () => tick.click();
}
else if (key === '/') action = () => openSearch(true);
else if (key === '?') action = () => openHelp(true);
else if (key === 't') action = () => { setView('week'); weekOffset = 0; setRange('today'); load(); };
else if (key === 'v' && (movesKey || delaysUrl)) action = async () => {
const todayButton = () => document.querySelector('#list .day.is-today [data-day-delay]');
if (!todayButton()) { setView('week'); weekOffset = 0; await load(); }
todayButton()?.click();
};
else if (['1', '2', '3'].includes(key)) action = () => $({ 1: 'viewWeek', 2: 'viewCatchup', 3: 'viewPace' }[key]).click();
if (!action) return;
event.preventDefault();
action();
});
function storeSyncPairs() {
try { localStorage.setItem('listSyncPairs', JSON.stringify(syncPairs)); } catch { notice('Die Abgleich-Einstellung konnte in diesem Browser nicht gespeichert werden.'); }
updateSyncControls();
}
$('syncTarget').onchange = () => {
if (!auth || pendingChanges.size || bulkSaving || undoing) { updateSyncControls(); return; }
const key = accountKey(auth), old = syncPairs[key];
if (old?.target && syncPairs[old.target]?.target === key) syncPairs[old.target].enabled = false;
syncPairs[key] = { target:$('syncTarget').value, enabled:false };
storeSyncPairs();
};
$('syncBoth').onchange = () => {
if (!auth || pendingChanges.size || bulkSaving || undoing) { updateSyncControls(); return; }
const key = accountKey(auth), target = $('syncTarget').value;
const partner = accounts.find(a => accountKey(a) === target && (a.provider || 'anilist') !== (auth.provider || 'anilist'));
if (!partner) { updateSyncControls(); return; }
const enabled = $('syncBoth').checked;
for (const [id, pair] of Object.entries(syncPairs)) if ([key,target].includes(id) || [key,target].includes(pair.target)) pair.enabled = false;
syncPairs[key] = {target,enabled}; syncPairs[target] = {target:key,enabled};
storeSyncPairs();
notice(enabled ? `Änderungen von hier aktualisieren auch ${partner.name}. Bestehende Listeneinträge wurden nicht geändert.` : 'Listen-Abgleich ist aus.');
};
const updateWrappedBanner = () => { $('seasonWrapped').hidden = !isSeasonFinalWeek(); };
updateWrappedBanner();
setInterval(updateWrappedBanner,60000);
document.addEventListener('visibilitychange',updateWrappedBanner);


$('list').addEventListener('click', e => { if (e.target.closest('[data-pick-people]')) { e.stopPropagation(); showPeople(true); $('groupButton').focus({ preventScroll: true }); } });

$('list').addEventListener('click', e => { if (e.target.closest('[data-back-to-week]')) $('viewWeek').click(); });
