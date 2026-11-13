// Main page, part 1 of 10 (index.html loads app.js, then app-*.js in order; they share one global scope):
// state, accounts and list sync settings, loading the week (AniList, LiveChart, covers), streaming links,
// search, watch times and delays, and drawing the schedule (render).
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
// The Guckplan person of the connected account, from the "Wer ist wer" list (wrapped-profiles.json, as in
// Wrapped and the friend lists); RyoTsushigawa is MaRyo. null when the account isn't listed there.
let profileList = {};
function accountPerson() {
if (!auth?.name) return null;
const provider = auth.provider === 'mal' ? 'mal' : 'anilist', name = auth.name.toLowerCase();
for (const [person, list] of Object.entries(profileList))
if ((Array.isArray(list) ? list : []).some(a => (a?.provider || 'anilist') === provider && String(a?.name || '').toLowerCase() === name)) return person;
return name === DEFAULT_ANILIST.toLowerCase() ? DEFAULT_PERSON : null;
}
function ownPerson() {
const listed = accountPerson();
if (listed) return listed;
let person = null;
try { person = localStorage.getItem('ownPerson'); } catch {}
if (person || !auth?.name) return person || soloPerson;
person = auth.name.toLowerCase() === DEFAULT_ANILIST.toLowerCase() ? DEFAULT_PERSON : soloPerson;
try { localStorage.setItem('ownPerson', person); } catch {}
return person;
}
// ✓ and Droppen write to the connected list: only for shows its person watches in the Guckplan, or that are on
// that list already (in the group view or another person's Solo plan you also see shows you don't watch).
// An account not in "Wer ist wer": ✓ only in the Solo view (and for shows on its list).
const ownShow = (id, who) => {
if (!who?.length || myProgress.has(Number(id)) || knownEntries.has(Number(id))) return true;
const person = accountPerson();
return person ? who.includes(person) : mode === 'solo' && who.includes(soloPerson);
};
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
const people = activePeople();
const selected = new Set(people.map(fallbackChoice));
const mixed = selected.size > 1;
for (const b of document.querySelectorAll('[data-fallback-source]')) {
b.setAttribute('aria-pressed', String(!mixed && selected.has(b.dataset.fallbackSource)));
b.disabled = !people.length;
}
const group = document.querySelector('[data-fallback-group]');
if (group) group.dataset.mixed = String(mixed);
const note = document.getElementById('fallbackMixed');
if (note) note.hidden = !mixed;
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
const people = activePeople();
const selected = new Set(people.map(primeChoice));
const mixed = selected.size > 1;
for (const b of document.querySelectorAll('[data-prime-choice]')) {
b.setAttribute('aria-pressed', String(!mixed && selected.has(b.dataset.primeChoice)));
b.disabled = !people.length;
}
const group = document.querySelector('[data-prime-group]');
if (group) group.dataset.mixed = String(mixed);
const note = document.getElementById('primeMixed');
if (note) note.hidden = !mixed;
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
// Fortsetzung angekündigt: for a show whose finale is in the shown week, whether AniList already knows a
// sequel (TV, film, ONA) that hasn't finished yet. Looked up only for those shows, kept for three days.
const sequelOf = new Map(), pendingSequels = new Set();
const SEQUEL_KEEP_MS = 3 * 86400000;
function sequelTag(m, episodes) {
if (!(m?.episodes > 1) || Math.max(...episodes) !== m.episodes) return '';
if (!sequelOf.has(m.id)) {
let saved = null;
try { saved = JSON.parse(localStorage.getItem('sequel:' + m.id)); } catch {}
if (saved && Date.now() - saved.time < SEQUEL_KEEP_MS) sequelOf.set(m.id, saved.sequel);
else { pendingSequels.add(m.id); return ''; }
}
const s = sequelOf.get(m.id);
if (!s) return '';
const when = s.start?.year ? (s.start.month ? new Date(s.start.year, s.start.month - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : String(s.start.year)) : 'noch ohne Termin';
return ` <a class="ep-tag sequel-tag" href="${safeUrl(`https://anilist.co/anime/${s.id}`)}" target="_blank" rel="noopener" title="${esc(`${s.title} · ${when}`)}">${s.format === 'MOVIE' ? 'Film angekündigt' : 'Fortsetzung angekündigt'}</a>`;
}
async function lookUpSequels() {
const ids = [...pendingSequels];
pendingSequels.clear();
let media = [];
try {
for (let i = 0; i < ids.length; i += 25) media.push(...(await anilist(`query ($ids: [Int]) { Page(perPage: 25) { media(id_in: $ids) { id
  relations { edges { relationType(version: 2) node { id type format status title { romaji english } startDate { year month day } } } } } } }`,
{ ids: ids.slice(i, i + 25).map(Number) }, undefined, { retries: 0, timeout: 8000 })).Page.media);
} catch { for (const id of ids) sequelOf.set(id, null); return; }
for (const id of ids) {
const edges = media.find(m => String(m.id) === String(id))?.relations?.edges || [];
const next = edges.map(e => e.relationType === 'SEQUEL' && e.node?.type === 'ANIME' && ['NOT_YET_RELEASED', 'RELEASING'].includes(e.node.status)
  && ['TV', 'TV_SHORT', 'MOVIE', 'ONA'].includes(e.node.format) ? e.node : null).find(Boolean);
const sequel = next ? { id: next.id, format: next.format, title: next.title?.english || next.title?.romaji || '', start: next.startDate } : null;
sequelOf.set(id, sequel);
try { localStorage.setItem('sequel:' + id, JSON.stringify({ time: Date.now(), sequel })); } catch {}
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
// one button: the preferred service first (settings → Bevorzugter Dienst), then the fixed order; the rest behind "+N"
const rank = l => l.label === preferredService() ? -1 : (i => i < 0 ? 99 : i)(SERVICES.findIndex(sv => sv.label === l.label));
const [first, ...rest] = [...shown].sort((a, b) => rank(a) - rank(b));
const more = rest.length ? `<button type="button" class="stream-more" data-stream-more aria-expanded="false" title="Auch bei ${esc(rest.map(l => l.label).join(', '))}">+${rest.length}</button><span class="stream-alternatives" hidden>${rest.map(button).join('')}</span>` : '';
return (first ? button(first) : '') + more + alternatives.map(alternativeButton).join('');
}
const preferredService = () => { try { return localStorage.getItem('servicePriority') || 'Crunchyroll'; } catch { return 'Crunchyroll'; } };
const searchKey = (...titles) => `data-search="${esc(titles.filter(Boolean).map(norm).join(' '))}"`;
function applySearch() {
const q = norm($('search').value);
const items = [...document.querySelectorAll('#list [data-search]')];
for (const el of items) el.classList.toggle('hidden-by-search', !!q && !el.dataset.search.includes(q));
for (const day of document.querySelectorAll('#list .day'))
day.classList.toggle('hidden-by-search', !!q && !day.querySelector('[data-search]:not(.hidden-by-search)'));
for (const box of document.querySelectorAll('#list .shared:not([data-search])'))
box.classList.toggle('hidden-by-search', !!q && !box.querySelector('[data-search]:not(.hidden-by-search)'));
if (q) for (const fold of document.querySelectorAll('#list details.not-listed:not([open]), #list details.catchup-overflow:not([open]), #list details.catchup-season:not([open])'))
if (fold.querySelector('[data-search]:not(.hidden-by-search)')) { fold.open = true; fold.dataset.searchOpened = '1'; }
if (!q) for (const fold of document.querySelectorAll('#list details[data-search-opened="1"]')) {
  fold.open = false;
  delete fold.dataset.searchOpened;
}
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
seasonMatches(q);
}
// Suche über die ganze Season (idea 132): in the Zeitplan, shows of the shown week's Guckplan that match but
// aren't on this week, with their usual day and time and who watches them
function seasonMatches(q) {
$('seasonMatches')?.remove();
if (!q || q.length < 2 || view !== 'week' || !lastWeekRender) return;
const weekKeys = [...document.querySelectorAll('#list [data-search]')].map(el => el.dataset.search);
const found = new Map();
for (const sheet of lastWeekRender[2].values()) {
if (!sheet?.people) continue;
for (const person of sheet.people) for (const [show, slot] of picks(sheet, person)) {
const key = [show.romaji, show.english].filter(Boolean).map(norm).join(' ');
if (!key.includes(q) || weekKeys.some(k => k === key || (norm(show.romaji) && k.includes(norm(show.romaji))))) continue;
const entry = found.get(key) || { show, slot, who: [] };
if (!entry.slot?.tag && slot?.tag) entry.slot = slot;
entry.who.push(person);
found.set(key, entry);
}
}
if (!found.size) return;
const box = document.createElement('section');
box.id = 'seasonMatches';
box.className = 'season-matches';
box.innerHTML = `<h3>Diese Season, nicht in dieser Woche</h3>${[...found.values()].map(({ show, slot, who }) => {
const mv = moveFor(show, lastWeekRender[1]);
const when = [mv?.tag || slot?.tag, mv ? mv.time : slot?.time].filter(Boolean).join(' ') || 'ohne festen Tag';
return `<div class="season-match"><b>${esc(show.english || show.romaji)}</b><span>${esc(when)}</span><span class="who">${[...new Set(who)].map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span></div>`;
}).join('')}`;
$('list').append(box);
}
const searching = () => !!norm($('search').value);
let searchedWeek = false;
function searchChanged() {
if (view === 'week' && range !== 'week' && searching() !== searchedWeek) load(true);
else applySearch();
searchedWeek = searching();
}
$('search').addEventListener('input', searchChanged);
// Recent searches: the last six terms that found something, offered by the browser as suggestions
const RECENT_MAX = 6;
let recentTimer = 0;
const recentSearches = () => { try { const v = JSON.parse(localStorage.getItem('recentSearches') || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, RECENT_MAX) : []; } catch { return []; } };
function drawRecentSearches() { $('recentSearches').replaceChildren(...recentSearches().map(term => Object.assign(document.createElement('option'), { value: term }))); }
function rememberSearch() {
  const term = $('search').value.trim();
  if (term.length < 2 || !document.querySelector('#list [data-search]:not(.hidden-by-search)')) return;
  const next = [term, ...recentSearches().filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem('recentSearches', JSON.stringify(next)); } catch {}
  drawRecentSearches();
}
drawRecentSearches();
$('search').addEventListener('input', () => { clearTimeout(recentTimer); recentTimer = setTimeout(rememberSearch, 1500); });
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(recentTimer); rememberSearch(); } });
$('list').addEventListener('click', e => {
const toggle = e.target.closest('[data-day-more]');
for (const menu of document.querySelectorAll('#list .day-menu:not([hidden])')) if (menu.previousElementSibling !== toggle) { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded', 'false'); }
if (toggle) { const menu = toggle.nextElementSibling; menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)); }
else if (e.target.closest('.day-menu button')) { const menu = e.target.closest('.day-menu'); menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded', 'false'); }
});
document.addEventListener('click', e => { if (!e.target.closest('.day-more')) for (const menu of document.querySelectorAll('#list .day-menu:not([hidden])')) { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
$('list').addEventListener('click', e => {
const more = e.target.closest('[data-stream-more]');
if (!more) return;
const others = more.nextElementSibling;
others.hidden = !others.hidden;
more.setAttribute('aria-expanded', String(!others.hidden));
});
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
function episodeTags(episodes, total, long = false) {
const finale = total > 1 && Math.max(...episodes) === total;
const premiere = total !== 1 && Math.min(...episodes) === 1;
const label = finale ? (long ? 'Extended Finale' : 'Finale')
  : premiere ? (long ? 'Extended Premiere' : 'Premiere')
  : long ? 'Lang' : '';
return label ? `<span class="ep-tag"${long ? ' title="Lange Folge: braucht zwei Slots"' : ''}>${label}</span>` : '';
}
// Airing progress, not the signed-in viewer's watch progress. AniList may not
// provide a final episode count; in that case do not invent a denominator.
function seasonProgress(episodes, total) {
 const current = Math.max(...episodes);
 if (!Number.isSafeInteger(total) || total <= 0 ||
     !Number.isSafeInteger(current) || current <= 0 || current > total) return '';
 const percent = Math.round(current / total * 100);
 return `<div class="season-progress" role="progressbar" aria-label="Staffelverlauf" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${current}" title="Staffelverlauf: Folge ${current} von ${total} (${percent} %)"><span style="width:${percent}%"></span></div>`;
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
if (pendingSequels.size) lookUpSequels().then(() => load(true));
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
const status = streamsDe?.status?.[m.id];
const sameBroadcast = r => r.episode === it.episode && (!r.at || Math.abs(r.at - it.airingAt) < 2 * 86400);
const recap = (status?.recaps || []).find(sameBroadcast);
const broadcastBreak = (status?.broadcastBreaks || []).find(sameBroadcast);
const long = slot.long || (status?.long || []).some(r => r.finale ? it.episode === m.episodes
  : sameBroadcast(r));
if (recap || broadcastBreak) {
  if (!day.rows.some(r => r.show === show))
    day.rows.push({ pause: true, recap: !!recap, show, slot, when, episode, alId: m.id,
      note: { text: recap ? 'Recap episode' : broadcastBreak.text, at: it.airingAt }, news: [] });
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
const fullDays = !everyone && (delays.length || absentDays.length || absentRules.length || moves.some(m => m.skip || m.double || m.long)
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
const maybe = missing.filter(p => absencesForDay(isoDay(day.date)).some(x => x.maybe && x.people?.includes(p)));
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
if (everyone && !shifted && [...absentDays, ...absentRules].some(x => x.from || x.until) && days.some(d => d.rows.some(r => r.plannedAt != null && r.plannedAt !== r.watchAt)))
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
        ${skipped && alId && episode > 0 && ownShow(alId, who) ? `${auth ? dropButton(alId) : ''}${watchButton(alId, episode)}` : checkSpace}${moveButton(show, slot)}
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
          <div class="ep">${extra ? '<span class="catchup-tag">Nachholen</span> ' : ''}${episodes.length > 1 ? `Folgen ${Math.min(...episodes)}–${Math.max(...episodes)}` : `Folge ${episodes[0]}`}${extra ? '' : behindTag(m, Math.min(...episodes))}${episodeTags(episodes, m.episodes, long)}${extra ? '' : sequelTag(m, episodes)}${whoChips(who, away, maybe)}</div>
          ${extra ? '' : seasonProgress(episodes, m.episodes)}
        </div>
        <div class="links">${linkButtons(links, m.id, who)}</div>
        ${ownShow(m.id, who) ? `${auth ? dropButton(m.id) : ''}${watchButton(m.id, Math.max(...episodes))}` : checkSpace}${extra ? (movesKey ? `<button class="move" data-extra="${esc(extra.show)}" title="Nachholen: Tag, Uhrzeit oder Folgen ändern, oder entfernen" aria-label="Nachholen ändern"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '') : moveButton(show, slot)}
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
// (only shows this account's person watches, or that are on its list: see ownShow)
const openToday = !auth || !isToday ? 0 : new Set(ordered.flat(Infinity).filter(r => r?.m?.id && r.episodes?.length && !r.pause && ownShow(r.m.id, r.who) && (myProgress.get(r.m.id) || 0) < Math.max(...r.episodes)).map(r => r.m.id)).size;
const watchedButton = openToday ? `<button type="button" class="pill day-absent-button day-watched" data-day-watched title="Alle ${openToday} heutigen Folgen als gesehen markieren" aria-label="Alle heutigen Folgen gesehen"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M2 13l4 4 9-10M11 16l2 1.5L22 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '';
return `<section class="day${isToday ? ' is-today' : ''}${ordered.length ? '' : ' empty'}" data-date="${isoDay(date)}" data-move-day="${['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'][date.getDay()]}"><h2${isToday ? ' aria-current="date"' : ''}${nearDayName(date) ? ` title="${esc(fullDate)}"` : ''}><span>${heading}</span>${ordered.length ? '' : '<span class="day-none">· keine Folgen</span>'}${awayText(isoDay(date)).length ? `<button type="button" class="away-note" data-day-absent title="Abwesenheiten bearbeiten">· Abwesend: ${esc(awayText(isoDay(date)).join(', '))}</button>` : ''}${pauseShiftButton}${(movesKey || delaysUrl) && ((isToday && ordered.length) || delays.some(x => x.day === isoDay(date))) ? `<button class="pill day-delay${delays.some(x => x.day === isoDay(date)) ? ' on' : ''}" data-day-delay title="Verspätung" aria-label="Verspätung"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : ''}${dayMenu(`${watchedButton}${movesKey && isoDay(date) >= isoDay(new Date()) ? '<button class="pill day-edit day-discord" data-day-discord title="Als Discord-Nachricht" aria-label="Als Discord-Nachricht"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></button><button class="pill day-edit day-pencil" data-day-edit title="Tag bearbeiten" aria-label="Tag bearbeiten"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : ''}${isoDay(date) >= isoDay(new Date()) ? `<button class="pill day-absent-button${awayText(isoDay(date)).length ? ' on' : ''}" data-day-absent title="${awayText(isoDay(date)).length ? esc('Abwesend: ' + awayText(isoDay(date)).join(', ')) : 'Abwesend'}" aria-label="Abwesend"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 21c0-3.9 3.1-7 7-7 1.4 0 2.7.4 3.8 1.1M16 17l5 5M21 17l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : ''}`)}</h2>${body}</section>`;
}).join('');
// A day's less frequent actions (all ✓, Discord, edit, absences) sit behind one "⋯" instead of a row of icons
function dayMenu(items) {
return items ? `<span class="day-more"><button type="button" class="pill day-more-btn" data-day-more aria-haspopup="true" aria-expanded="false" aria-label="Mehr zu diesem Tag" title="Mehr zu diesem Tag">⋯</button><span class="day-menu" hidden>${items}</span></span>` : '';
}
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
    lists { entries { progress status updatedAt media {
      id status episodes duration siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day }
    } } }
  }
}`;
const LIST_CACHE_MS = 10 * 60 * 1000;
const friendList = $('friendList');
const listUser = () => friendList.value || $('anilistUser').value.trim();
// The person selected in Solo is also the default person in Catch-up and Non-seasonal.
const listProfiles = new Map();
let localPlanPeople = [];
