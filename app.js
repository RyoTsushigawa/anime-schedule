
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
// Whose shows are shown, remembered per browser: solo = one person from the dropdown,
// group = everyone toggled on.
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
// Which Guckplan person this browser's logged-in account belongs to, so your drops don't hide shows on
// someone else's plan. Sheet names and account names differ, so it's remembered: the owner's account is
// known, anyone else's is whoever was on screen the first time it mattered.
function ownPerson() {
  let person = null;
  try { person = localStorage.getItem('ownPerson'); } catch {}
  if (person || !auth?.name) return person || soloPerson;
  person = auth.name.toLowerCase() === DEFAULT_ANILIST.toLowerCase() ? DEFAULT_PERSON : soloPerson;
  try { localStorage.setItem('ownPerson', person); } catch {}
  return person;
}
const activePeople = () => mode === 'solo' ? [soloPerson].filter(Boolean) : [...selectedPeople];
// Optional AniList login (implicit grant, client 54702): lets ✓ write watched episodes to the
// viewer's AniList. Several accounts can be kept in one browser (a shared PC), one of them active;
// the tokens only live in this browser's storage.
const ANILIST_CLIENT_ID = 54702;
let accounts = []; // [{ token, expires, name }]
let auth = null;   // the active account
try {
  accounts = JSON.parse(localStorage.getItem('anilistAccounts')) || [];
  const single = JSON.parse(localStorage.getItem('anilistAuth')); // stored before there could be several
  if (single && !accounts.length) accounts = [single];
  localStorage.removeItem('anilistAuth');
} catch {}
try { accounts.push(...(JSON.parse(localStorage.getItem('malAccounts')) || []).filter(a => a.provider === 'mal')); } catch {}
{
  // Back from AniList's login page: the token arrives in the address (#access_token=…).
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('access_token')) {
    auth = { token: params.get('access_token'), expires: Date.now() + Number(params.get('expires_in') || 0) * 1000 };
    accounts.push(auth);
    history.replaceState(null, '', location.pathname + location.search);
    // Logged in for the ranker (its "Connect AniList"): keep the login and go back there
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
const myProgress = new Map(); // media id → episodes watched, for the logged-in viewer
let accountLoading = false;

// Week schedule or Catch-up (from an AniList list), remembered per browser.
const DEFAULT_ANILIST = 'RyoTsushigawa';
let view = 'week';
$('anilistUser').value = DEFAULT_ANILIST;
try {
  view = ['catchup', 'pace'].includes(localStorage.getItem('view')) ? localStorage.getItem('view') : 'week';
  $('anilistUser').value = localStorage.getItem('anilistUser') ?? DEFAULT_ANILIST;
} catch {}
let streamsDe = null; // streams-de.json: { generated, byAnilist: { anilistId: [{ name, url }] } }
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
// Prime shows: each person keeps Prime (the default) or takes the torrent link instead.
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
  } catch {} // A show-specific search remains usable if the index update is unavailable.
}
let tabs = []; // Guckplan tabs, newest first
// Each tab's sheet: { people: [...], shows: [{ romaji, english, wo, tag, time, votes: { name: value } }] }

// AniList / LiveChart site name pattern → button label and colour. `wo` is the sheet's "Wo" code
// ("P" in the sheet means no legal stream, so it has no service here). `main` = a service the group
// has; everything else only shows with the "Other services" toggle.
const SERVICES = [
  { match: /crunchyroll/i, label: 'Crunchyroll', color: '#ff5e00', wo: 'C', main: true, search: 'https://www.crunchyroll.com/search?q=' },
  { match: /netflix/i, label: 'Netflix', color: '#e50914', wo: 'N', main: true, search: 'https://www.netflix.com/search?q=' },
  { match: /amazon|prime video|^prime$/i, label: 'Prime', color: '#0578ff', wo: 'AM', main: true, search: 'https://www.primevideo.com/search/?phrase=' },
  { match: /youtube/i, label: 'YouTube', color: '#ff0000', wo: 'Y', main: true },
  { match: /disney/i, label: 'Disney+', color: 'var(--disney)', wo: 'D+', main: true, search: 'https://www.disneyplus.com/search?q=' },
  { match: /hidive/i, label: 'HIDIVE', color: '#00aeef', wo: 'H' },
  { match: /^adn$|animation digital network/i, label: 'ADN', color: '#0095ff', wo: 'ADN' },
];

// Data that couldn't be loaded fresh (offline, AniList busy, Google or the site not answering):
// source → what's shown instead, listed above the schedule so an old or partial copy never passes
// for the current one, and cleared once that source answers again. Keys with a ':' belong to one
// week or list and only show there; the others always show.
const dataNotes = new Map();
function setNote(source, text) {
  if ((dataNotes.get(source) || null) === (text || null)) return false;
  text ? dataNotes.set(source, text) : dataNotes.delete(source);
  return true;
}
const unreachable = name => navigator.onLine === false ? "Du bist offline" : `${name} antwortet nicht`;
// Days and dates in German, whatever language the browser is set to.
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const dayName = date => DAY_NAMES[date.getDay()];
const shortDayName = date => dayName(date).slice(0, 2);
const germanDate = date => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(date);
const shortDayDate = date => `${shortDayName(date)}, ${germanDate(date)}`;
const savedAt = time => `${shortDayName(new Date(time))} ${new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
function notesHtml(scoped = []) {
  const lines = new Set([...dataNotes].filter(([k]) => !k.includes(':') || scoped.includes(k)).map(([, t]) => t));
  return lines.size ? `<div class="datanote" role="status">${[...lines].map(t => `<div>${esc(t)}</div>`).join('')}</div>` : '';
}
// A load that failed with nothing saved to show instead: the reason and a way to try again
const failed = text => `<div class="status">${esc(text)}<br><button class="pill retry">Nochmal versuchen</button></div>`;

const sheets = new Map();
// A tab's Guckplan: the last copy shown in this browser at once, then the current one when it arrives.
// Comes with `catalog`, the season's full show list, for looking up names people abbreviate.
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
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); // Monday
  return d;
}

// One week of airings. Kept in memory, and in the browser: used as is for 30 minutes so reloads are
// instant, and as a fallback for 7 days when AniList is unreachable or limiting requests.
const WEEK_CACHE_MS = 30 * 60 * 1000;
const WEEK_KEEP_MS = 7 * 86400 * 1000;
const fallbackWeeks = new Set();
// Weeks a show's German release runs behind Japan (YouTube): its episode N comes out in the week
// Japan airs episode N + lag. AniList's and LiveChart's episode numbers are Japan's.
const lagOf = id => streamsDe?.release?.[id]?.lag || 0;

async function liveChartWeek(start) {
  await ready;
  if (!Object.keys(streamsDe?.status || {}).length) return null;
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const items = [];
  for (const [id, status] of Object.entries(streamsDe.status)) {
    if (!/^\d+$/.test(id) || !status.titles?.length) continue;
    const seen = new Set();
    for (const airing of [...status.airings || [], ...status.next ? [status.next] : []]) {
      // LiveChart's times already include the platform offset; render() adds it once.
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
// Once a week is on screen, the ones the arrows lead to get ready in the background, so they open
// at once. It needs the week after, and the one before last (each week also shows last week's).
// Not while AniList is already failing: nothing here may add to that, and a failure stays silent.
let readiedWeek = null;
function readyNeighbours(start) {
  if (readiedWeek === start.getTime() || navigator.onLine === false || fallbackWeeks.has(start.getTime())) return;
  readiedWeek = start.getTime();
  const whenIdle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1000);
  whenIdle(() => {
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
// The covers of that week's shows in the selected people's plan, so a flipped week looks finished at
// once. Only those: the whole week's airings would be a hundred pictures nobody sees.
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
function fetchWeek(start) {
  const key = start.getTime();
  if (!cache.has(key)) cache.set(key, downloadWeek(start).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
}

async function downloadWeek(start) {
  const storeKey = 'week:' + start.getTime();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey)); } catch {}
  if (saved && Date.now() - saved.time < WEEK_CACHE_MS) return saved.items;
  if (saved) {
    // Older copy: show it now and update in the background (re-rendering if anything changed).
    downloadAirings(start).then(items => {
      fallbackWeeks.delete(start.getTime());
      storeWeek(storeKey, items);
      const noted = setNote(storeKey, null);
      if (JSON.stringify(items) !== JSON.stringify(saved.items)) {
        cache.set(start.getTime(), Promise.resolve(items));
        load(true);
      } else if (noted) load(true);
    }, () => { if (setNote(storeKey, `${unreachable('AniList')}: Sendetermine vom ${savedAt(saved.time)}.`)) load(true); });
    return saved.items;
  }
  let items;
  try {
    items = await downloadAirings(start);
  } catch (e) {
    const fallback = await liveChartWeek(start);
    if (fallback) return fallback;
    throw new Error(navigator.onLine === false ? "Du bist offline, und diese Woche ist in diesem Browser noch nicht gespeichert."
      : "AniList antwortet gerade nicht (es begrenzt, wie oft man fragen darf). Versuch es in einer Minute nochmal.");
  }
  storeWeek(storeKey, items);
  fallbackWeeks.delete(start.getTime());
  setNote(storeKey, null);
  return items;
}

function storeWeek(storeKey, items) {
  try {
    // Drop weeks too old to be a useful fallback, so the browser storage doesn't fill up.
    for (const k of Object.keys(localStorage)) if (k.startsWith('week:') && k !== storeKey) {
      const t = JSON.parse(localStorage.getItem(k))?.time;
      if (!t || Date.now() - t > WEEK_KEEP_MS) localStorage.removeItem(k);
    }
    localStorage.setItem(storeKey, JSON.stringify({ time: Date.now(), items }));
  } catch {}
}

// All airings of one week from AniList.
async function downloadAirings(start) {
  // Monday 00:00 to next Monday 00:00 local time (a daylight-saving week is an hour longer or shorter).
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const from = Math.floor(start / 1000) - 1;
  const to = Math.floor(end / 1000);
  const items = [];
  for (let page = 1; ; page++) {
    const data = await anilist(QUERY, { page, from, to }, undefined, { retries: 0, timeout: 8000 });
    items.push(...data.Page.airingSchedules);
    if (!data.Page.pageInfo.hasNextPage) return items;
  }
}

// The owner gets a ⇄ on each show to move it (others just see it in its new place).
const slotLabel = s => [s?.tag, s?.time].filter(Boolean).join(' ') || 'kein Tag';
const moveButton = (show, slot) => !movesKey || !show ? '' :
  `<button class="move" data-move-title="${esc(show.romaji || show.english)}" data-move-name="${esc(show.english || show.romaji)}"
    data-tag="${esc(slot?.tag || '')}" data-time="${esc(slot?.time || '')}" data-moved="${slot?.from ? 1 : ''}" draggable="true" title="Auf einen Tag oder Slot ziehen, oder klicken, um ein Ziel einzugeben">⇄</button>`;

// Why a show has a break: LiveChart's timetable note for that week, else its newest break
// headline (linked), else `none` (already HTML). A note is cut down to its cause ("…no broadcast
// today due to sports coverage." → "sports coverage"); otherwise its "today" becomes its day.
const noteReason = note => note.text.match(/\b(?:due to|because of)\s+(.+?)\.?$/i)?.[1]
  || note.text.replace(/\btoday\b/i, 'am ' + shortDayDate(new Date(note.at * 1000)));
const reasonHtml = (note, news, none) => note
  ? esc(noteReason(note))
  : news?.length ? `<a href="${safeUrl(news[0].url)}" target="_blank" rel="noopener">${esc(news[0].title)}</a>` : none;

// When the weekly LiveChart data is out of date (its "next episode" has already passed), AniList's
// next airing episode decides whether a show has a break: AniList id → {episode, at} (null = none
// scheduled), kept 6 hours; ids still waiting for a lookup are collected in render().
const NEXT_KEEP_MS = 6 * 3600000;
const aniNext = new Map();
const airingFacts = new Map(); // Media airing status, never the viewer's Completed/Watching status.
const pendingNext = new Set();
const dateOf = d => d?.year && d?.month && d?.day ? new Date(d.year, d.month - 1, d.day).getTime() : null;
const finishedBy = (facts, end) => facts?.status === 'FINISHED' && (!dateOf(facts.endDate) || dateOf(facts.endDate) < end);
function finishedThisSeason(media, start) {
  const since = new Date(start); since.setMonth(since.getMonth() - 3);
  return (dateOf(media.endDate) || dateOf(media.startDate) || 0) >= since.getTime();
}
// Covers for rows without an episode this week (a break, or AniList not answering), so every row has
// the same shape: from any airing seen, kept in this browser, else asked from AniList once.
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
  } catch {} // Not important enough to report: the row just has no cover this visit.
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
    for (const id of ids) aniNext.set(id, 'failed'); // AniList busy: listed as unknown this visit
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

// Older shows in the plan (rewatches): looked up on AniList by title once, kept for 7 days.
// title → media, null = not found; shows still waiting for a lookup are collected in render().
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
      if (saved && Date.now() - saved.time < WEEK_KEEP_MS) rewatchMedia.set(key, saved.media);
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
      // Not on AniList: remember that. AniList busy: unknown for this visit (the next one tries again).
      rewatchMedia.set(key, 'failed');
      if (e.status !== 404) continue;
      media = null;
    }
    rewatchMedia.set(key, media);
    try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), media })); } catch {}
  }
}

// Buttons for every service the show is on, with the one from the sheet's "Wo" column first.
const sourceSearchTitle = title => String(title || '').replace(/^(Even the Student Council Has (?:Its )?Holes)!$/i, '$1');
// Nyaa: English and romaji at once, since releases usually carry the romaji name. A long subtitle after
// the colon is left out (releases often drop it), the rest stays exact so other seasons don't slip in.
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
  // German availability from LiveChart (tools/build-streams.mjs) wins over AniList's worldwide links.
  const de = streamsDe?.byAnilist[media.id];
  if (de?.length) {
    for (const { name, url, extra } of de) {
      const s = SERVICES.find(s => s.match.test(name));
      // Needs an add-on channel we don't have (e.g. Prime Video + aniverse): counts as another service.
      const label = (s?.label || name) + (extra ? ' + ' + extra : '');
      if (!links.some(l => l.url === url))
        links.push({ url, label, color: s?.color || OTHER_SERVICE_COLORS.find(([match]) => match.test(name))?.[1] || 'var(--muted)', main: !!s?.main && !extra, first: !!s && s.wo === wo && !extra });
    }
    return links.sort((a, b) => b.first - a.first);
  }
  for (const s of SERVICES) {
    // AniList's YouTube links are mostly trailer channels; only trust them when the sheet says Y.
    if (s.wo === 'Y' && wo !== 'Y') continue;
    const series = (media.externalLinks || []).find(l => s.match.test(l.site));
    if (series) links.push({ url: series.url, label: s.label, color: s.color, main: !!s.main, first: s.wo === wo });
  }
  // The sheet says where it streams but AniList has no link: fall back to that service's search.
  const service = SERVICES.find(s => s.wo === wo);
  if (service?.search && !links.some(l => l.first))
    links.unshift({ url: service.search + encodeURIComponent(sourceSearchTitle(searchTitle)), label: service.label + ' 🔍', color: service.color, main: !!service.main, first: true });
  return links.sort((a, b) => b.first - a.first);
}

// ---------- Render ----------


// The day an episode shows up on: the sheet's "Tag" (watch day) on or after the airing day,
// or the airing day itself when the sheet has no day for it. With a night-time watch slot, an
// episode out before that time the next morning still counts for the evening before.
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

// Our services as buttons; anything else only with the "Other services" toggle, outlined.
// The piracy label only when no button is left: none of our services, or (with the toggle on)
// no service at all.
// Resume links are gone: nothing keeps these two old settings any more.
try { localStorage.removeItem('resumeWatching'); localStorage.removeItem('resumeServices'); } catch {}
// The services' flat icons (a copy in services/, so they don't depend on anyone else's site). One-colour shapes:
// the button's text color fills them. It's Anime streams on YouTube, and LiveChart shows that icon for it too.
const SERVICE_ICONS = [[/crunchyroll/i, 'crunchyroll'], [/netflix/i, 'netflix'], [/prime video|amazon|^prime$/i, 'prime-video'], [/disney/i, 'disney'],
  [/^adn$|animation digital network/i, 'adn'], [/youtube|it'?s anime/i, 'youtube'], [/akiba/i, 'akiba'], [/hidive/i, 'hidive']];
const serviceIcon = label => {
  const icon = SERVICE_ICONS.find(([match]) => match.test(label))?.[1];
  return icon ? `<span class="svc-icon" style="-webkit-mask-image:url(services/${icon}.svg);mask-image:url(services/${icon}.svg)"></span>` : '';
};
// The sources for shows on none of our services: each site's own icon, and a color taken from it.
const ALTERNATIVE_LOOK = [[/^aniworld/i, 'aniworld.png', '#657efa'], [/^subsplease/i, 'subsplease.png', 'var(--text)'],
  [/^nyaa/i, 'nyaa.png', '#3582f7'], [/^0neko/i, '0neko.ico', 'var(--text)']];
function alternativeButton(l) {
  const [, icon, color] = ALTERNATIVE_LOOK.find(([match]) => match.test(l.label));
  return `<a class="cr none" style="${serviceStyle(color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Alternative Quelle${l.label.endsWith('Suche') ? ': keine genaue Serienseite gefunden' : ''}"><img class="site-icon" src="services/${icon}" alt="" width="18" height="18">${esc(l.label)}</a>`;
}
// The red and blue names are hard to read on a dark card, so their text (not icon or tint) goes this much toward white there.
const TEXT_LIFT = { '#e50914': '30%', '#0578ff': '12%', '#ff0000': '25%', '#ff1a00': '15%', '#657efa': '8%', '#3582f7': '8%' };
const serviceStyle = color => `--svc:${color}${TEXT_LIFT[color] ? ';--text-lift:' + TEXT_LIFT[color] : ''}`;
function linkButtons(links, mediaId, watchers) {
  const button = l => l.main
    ? `<a class="cr" style="${serviceStyle(l.color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener">${serviceIcon(l.label)}${esc(l.label)}</a>`
    : `<a class="cr other" style="${serviceStyle(l.color)}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Verfügbar, aber kein Dienst, den wir haben">${serviceIcon(l.label)}${esc(l.label)}</a>`;
  const listed = links.filter(l => l.main || $('others').checked);
  const people = watchers ? activePeople().filter(p => watchers.includes(p)) : activePeople();
  // Prime goes once everyone here prefers the torrent link; with mixed choices both stay.
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

// Search: hides the shows (rows, or a Catch-up show's block) whose titles don't contain what's
// typed, and days left without any. Runs after each render and while typing.
const searchKey = (...titles) => `data-search="${esc(titles.filter(Boolean).map(norm).join(' '))}"`;
function applySearch() {
  const q = norm($('search').value);
  const items = [...document.querySelectorAll('#list [data-search]')];
  for (const el of items) el.classList.toggle('hidden-by-search', !!q && !el.dataset.search.includes(q));
  for (const day of document.querySelectorAll('#list .day'))
    day.classList.toggle('hidden-by-search', !!q && !day.querySelector('[data-search]:not(.hidden-by-search)'));
  for (const box of document.querySelectorAll('#list .shared:not([data-search])'))
    box.classList.toggle('hidden-by-search', !!q && !box.querySelector('[data-search]:not(.hidden-by-search)'));
  // Nothing left: say so instead of an empty page
  let none = $('noMatch');
  if (q && items.length && !document.querySelector('#list [data-search]:not(.hidden-by-search)')) {
    if (!none) { none = document.createElement('div'); none.id = 'noMatch'; none.className = 'nomatch'; }
    none.textContent = `Keine Serie passt zu „${$('search').value.trim()}“${view === 'week' ? ' in dieser Woche' : ''}.`;
    if (!none.isConnected) $('list').prepend(none);
  } else none?.remove();
}
// Searching ignores "Today" (the whole week is shown); starting or clearing a search redraws the
// week with or without the days already past.
const searching = () => !!norm($('search').value);
let searchedWeek = false;
function searchChanged() {
  if (view === 'week' && range !== 'week' && searching() !== searchedWeek) load(true);
  else applySearch();
  searchedWeek = searching();
}
$('search').addEventListener('input', searchChanged);
// The magnifying glass opens the field; an empty field closes again when you click elsewhere,
// Esc clears and closes it.
function openSearch(open) {
  $('searchBox').classList.toggle('open', open);
  document.body.classList.toggle('searching', open);
  $('searchButton').setAttribute('aria-expanded', String(open));
  $('searchButton').setAttribute('aria-label', open ? 'Suche leeren und schließen' : 'Serien suchen');
  if (open) $('search').focus();
}
// The 🔍 opens the field, and closes it again (clearing the search) when it's open.
$('searchButton').onclick = () => {
  const open = $('searchBox').classList.contains('open');
  if (open) { $('search').value = ''; searchChanged(); }
  openSearch(!open);
};
$('search').addEventListener('blur', e => {
  if (e.relatedTarget === $('searchButton')) return; // the 🔍 itself decides
  if (!$('search').value) openSearch(false);
});
$('search').addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('search').value = '';
  searchChanged();
  openSearch(false);
  $('searchButton').focus();
});

// On a phone the three header rows take a quarter of the screen: they slide away while scrolling
// down (from the very top on) and come back on the slightest scroll up (never at the top itself,
// while searching, or with a menu open).
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

// Fades rows whose watch time has passed; runs after each render and every 30 seconds, so
// they fade while the page stays open. Today gets a "Jetzt" line between what's past and what's
// still to come (after the last show once all are past; none before the first).
function tick() {
  const now = Date.now();
  for (const r of document.querySelectorAll('.row[data-fade-at]'))
    r.classList.toggle('aired', now >= Number(r.dataset.fadeAt));
  document.querySelector('.now-line')?.remove();
  const items = [...document.querySelectorAll('.day.is-today > .row[data-fade-at], .day.is-today > .shared:has(.row[data-fade-at])')];
  const past = el => [...el.matches('.row') ? [el] : el.querySelectorAll('.row[data-fade-at]')].every(r => r.classList.contains('aired'));
  const next = items.findIndex(el => !past(el));
  if (next !== 0 && items.length)
    (next > 0 ? items[next] : items.at(-1)).insertAdjacentHTML(next > 0 ? 'beforebegin' : 'afterend', '<div class="now-line" aria-hidden="true"><span>Jetzt</span></div>');
  if (document.visibilityState !== 'hidden' && new Date().toDateString() !== shownDay) freshen();
}
setInterval(tick, 30000);

// An open tab or home screen app can stay open for days: past midnight it moves on to the new day,
// and coming back after a while it asks for fresh data. Always in place, keeping the scroll position;
// not in the middle of something (a dialog, a two-step Drop or Mark all, dragging a show).
const COME_BACK_MS = 30 * 60000;
let shownDay = new Date().toDateString();
let hiddenAt = 0;
async function freshen(fetchAgain = false) {
  if (document.querySelector('dialog[open], #markAll.sure, .drop[data-sure], .move-dragging')) return;
  shownDay = new Date().toDateString();
  if (fetchAgain) {
    const start = weekStart(weekOffset), lastWeek = new Date(start);
    lastWeek.setDate(lastWeek.getDate() - 7);
    cache.delete(start.getTime()); cache.delete(lastWeek.getTime());
    sheets.clear();
    if (auth) await loadMe().catch(() => {}); // ticks made elsewhere, like on the phone
  }
  load(true);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  const away = hiddenAt && Date.now() - hiddenAt >= COME_BACK_MS;
  if (away || new Date().toDateString() !== shownDay) freshen(away);
  hiddenAt = 0;
});

// Watch time for each show of a day, then the day sorted by it: the sheet's "Uhrzeit" where
// there is one; the rest fill the free evening slots (19:00, then every 30 minutes) in release
// order. Rows fade at their watch time, but never before the episode is out.
const FIRST_SLOT = [19, 0];
const SLOT_MINUTES = 30;
function assignWatchTimes(day) {
  // Night-time slots (before 06:00) are the next calendar morning.
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


// With release times on show, a day reads in release order. Each group is one card (shows sharing a watch
// slot stay together, at their earliest release). Rows with no release time (breaks, rewatches, shows
// without airing data) keep their plan order after the rest.
// "Heute" and "Morgen" in place of the weekday in a day's heading; hovering it still gives the full date.
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

// plans: Map tab gid → sheet, for every Guckplan tab that can be active this week.
const LOADING_HTML = '<div class="status loading">Lädt…</div><div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
// A short slide or fade when the list changes because you went somewhere (never on a refresh).
var enter = null;
// The first and last episode stand out; the total is only known once AniList has it (a one-episode
// special is neither).
function episodeTags(episodes, total) {
  const tag = text => `<span class="ep-tag">${text}</span>`;
  if (total === 1) return '';
  return (Math.min(...episodes) === 1 ? tag('Premiere') : '') + (total && Math.max(...episodes) === total ? tag('Finale') : '');
}
// A row's cover again, as a faint wash of its colors behind the row.
const artStyle = m => m?.coverImage?.medium ? `style="--art:url(&quot;${safeUrl(m.coverImage.medium)}&quot;)"` : '';
const calmMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Switches that only change what's shown redraw the week without a new fetch: rows glide to their new
// place and the changed parts fade, instead of everything jumping at once.
var lastWeekRender = null; // what render() last drew: [items, start, plans]
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
    // A saved cover shows straight away, so it doesn't blink while the row moves.
    for (const img of el.querySelectorAll('img')) { img.loading = 'eager'; img.decoding = 'sync'; }
    // A shared card clips what moves inside it, so its rows only fade.
    if (!was || el.closest('.shared')) { el.animate?.([{ opacity: 0 }, { opacity: 1 }], fade); continue; }
    if (was.left !== now.left || was.top !== now.top)
      el.animate?.([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }], glide);
    const time = el.querySelector('.time');
    if (time && time.textContent !== was.time) time.animate?.([{ opacity: 0 }, { opacity: 1 }], fade);
    // The time column's width changes with its text: cover and title follow it smoothly.
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
  glideFrom = null; // nothing was drawn when nobody is selected
  chaseLookups();
  return true;
}
const redraw = () => { if (!redrawWeek()) load(true); };
// Shows a redraw brought up that still need looking up (someone else's rewatches, covers).
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

// Sheet show → AniList id → title score. Stays valid across redraws; a reloaded sheet has new show objects.
const showScores = new WeakMap();
function render(items, start, plans) {
  lastWeekRender = [items, start, plans];
  const restore = preserveListPosition();
  updateFallbackControls();
  const fallback = fallbackWeeks.has(start.getTime());
  // Shows any selected person watches (solo: one person, group: the toggled ones); nobody = nothing.
  const people = activePeople();
  if (!people.length) {
    $('list').innerHTML = '<div class="status">Wähle oben mindestens eine Person aus.</div>';
    return;
  }
  // Per tab: show → slot, merged over the selected people (a slot with a time wins), and everyone
  // in the Guckplan who picked each show (for "Who's watching").
  const whoBySheet = new Map();
  const chosen = new Map([...plans.values()].map(s => {
    const merged = new Map();
    const who = new Map();
    for (const p of s.people)
      for (const [show, slot] of picks(s, p)) {
        if (people.includes(p) && !merged.get(show)?.time) merged.set(show, slot);
        who.set(show, [...who.get(show) || [], p]);
      }
    // Shows moved out of their Guckplan slot (moves.json), this week or from now on
    for (const [show, slot] of merged) {
      const mv = moveFor(show, start);
      if (mv) merged.set(show, { ...slot, tag: mv.tag, time: mv.time, from: slot });
    }
    whoBySheet.set(s, who);
    return [s, merged];
  }));
  const showWho = $('who').checked;
  const others = who => mode === 'solo' ? who?.filter(p => !activePeople().includes(p)) : who;
  const whoChips = all => { const who = others(all); return showWho && who?.length
    ? `<span class="who">${who.map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}${who.length > 2 ? `<button class="who-more" data-more="+${who.length - 2}" aria-expanded="false" aria-label="Alle anzeigen: ${esc(who.join(', '))}">+${who.length - 2}</button>` : ''}</span>` : ''; };
  const found = new Set();
  // Logged in and Solo on your own plan: shows you dropped on AniList are gone from your week. In Group,
  // or looking at someone else's plan, they stay with "Gedroppt" in place of the Drop button.
  const droppedByMe = id => !!auth && mode === 'solo' && soloPerson === ownPerson() && knownEntries.get(Number(id))?.status === 'DROPPED';
  const today = new Date().toDateString();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push({ date: d, rows: [] });
  }
  // A sheet show only links to its best-matching AniList entries, so spin-off mini anime
  // ("… Mini Anime" synonyms) don't tag along with the main show.
  const score = (s, m) => {
    let known = showScores.get(s);
    if (!known) showScores.set(s, known = new Map());
    let value = known.get(m.id);
    if (value === undefined) known.set(m.id, value = titleScore([s.romaji, s.english], mediaTitles(m)));
    return value;
  };
  const best = new Map();
  // A tab's shows, plus catalog entries someone named that have no Guckplan row of their own.
  const showsOf = sheet => sheet ? [...sheet.shows, ...[...chosen.get(sheet).keys()].filter(s => !sheet.shows.includes(s))] : [];
  for (const sheet of plans.values())
    for (const s of showsOf(sheet)) best.set(s, Math.max(0, ...items.map(it => score(s, it.media))));
  for (const it of items) {
    const m = it.media;
    MAL.rememberMedia(m);
    if (m.isAdult) continue;
    // When it comes out on our service (LiveChart's offset to Japanese TV), else AniList's TV time.
    const when = new Date((it.airingAt + (streamsDe?.release?.[m.id]?.offset || 0)) * 1000);
    const episode = it.episode - lagOf(m.id);
    if (episode < 1) continue;
    // Look the show up in the tab for the airing date first; the neighbouring tabs only
    // count for shows that tab doesn't list.
    let show, sheet;
    for (const tab of activeTabs(tabs, when)) {
      sheet = plans.get(tab.gid);
      // A show listed twice in the sheet: use the row that counts for the selected people.
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
    // One entry per show and week; several episodes (batch drops, double episodes) are merged.
    const existing = days.flatMap(d => d.rows).find(r => r.m.id === m.id);
    if (existing) existing.episodes.push(episode);
    else day.rows.push({ it, m, links, when, slot, show, episodes: [episode], who: whoBySheet.get(sheet).get(show) });
  }

  // Shows from this week's plan without an episode, checked against LiveChart (weekly script):
  // a next episode after this week means a break ("Pause" in its slot, with the return date and
  // any announcement); nothing scheduled means this season's run is over (left out). Shows
  // LiveChart doesn't know this season that AniList lists as finished are rewatches, shown in
  // their slot. The rest is listed below. Pause and rewatch only from this week on.
  const weekTabs = new Set(days.map(d => tabFor(tabs, d.date).gid));
  const weekEnd = days[6].date.getTime() + 86400000;
  const unknown = []; // { show, why }
  const breaks = []; // also listed at the top, with the reason
  const busy = () => `${unreachable('AniList')}, daher ist unklar, ob sie läuft`;
  // Without the LiveChart data (streams-de.json didn't load) breaks and rewatches can't be told
  // from finished shows: none are guessed (the note at the top says so).
  for (const [show, slot] of !streamsDe ? [] : [...weekTabs].flatMap(gid => plans.has(gid) ? [...chosen.get(plans.get(gid))] : [])) {
    if (found.has(show)) continue;
    // The same show listed twice in the sheet, already on the schedule through its other row.
    if ([...found].some(f => titleMatches([f.romaji, f.english], [show.romaji, show.english]))) continue;
    const [alId, status] = Object.entries(streamsDe?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles)) || [];
    if (droppedByMe(alId)) continue; // no break notice for a show you dropped either
    let upcoming = status?.next;
    if (finishedBy(airingFacts.get(alId) || status?.airingStatus, weekEnd)) continue;
    if (fallback) {
      const day = days.find(d => WEEKDAYS.indexOf(norm(slot.tag).slice(0, 2)) === (d.date.getDay() + 6) % 7);
      if (!day) { unknown.push({ show, why: 'Kein Guck-Tag im Guckplan eingetragen' }); continue; }
      const note = (status?.notes || []).find(n => n.at * 1000 >= start.getTime() - 86400000 && n.at * 1000 < weekEnd);
      if (upcoming?.at * 1000 >= weekEnd && note) {
        const why = { note: note || null, news: status.news || [] };
        const when = new Date(upcoming.at * 1000);
        day.rows.push({ pause: true, show, slot, when, episode: upcoming.episode - lagOf(alId), cover: coverFor(alId), ...why });
        breaks.push({ show, when, episode: upcoming.episode - lagOf(alId), ...why });
      } else {
        const m = { id: Number(alId) || 0, title: { romaji: show.romaji, english: show.english }, externalLinks: [], coverImage: { medium: coverFor(alId) } };
        day.rows.push({ fallback: true, show, slot, when: day.date, m, links: streamLinks(m, show.wo, show.english || show.romaji), who: [...whoBySheet.values()].find(w => w.has(show))?.get(show) });
      }
      found.add(show);
      continue;
    }
    // LiveChart's next episode already passed: the weekly data is behind, AniList knows better
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
    if (!day || weekEnd < Date.now()) { unknown.push({ show }); continue; }
    const next = upcoming && new Date(upcoming.at * 1000);
    if (next && next >= weekEnd) {
      // The reason: LiveChart's timetable note for this week ("no broadcast today due to sports
      // coverage"), else its newest break headline
      const note = (status.notes || []).find(n => n.at * 1000 >= days[0].date.getTime() - 86400000 && n.at * 1000 < weekEnd);
      const why = { note: note || null, news: status.news || [] };
      day.rows.push({ pause: true, show, slot, when: next, episode: upcoming.episode - lagOf(alId), cover: coverFor(alId), ...why });
      breaks.push({ show, when: next, episode: upcoming.episode - lagOf(alId), ...why });
      found.add(show);
      continue;
    }
    const media = !status && rewatchFor(show);
    if (media && media !== 'failed' && droppedByMe(media.id)) continue;
    if (media === 'failed') unknown.push({ show, why: busy() });
    else if (media && media.status === 'FINISHED') {
      if (finishedThisSeason(media, start)) continue; // A season ending is not an automatic rewatch.
      const links = streamLinks(media, show.wo, media.title.english || media.title.romaji);
      day.rows.push({ rewatch: true, m: media, links, slot, show, when: day.date, who: [...whoBySheet.values()].find(w => w.has(show))?.get(show) });
      found.add(show);
    } else if (media?.nextAiringEpisode && new Date(media.nextAiringEpisode.airingAt * 1000) >= weekEnd) {
      const when = new Date((media.nextAiringEpisode.airingAt + (streamsDe?.release?.[media.id]?.offset || 0)) * 1000);
      const why = { note: null, news: [] };
      day.rows.push({ pause: true, show, slot, when, episode: media.nextAiringEpisode.episode - lagOf(media.id), cover: media.coverImage?.medium, ...why });
      breaks.push({ show, when, episode: media.nextAiringEpisode.episode - lagOf(media.id), ...why });
      found.add(show);
    } else unknown.push({ show, why: media === undefined ? 'Ausstrahlung wird geprüft…'
      : media?.status === 'RELEASING' ? 'Läuft noch; kein Folgentermin für diese Woche bestätigt'
      : 'Serie nicht gefunden oder Ausstrahlung nicht bestätigt' });
  }
  for (const d of days) assignWatchTimes(d);

  // Opened, or the "Week" button pressed off: the week starts with today, the days already past are left
  // out; "Today": today only. With the arrows it's always the whole week, and while searching too
  // (so a show that aired earlier this week is found).
  const todayIndex = days.findIndex(d => d.date.toDateString() === today);
  const picked = range === 'day' && !searching() && days.find(d => isoDay(d.date) === pickedDay);
  const ordered = picked ? [picked] : searching() || todayIndex < 0 || range === 'week' ? days
    : range === 'today' ? [days[todayIndex]] : days.slice(todayIndex);
  let html = ordered.map(({ date, rows }) => {
    const fullDate = `${dayName(date)}, ${germanDate(date)}`;
    const heading = `<b>${esc(nearDayName(date) || dayName(date))}</b>, ${esc(germanDate(date))}`;
    // Rows without a ✓ keep its place, so every row's buttons line up.
    const checkSpace = auth ? '<div class="drop-space"></div><div class="watch-space"></div>' : '';
    // When it's back, and why if LiveChart says (its note, or its newest headline, linked).
    const backLine = (when, note, news) => [`Zurück am ${shortDayDate(when)}`, reasonHtml(note, news, '')].filter(Boolean).join(' · ');
    const pause = ({ show, slot, when, episode, note, news, watchAt, cover }) => `
      <div class="row pause" data-watch-time="${new Date(watchAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}" ${searchKey(show.english, show.romaji)}>
        <div class="time">Pause</div>
        ${cover ? `<img src="${safeUrl(cover)}" alt="" loading="lazy">` : ''}
        <div class="info">
          <div class="title">${esc(show.english || show.romaji)}</div>
          <div class="ep">${backLine(when, note, news)}</div>
        </div>
        <div class="links"></div>
        ${checkSpace}${moveButton(show, slot)}
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
    const row = r => r.pause ? pause(r) : r.fallback ? fallbackRow(r) : r.rewatch ? rewatch(r) : episodeRow(r);
    const fallbackRow = ({ show, slot, watchAt, m, links, who }) => `<div class="row" data-watch-time="${new Date(watchAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}" ${searchKey(show.english, show.romaji)}>
      <div class="time">${parseTime(slot.time) ? new Date(watchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : esc(slot.tag)}</div>
      ${m.coverImage.medium ? `<img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">` : ''}
      <div class="info"><div class="title">${esc(show.english || show.romaji)}</div><div class="ep">Folge nicht bestätigt${whoChips(who)}</div></div>
      <div class="links">${linkButtons(links, m.id, who)}</div>${checkSpace}${moveButton(show, slot)}</div>`;
    // ⚙ Time: the release ("Wed 15:00"), the watch time from the Guckplan ("19:30"), or both.
    const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const timeCell = (when, watchAt) => {
      const weekday = shortDayName(when);
      const release = `${weekday} ${hm(when)}`;
      const releaseCell = `<span class="time-day${when.toDateString() === date.toDateString() ? ' same' : ''}">${weekday}</span> ${hm(when)}`;
      const watch = hm(new Date(watchAt));
      return choices.time === 'watch' ? watch
        : choices.time === 'both' ? `${watch}<small><span class="out">ab </span>${release}</small>` : releaseCell;
    };
    const episodeRow = ({ it, m, links, when, watchAt, episodes, who, slot, show }) => `
      <div class="row" ${artStyle(m)} data-watch-time="${hm(new Date(watchAt))}" data-at="${when.getTime()}" data-fade-at="${Math.max(when.getTime(), watchAt)}" ${searchKey(...mediaTitles(m))}>
        <div class="time">${timeCell(when, watchAt)}</div>
        ${m.coverImage.medium ? `<img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">` : ''}
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener" title="${esc(m.title.english || m.title.romaji)}">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">${episodes.length > 1 ? `Folgen ${Math.min(...episodes)}–${Math.max(...episodes)}` : `Folge ${episodes[0]}`}${behindTag(m.id, Math.min(...episodes))}${episodeTags(episodes, m.episodes)}${whoChips(who)}</div>
        </div>
        <div class="links">${linkButtons(links, m.id, who)}</div>
        ${auth ? dropButton(m.id) : ''}${watchButton(m.id, Math.max(...episodes))}${moveButton(show, slot)}
      </div>`;
    // Shows sharing a watch slot (e.g. one watched instead of the other) go into one card.
    const groups = [];
    for (const r of rows) {
      if (groups.at(-1)?.[0].watchAt === r.watchAt) groups.at(-1).push(r);
      else groups.push([r]);
    }
    const ordered = choices.time === 'release' ? releaseOrder(groups) : groups;
    const body = ordered.length
      ? ordered.map(g => g.length > 1 ? `<div class="shared">${g.map(row).join('')}</div>` : row(g[0])).join('')
      : `<div class="ep empty-day">Keine Folgen${range === 'today' && !searching() ? ' <button class="pill" data-rest-of-week>Rest der Woche anzeigen</button>' : ''}</div>`;
    const isToday = date.toDateString() === today;
    return `<section class="day${isToday ? ' is-today' : ''}" data-date="${isoDay(date)}" data-move-day="${['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'][date.getDay()]}"><h2${isToday ? ' aria-current="date"' : ''}${nearDayName(date) ? ` title="${esc(fullDate)}"` : ''}><span>${heading}</span></h2>${body}</section>`;
  }).join('');
  // Above the days: one slim line with the week; pressing a day goes there. Days without a show step back.
  const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
  const strip = `<nav class="daystrip" aria-label="Einen Tag anzeigen">${days.map(({ date, rows }) => {
    const long = `${dayName(date)}, ${germanDate(date)}`;
    const alone = !searching() && (range === 'day' ? isoDay(date) === pickedDay : range === 'today' && date.toDateString() === today);
    const state = [date.toDateString() === today ? 'today' : date < nowDay ? 'past' : '', rows.length ? '' : 'free', alone ? 'picked' : ''].filter(Boolean).join(' ');
    return `<button data-jump="${isoDay(date)}"${state ? ` class="${state}"` : ''} aria-pressed="${alone}" aria-label="${esc(long)}: ${rows.length} ${rows.length === 1 ? 'Serie' : 'Serien'}">${esc(shortDayName(date))} <b>${date.getDate()}</b></button>`;
  }).join('')}</nav>`;

  // Only when a refresh seems to have stopped (LiveChart changes, GitHub token, PC task). The status
  // comes daily, from GitHub or the run from home; the stream links only weekly, from home.
  const daysOld = time => Math.floor((Date.now() - time) / 86400000);
  const linksAge = streamsDe?.generated ? daysOld(Date.parse(streamsDe.generated)) : 0;
  const statusAge = streamsDe ? daysOld(Math.max(Date.parse(streamsDe.generated) || 0, Date.parse(streamsDe.statusUpdated) || 0)) : 0;
  let staleNotice = '';
  if (statusAge >= 3) staleNotice = `<div class="notice">Die LiveChart-Daten wurden vor ${statusAge} Tagen zuletzt aktualisiert, Pausen und Folgentermine können also abweichen.</div>`;
  else if (linksAge >= 14) staleNotice = `<div class="notice">Die Stream-Links wurden vor ${linksAge} Tagen zuletzt aktualisiert; das wöchentliche Update läuft vielleicht nicht mehr.</div>`;
  // Beside the day strip, one line per show when opened: breaks in the same words as their row, then
  // plan shows that couldn't be placed.
  const lines = [
    ...breaks.map(b => `<div><b>${esc(b.show.english || b.show.romaji)}</b> · ${['Zurück am ' + shortDayDate(b.when), reasonHtml(b.note, b.news, '')].filter(Boolean).join(' · ')}</div>`),
    ...unknown.map(({ show: s, why }) => `<div><b>${esc(s.english || s.romaji)}</b> · <span class="why">${esc(why || 'Keine Folge für diese Woche bestätigt; Ausstrahlung unklar')}</span></div>`),
  ];
  const alerts = !lines.length ? '' : `<details id="airingWarnings" class="alerts${breaks.length && unknown.length ? ' long' : ''}"><summary><span class="notice-count">${[breaks.length ? `${breaks.length} ${breaks.length === 1 ? 'Pause' : 'Pausen'}` : '', unknown.length ? `${unknown.length} unbestätigt` : ''].filter(Boolean).join(' · ')}</span></summary><div class="alerts-body">${lines.join('')}</div></details>`;
  html = `${staleNotice}<div class="weekline">${alerts}${strip}</div>` + html;
  // Above everything: data that's old or missing (this week's and last week's airings count here)
  const lastWeek = new Date(start); lastWeek.setDate(lastWeek.getDate() - 7);
  html = notesHtml(['week:' + lastWeek.getTime(), 'week:' + start.getTime()]) + html;
  document.body.style.removeProperty('--time-width');
  $('list').innerHTML = html;
  // Same width for every time cell (the widest one), so covers and titles line up.
  tick();
  const times = [...document.querySelectorAll('.time')];
  document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
  applySearch();
  syncSavingButtons();
  restore();
  playEnter();
}

// ---------- Catch-up ----------

// Someone's AniList list (Watching / Rewatching), kept for 10 minutes; an older copy beats an error.
const LIST_QUERY = `query ($user: String) {
  MediaListCollection(userName: $user, type: ANIME, status_in: [CURRENT, REPEATING]) {
    lists { entries { progress status media {
      id status episodes siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day }
    } } }
  }
}`;
const LIST_CACHE_MS = 10 * 60 * 1000;
async function anilistList(user) {
  if (auth?.provider === 'mal' && user.toLowerCase() === auth.name.toLowerCase()) {
    const result = await MAL.list(auth);
    setNote('list:' + user.toLowerCase(), result.stale ? `MyAnimeList antwortet nicht: Liste vom ${savedAt(result.stale)}.` : null);
    return result.entries.filter(e => ['CURRENT', 'REPEATING'].includes(e.status));
  }
  const key = 'list:' + user.toLowerCase();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  if (saved && Date.now() - saved.time < LIST_CACHE_MS) return saved.entries;
  try {
    const entries = (await anilist(LIST_QUERY, { user })).MediaListCollection.lists.flatMap(l => l.entries);
    try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), entries })); } catch {}
    setNote(key, null);
    return entries;
  } catch (e) {
    if (!saved) throw e;
    setNote(key, `${unreachable('AniList')}: Liste von ${user} vom ${savedAt(saved.time)}.`);
    return saved.entries;
  }
}

// ---------- Writing to AniList (when connected) ----------

async function anilistAsMe(query, variables = {}) {
  if (auth?.provider === 'mal') throw new Error('Dafür brauchst du ein AniList-Konto.');
  try {
    return await anilist(query, variables, auth.token);
  } catch (e) {
    if (e.status === 401) disconnect();
    throw e;
  }
}

// Log out the active account (also when AniList says its login expired); the next saved one, if
// any, becomes active.
function disconnect() {
  if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
  if (auth?.provider === 'mal') MAL.logout(auth).catch(() => {});
  accounts = accounts.filter(a => a !== auth);
  useAccount(accounts[0] || null);
}

// Make an account the active one: ✓ and Catch-up then use its list.
function useAccount(account) {
  if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
  auth = account;
  myProgress.clear();
  knownEntries.clear(); notOnList.clear(); toScore = []; planShowsCache.time = 0; selecting = false; $('markAllStart').hidden = true;
  saveAccounts();
  if (auth?.name) {
    $('anilistUser').value = auth.name;
    try { localStorage.setItem('anilistUser', auth.name); } catch {}
  }
  updateConnect();
  if (auth) {
    accountLoading = true; syncSavingButtons();
    loadMe().catch(e => notice(e.message)).finally(() => { accountLoading = false; syncSavingButtons(); load(true); });
  }
  else load(true);
}

const connect = () => {
  location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
};

// An account's picture (AniList avatar), else its initial in a circle.
function avatarOf(account, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = (account?.name || '?').trim().charAt(0).toUpperCase();
  if (!account?.avatar) return span;
  const img = document.createElement('img');
  img.src = safeUrl(account.avatar).replace(/&amp;/g, '&');
  img.alt = '';
  if (className) img.className = className;
  img.onerror = () => img.replaceWith(span); // picture gone: the initial instead
  return img;
}

// The AniList button (top right) and its menu. Not logged in: "Connect AniList". Logged in: this
// browser's accounts as pills (the active one filled; click another to switch), "+ Add", "Log out".
const PERSON_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
function updateConnect() {
  const button = $('accountButton');
  button.classList.toggle('empty', !auth);
  if (auth) button.replaceChildren(avatarOf(auth));
  else button.innerHTML = PERSON_ICON;
  button.title = auth?.name ? `${listService()}: ${auth.name}` : 'Listen-Konten';
  button.setAttribute('aria-label', 'Listen-Konten');
  $('anilistUser').readOnly = auth?.provider === 'mal';
  $('anilistUser').placeholder = auth?.provider === 'mal' ? 'MyAnimeList-Konto' : 'AniList-Name';
  // A pill: optionally the account's picture or initial, then the text.
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
      b.title = `${provider}: ${account.name || 'Konto'}`;
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
  );
  updateSyncControls();
}

// ⚙ and the AniList button open and close their menus; a click anywhere else closes them.
function showMenu(menu, button, open) {
  if (open) {
    for (const [other, trigger] of [['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
      if (other === menu) continue;
      $(other).hidden = true;
      $(trigger).setAttribute('aria-expanded', 'false');
    }
  }
  $(menu).hidden = !open;
  $(button).setAttribute('aria-expanded', open);
}
const showSettings = open => showMenu('settingsMenu', 'settingsButton', open);
$('settingsButton').onclick = () => showSettings($('settingsMenu').hidden);
$('accountButton').onclick = () => showMenu('accountMenu', 'accountButton', $('accountMenu').hidden);
document.addEventListener('click', e => {
  if (!e.target.closest('#settingsMenu, #settingsButton')) showSettings(false);
  if (!e.target.closest('#accountMenu, #accountButton')) showMenu('accountMenu', 'accountButton', false);
});

// Theme (⚙ Design): Auto follows the system, or Hell / Dunkel, remembered per browser. data-dark
// marks the theme actually showing.
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

// ⚙ choices (buttons with data-set="name" data-value="…"), remembered per browser: the time shown
// in the week, the Catch-up order and the accent color.
const choices = { time: 'release', sort: 'oldest', accent: 'person' };
// A saved value only counts if it's one the page knows (an old or broken one falls back)
const CHOICE_OK = {
  time: v => ['release', 'watch', 'both'].includes(v),
  sort: v => ['oldest', 'behind', 'az'].includes(v),
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
// The accent color ("person": the Solo person's Guckplan color; until that's known the color of the last
// visit, so it doesn't flash orange first, see early.js), today's header tinted with it, and black or
// white text on it, whichever reads better.
function applyAccent() {
  const root = document.documentElement.style;
  const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
  const known = choices.accent === 'person' ? hex(personColor.get(soloPerson)) : hex(choices.accent);
  let last = null;
  try { if (known) localStorage.setItem('accentNow', known); else last = hex(localStorage.getItem('accentNow')); } catch {}
  const c = known || last || '#f47521';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  root.setProperty('--accent', c);
  root.setProperty('--accent-text', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff');
  root.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
}
for (const name of Object.keys(choices)) setChoice(name, choices[name]);
for (const b of document.querySelectorAll('[data-set]'))
  b.onclick = () => {
    setChoice(b.dataset.set, b.dataset.value);
    if (b.dataset.set === 'time') redraw();
    else if (b.dataset.set !== 'accent') load(true);
  };

// ⚙ Show: the Drop buttons and the ⇄ (owner only) can be hidden; both on unless switched off.
for (const [id, cls] of [['dropButtons', 'no-drop'], ['moveButtons', 'no-move']]) {
  try { $(id).checked = id === 'moveButtons' ? localStorage.getItem(id) === '1' : localStorage.getItem(id) !== '0'; } catch { $(id).checked = id !== 'moveButtons'; }
  document.body.classList.toggle(cls, !$(id).checked);
  $(id).onchange = () => {
    try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch {}
    document.body.classList.toggle(cls, !$(id).checked);
    if (id === 'moveButtons') syncMoveEditor();
  };
}
function syncMoveEditor() {
  $('editSchedule').hidden = $('editScheduleMenu').hidden = $('moveToggle').hidden;
  const on = $('moveButtons').checked;
  $('editSchedule').innerHTML = on ? 'Fertig<span class="title-long"> mit Bearbeiten</span>' : 'Plan<span class="title-long"> bearbeiten</span>';
  $('editSchedule').setAttribute('aria-pressed', String(on));
}
$('editScheduleMenu').onclick = () => { showSettings(false); $('editSchedule').click(); };
$('editSchedule').onclick = () => {
  $('moveButtons').checked = !$('moveButtons').checked;
  $('moveButtons').dispatchEvent(new Event('change'));
};

// ⚙ Behind (off unless switched on): how many episodes before this one you haven't watched yet,
// for shows on your list.
try { $('behind').checked = localStorage.getItem('behind') === '1'; } catch {}
$('behind').onchange = () => {
  try { localStorage.setItem('behind', $('behind').checked ? '1' : '0'); } catch {}
  redraw();
};
function behindTag(mediaId, episode) {
  if (!auth || !$('behind').checked || !myProgress.has(mediaId)) return '';
  const n = episode - 1 - myProgress.get(mediaId);
  return n > 0 ? `<span class="behind" title="${n === 1 ? 'Eine frühere Folge' : `${n} frühere Folgen`} noch nicht gesehen">${n} behind</span>` : '';
}

// "Who's watching": name chips of everyone watching each show; on unless switched off.
try { $('who').checked = localStorage.getItem('who') !== '0'; } catch { $('who').checked = true; }
$('who').onchange = () => {
  try { localStorage.setItem('who', $('who').checked ? '1' : '0'); } catch {}
  redraw();
};

// The first row under the header (by its titles and day), to find it again after redrawing
function scrollAnchor() {
  const below = document.querySelector('header').getBoundingClientRect().bottom;
  const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest('.hidden-by-search') && r.getBoundingClientRect().bottom > below);
  return { y: scrollY, candidates: rows.map(row => ({
    key: row.closest('[data-search]')?.dataset.search,
    day: row.closest('.day')?.querySelector('h2')?.textContent,
    episode: row.querySelector('.time')?.textContent,
    top: row.getBoundingClientRect().top,
  })).filter(r => r.key) };
}
function restoreAnchor(a) {
  const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest('.hidden-by-search'));
  for (const saved of a.candidates || []) {
    const row = rows.find(r => r.closest('[data-search]')?.dataset.search === saved.key
      && r.closest('.day')?.querySelector('h2')?.textContent === saved.day
      && r.querySelector('.time')?.textContent === saved.episode);
    if (row) { scrollBy(0, row.getBoundingClientRect().top - saved.top); return; }
  }
  scrollTo(0, a.y);
}
// Capture immediately before replacing rows, so scrolling during a slow request is respected.
function preserveListPosition() {
  const anchor = scrollAnchor();
  const focused = document.activeElement;
  const focusMedia = focused?.closest('#list button[data-media]') ? { media: focused.dataset.media, ep: focused.dataset.ep,
    kind: ['watch', 'drop', 'score', 'move'].find(c => focused.classList.contains(c)) } : null;
  const focusedRow = focused?.matches?.('#list .row') ? keyRows().indexOf(focused) : -1;
  const expanded = new Set([...document.querySelectorAll('#list details[open]')].map(d => d.id || d.querySelector('summary')?.textContent));
  return () => {
    for (const d of document.querySelectorAll('#list details')) d.open = expanded.has(d.id || d.querySelector('summary')?.textContent);
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

// Who's logged in and how far they are in each show (their Watching/Rewatching list).
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
  // The account's picture for the AniList button (accounts saved before it was asked get it once).
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
    // Logged in again with an account that was already saved: keep the new login only.
    accounts = accounts.filter(a => a === auth || a.provider === 'mal' || a.name !== auth.name);
    saveAccounts();
    // A new login: Catch-up shows their own list.
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
  // Dropped shows too, so the Week view shows "Dropped" instead of a Drop button for them.
  try {
    const dropped = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: DROPPED) {
      lists { entries { progress status media { id } } } } }`, { user: auth.name });
    if (auth !== loadedFor) return;
    for (const { progress, status, media } of dropped.MediaListCollection.lists.flatMap(l => l.entries))
      if (!knownEntries.has(media.id)) knownEntries.set(media.id, { progress, status });
  } catch {}
  // How the account scores (10 points, 100 points, stars…), asked once per account
  if (!auth.scoreFormat) {
    try {
      auth.scoreFormat = (await anilistAsMe('{ Viewer { mediaListOptions { scoreFormat } } }')).Viewer.mediaListOptions.scoreFormat;
      saveAccounts();
    } catch {}
  }
  await loadToScore();
}

// Completed shows: their score for the Week view's ★ button, and the ones finished within the last
// 60 days without a score yet, listed at the end of Catch-up ("Finished · not scored yet").
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

// $status only when given: CURRENT for a show not on the list yet, DROPPED for "Drop"; $score only
// when scoring (in the account's own format).
const SAVE_PROGRESS = `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, score: $score) { id progress status score }
}`;

// ---------- Undo (Ctrl+Z, or the notice's "Undo") ----------

// How the logged-in viewer's entries look (for the Week view's buttons): from their Watching list
// and the forgotten Guckplan shows.
const knownEntries = new Map(); // media id → { progress, status }
const notOnList = new Set();    // media ids known not to be on the list
// The entry as AniList has it right now (asked every time: it may have changed elsewhere since
// the page loaded its copy of the list)
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

// Every change goes through here and returns what's needed to undo it. Progress on a show that
// isn't on the Watching list (not on the list at all, or Planning/Paused/Completed/Dropped) also
// sets it to Watching; otherwise AniList keeps it elsewhere and the page, which reads the Watching
// list, shows it as unwatched again after a reload. (A show still airing can be on Completed by
// mistake; AniList moves it to Completed by itself once the last episode is ticked.)
const ON_WATCHING_LIST = ['CURRENT', 'REPEATING'];
const pendingChanges = new Set();
let bulkSaving = false;
function syncSavingButtons() {
  for (const b of document.querySelectorAll('#list button[data-media]')) {
    const saving = pendingChanges.has(Number(b.dataset.media));
    b.disabled = saving || bulkSaving || accountLoading;
    if (saving) {
      if (!b.hasAttribute('data-idle-title')) b.dataset.idleTitle = b.title;
      b.title = `Speichert auf ${listService()}…`;
    } else if (b.hasAttribute('data-idle-title')) {
      b.title = b.dataset.idleTitle;
      delete b.dataset.idleTitle;
    }
    if (saving) b.setAttribute('aria-busy', 'true');
    else b.removeAttribute('aria-busy');
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
    try {
      const targetId = targetAccount.provider === 'mal' ? mediaId : await MAL.anilistId(mediaId);
      const targetBefore = await entryForAccount(targetAccount, targetId);
      const synced = { ...vars };
      if (vars.score !== undefined) synced.score = await convertSyncScore(vars.score, sourceAccount, targetAccount);
      if (vars.progress !== undefined && !vars.status && !ON_WATCHING_LIST.includes(targetBefore.status)) synced.status = 'CURRENT';
      if (vars.progress !== undefined && vars.progress > (before.progress || 0) && targetBefore.progress > vars.progress) {
        record.syncMessage = `${targetAccount.name} ist schon weiter; der Fortschritt dort bleibt.`;
      } else {
        const second = await saveForAccount(targetAccount, targetId, synced, true);
        invalidateAccount(targetAccount);
        record.linked = [{mediaId:targetId,before:targetBefore,after:{progress:second.progress,status:second.status,score:second.score},entryId:second.id,account:targetAccount}];
      }
    } catch (error) { record.syncMessage = `Abgleich unvollständig für ${targetAccount.name}: ${error.message}`; }
  }
  return record;
  } finally {
    pendingChanges.delete(mediaId);
    syncSavingButtons();
  }
}

// Keep the saved Watching list in step, so Catch-up shows changes right away; a status change
// means the list itself changed, so it's fetched again.
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

// Each action (one ✓, one Drop, one "Mark all as watched") is one step; undoing puts every show
// of that step back the way it was, newest step first. Only for 10 minutes, and only where AniList
// still has what this page saved: a show changed elsewhere meanwhile (AniList itself, another
// device) is left alone rather than overwritten. Each step belongs to the AniList login that made
// it: with another account active it waits until that one is active again. If AniList fails
// halfway, the shows not yet put back stay on the stack, so Undo can simply be tried again.
const UNDO_MS = 10 * 60 * 1000;
const undoSteps = [];
function remember(records, text) {
  if (!records.length || !auth) return;
  const messages = [...new Set(records.map(r => r.syncMessage).filter(Boolean))];
  const flattened = records.flatMap(r => [r, ...(r.linked || [])]);
  undoSteps.push({ records:flattened, time: Date.now(), token: auth.token, name: auth.name || 'dem anderen Konto' });
  if (messages.length) text += ' · ' + messages.join(' · ');
  notice(text, true);
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
  const left = [...last.records]; // newest change first comes off the end
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
    left.pop(); // this show is settled (put back, or changed elsewhere)
    if (left.length) await new Promise(r => setTimeout(r, 700));
  }
  const parts = [];
  if (done) parts.push(last.records.length > 1 ? `Rückgängig für ${done}` : 'Rückgängig gemacht');
  if (elsewhere) parts.push(`${elsewhere === 1 ? (done || failed ? 'eine Serie wurde' : 'Diese Serie wurde') : `${elsewhere} Serien wurden`} inzwischen woanders geändert und so gelassen`);
  if (failed) {
    // The rest stays for another try (same account, same 10 minutes)
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
  if (e.isComposing || e.altKey || document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return; // typing: the field's own undo
  e.preventDefault();
  undo();
});

// A short notice at the bottom after each action, with "Undo" (phones have no Ctrl+Z).
let noticeTimer = null;
function notice(text, withUndo = false) {
  $('noticeText').textContent = text;
  $('noticeUndo').hidden = !withUndo;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, withUndo ? 20000 : 5000);
}
$('noticeUndo').onclick = () => undo();
const rowTitle = el => el.closest('.shared, .row')?.querySelector('.title')?.textContent.trim() || 'Serie';
const watchButton = (mediaId, episode, add = false) => !auth ? '' :
  `<button class="watch${(myProgress.get(mediaId) || 0) >= episode ? ' done' : ''}" data-media="${mediaId}" data-ep="${episode}"${add ? ' data-add="1"' : ''}
    title="Folge ${episode} gesehen (${listService()})">✓</button>`;

// ✓ sets the AniList progress to that episode; clicking a ticked one undoes it (back to what it
// was before this visit's tick, else one episode back).
const before = new Map();
$('list').addEventListener('click', async e => {
  const b = e.target.closest('.watch');
  if (!b || !auth || b.disabled || bulkSaving || pendingChanges.has(Number(b.dataset.media)) || b.dataset.select) return; // while selecting, ✓ only picks
  const mediaId = Number(b.dataset.media), episode = Number(b.dataset.ep);
  const current = myProgress.get(mediaId) || 0;
  let progress;
  if (current >= episode) progress = before.has(mediaId) ? before.get(mediaId) : episode - 1;
  else { before.set(mediaId, current); progress = episode; }
  b.disabled = true;
  const title = rowTitle(b);
  try {
    const record = await change(mediaId, { progress, status: b.dataset.add ? 'CURRENT' : undefined });
    remember([record], `${title}: Folge ${progress} gesehen`);
    // The last episode: AniList set it to Completed, so ask for the score right away
    if (record.after.status === 'COMPLETED' && record.before.status !== 'COMPLETED' && !record.after.score) {
      openScore(mediaId, title);
      loadToScore().then(() => load(true));
    }
  } catch (err) {
    b.title = `Nicht gespeichert: ${err.message}`;
    notice(`${title} nicht gespeichert: ${err.message}. Du kannst es nochmal versuchen.`);
  }
  load(true);
});

// ---------- Scores (completed shows) ----------

// The account's score format (AniList profile setting): 100 or 10 points as a number, 10 points,
// 5 stars or 3 smileys as buttons. A score of 0 means none.
const SMILEYS = ['🙁', '😐', '🙂'];
const scoreFormat = () => auth?.scoreFormat || 'POINT_10_DECIMAL';
const showScore = score => scoreFormat() === 'POINT_5' ? '★'.repeat(score)
  : scoreFormat() === 'POINT_3' ? SMILEYS[score - 1] || score : String(score);
const scoreButton = mediaId => {
  const score = knownEntries.get(mediaId)?.score;
  return `<button class="score${score ? ' scored' : ''}" data-score-media="${mediaId}" title="${score ? 'Bewertung ändern' : 'Bewerten'} auf ${listService()}">${score ? esc(showScore(score)) : '★ Bewerten'}</button>`;
};
let scoring = null; // { mediaId, title }
function openScore(mediaId, title) {
  scoring = { mediaId, title };
  showSettings(false);
  showMenu('accountMenu', 'accountButton', false);
  const format = scoreFormat();
  const current = knownEntries.get(mediaId)?.score || 0;
  $('scoreName').textContent = title;
  $('scoreService').textContent = `Abgeschlossen. Deine Bewertung auf ${listService()}:`;
  $('scoreMsg').textContent = '';
  $('scoreClear').hidden = !current;
  $('scoreSave').hidden = !['POINT_100', 'POINT_10_DECIMAL'].includes(format); // buttons save by themselves
  const box = $('scoreInput');
  if (format === 'POINT_100' || format === 'POINT_10_DECIMAL') {
    // 100 points: whole numbers from 1. 10 points with decimals: the arrows step by .5, but any one
    // decimal (8.3) is fine, as on AniList.
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
  if (!input) return; // the buttons save by themselves
  // One decimal at most (whole numbers on the 100 scale), like AniList stores it
  const v = Math.round(Number(input.value.replace(',', '.')) * (input.step === '1' ? 1 : 10)) / (input.step === '1' ? 1 : 10);
  if (!input.value || !(v >= Number(input.min) && v <= Number(input.max))) { $('scoreMsg').textContent = `Eine Bewertung von ${input.min} bis ${input.max}.`; return; }
  saveScore(v);
};
$('scoreDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'scoreValue') { e.preventDefault(); $('scoreSave').click(); } });
$('scoreClear').onclick = () => saveScore(0);

// "Drop" in Catch-up: sets the show to Dropped on AniList, so it leaves Catch-up (and doesn't come
// back as a forgotten Guckplan show). The first click only asks.
// Already dropped (in the Week view only Group still shows those, as long as the Guckplan lists
// them): a quiet "Dropped" in its place; Ctrl+Z / Undo brings it back.
// Completed: ★ to score it in Drop's place (the score once given).
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

// "Mark all as watched" in Catch-up: every show up to its latest released episode. The first click
// lets you pick (each show's ✓ filled = included; click to leave one out), the second saves the
// included ones show by show (spaced out, AniList limits requests per minute).
let catchupTargets = [];
let selecting = false;
let revealMarkBar = false; // choosing just started: its bar appears above the rows, so go there
const skipped = new Set(); // media ids left out while selecting
const markAllLabel = () => `${catchupTargets.filter(t => !skipped.has(t.mediaId)).length} als gesehen markieren`;
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
// "Alle gesehen" beside the display switch starts choosing; the button in the list confirms.
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
  const records = []; // the whole run is one undo step
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

// Every show on the list with episodes out on our service that haven't been watched yet,
// the longest-waiting first, with the next episode to watch.
// When an episode counts as missed in Catch-up (seconds): its Guckplan watch slot ("Tag" +
// "Uhrzeit") is over, or, without a time, the watch day is over; never before it's out. A show
// moved for that week (or from now on, moves.json) counts in its new slot.
function dueAt(released, slot, show) {
  const monday = new Date(released * 1000);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const mv = show && moveFor(show, monday);
  if (mv) slot = { tag: mv.tag, time: mv.time };
  const day = watchDay(new Date(released * 1000), slot?.tag, slot?.time);
  const hm = parseTime(slot?.time);
  if (hm) day.setHours(hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0], hm[1], 0, 0);
  else day.setDate(day.getDate() + 1);
  return Math.max(released, day.getTime() / 1000);
}

// What's open on a list: the seasonal shows (rows, for Catch-up) and the older ones (ownPace).
function catchupRows(entries, planShows, plan) {
  const now = Date.now() / 1000;
  const week = 7 * 86400;
  const mySlots = plan && soloPerson ? [...picks(plan, soloPerson)] : [];
  // Seasonal = in the Guckplan, or started within the last ~9 months (this and the last two
  // seasons). Anything older (One Piece, a show you're working through) is watched at your own
  // pace: listed apart with its next episode, never "1025 to catch up" or part of Mark all.
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
    // Out so far: everything before the next episode, minus the newest ones whose watch time
    // hasn't passed yet (you're only behind once the planned slot is over).
    let out = next ? next.episode - lag - 1 : m.status === 'FINISHED' ? m.episodes : 0;
    while (next && out > progress && dueAt(released(out), slot, mine?.[0] || show) > now) out--;
    if (!out || out <= progress) continue;
    const first = progress + 1;
    const since = next ? released(first) : 0;
    const row = { m, first, out, since, missing, progress, links: streamLinks(m, show?.wo, m.title.english || m.title.romaji) };
    (missing || show || recent(m) ? rows : ownPace).push(row);
  }
  return { rows, ownPace };
}

// The number on the Catch-up button: episodes waiting. Worked out from the same saved copies as the
// view itself; if something can't be read the number simply stays away.
function showCatchupCount(rows) {
  const count = rows.reduce((sum, r) => sum + r.out - r.first + 1, 0);
  $('catchupCount').textContent = count || '';
  $('catchupCount').hidden = !count;
  $('catchupCount').title = count ? `${count} ${count === 1 ? 'Folge' : 'Folgen'} für Catch-up` : '';
}
let countingCatchup = false;
async function updateCatchupCount() {
  const user = $('anilistUser').value.trim();
  if (!user || countingCatchup) return;
  countingCatchup = true;
  try {
    const entries = await anilistList(user);
    const plan = await sheetFor(tabFor(tabs, new Date()));
    const { rows } = catchupRows(entries, await missingPlanShows(plan, entries), plan);
    if ($('anilistUser').value.trim() === user) showCatchupCount(rows);
  } catch {} finally { countingCatchup = false; }
}

async function loadCatchup(refresh = false) {
  updateFallbackControls();
  const user = $('anilistUser').value.trim();
  const shown = view; // Catch-up or Non-seasonal; stop if the view changes while loading
  const name = shown === 'pace' ? 'Non-seasonal' : 'Catch-up';
  $('tabName').textContent = user ? `${name} · ${user} auf ${listService()}` : name;
  if (!user) { $('list').innerHTML = '<div class="status">Gib im AniList-Menü einen AniList-Namen ein.</div>'; return; }
  if (!document.querySelector('#list .row')) $('list').innerHTML = LOADING_HTML;
  await ready;
  let entries;
  try {
    entries = await anilistList(user);
  } catch (e) {
    if (refresh && view === shown && document.querySelector('#list .row')) {
      notice(`${name} konnte nicht aktualisiert werden: ${e.message}. Es werden weiter die bisherigen Daten angezeigt.`);
      return;
    }
    if (view === shown) $('list').innerHTML = failed(navigator.onLine === false
      ? `Du bist offline, und die AniList-Liste von ${user} ist in diesem Browser noch nicht gespeichert.` : `Die AniList-Liste von ${user} konnte nicht geladen werden (${e.message}).`);
    return;
  }
  if (view !== shown) return;
  // This season's Guckplan, for each show's "Wo" (that service's button first).
  let plan = null;
  try {
    plan = await sheetFor(tabFor(tabs, new Date()));
    setNote('catchup:plan', null);
  } catch (e) {
    setNote('catchup:plan', `${unreachable('Google Sheets')}: ohne den Guckplan fehlen Guck-Slots und geplante Serien, die nicht auf der Liste sind.`);
  }
  // Plus the Solo person's Guckplan shows that aren't on the AniList Watching list (forgotten).
  const planShows = await missingPlanShows(plan, entries);
  if (view !== shown) return;
  const { rows, ownPace } = catchupRows(entries, planShows, plan);
  showCatchupCount(rows);
  // ⚙ Sort: longest waiting first, most episodes behind first, or by title.
  const byTitle = (a, b) => (a.m.title.english || a.m.title.romaji).localeCompare(b.m.title.english || b.m.title.romaji);
  rows.sort(choices.sort === 'az' ? byTitle
    : choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first) || a.since - b.since
    : (a, b) => a.since - b.since);
  // ✓ only on your own list. Grouped: one row per show, its ✓ marks every released episode.
  // Single episodes: a block per show with a row (and ✓) for each open episode, oldest first.
  // A ✓ on a forgotten show also puts it on the AniList list as Watching.
  const mine = auth?.name && user.toLowerCase() === auth.name.toLowerCase();
  catchupTargets = mine && shown === 'catchup' ? rows.map(r => ({ mediaId: r.m.id, progress: r.out, add: !!r.missing })) : [];
  const note = missing => missing ? ` · noch nicht auf deiner ${listService()}-Liste` : '';
  // While picking shows for "Mark all as watched", each show's ✓ is its switch: filled = included.
  const selector = m => `<button class="watch${skipped.has(m.id) ? '' : ' done'}" data-select="${m.id}"
    title="Bei „Alle als gesehen markieren“ mitnehmen">✓</button>`;
  const check = (m, ep, missing) => selecting ? selector(m) : watchButton(m.id, ep, missing);
  const single = singleEpisodes;
  const title = m => `<div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>`;
  const grouped = ({ m, first, out, missing, links }) => `
    <div class="row catchup-single" ${artStyle(m)} ${searchKey(...mediaTitles(m))}>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep">${out > first ? `${out - first + 1} Folgen · ${first}–${out}` : `Folge ${first}`}${note(missing)}</div>
      </div>
      <div class="links">${linkButtons(links, m.id)}</div>
      ${mine ? dropButton(m.id) + check(m, out, missing) : ''}
    </div>`;
  // A header per show (cover, title, links, Drop; while selecting its ✓ is the switch), then every
  // open episode as an equal slim row with its own ✓.
  const perEpisode = ({ m, first, out, missing, links }) => {
    const eps = Array.from({ length: out - first + 1 }, (_, i) => first + i);
    if (eps.length === 1) return grouped({m,first,out,missing,links});
    return `<div class="shared catchup-show" ${searchKey(...mediaTitles(m))}>
      <div class="row show-head" ${artStyle(m)}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}<div class="ep">${eps.length} Folgen · ${first}–${out}${note(missing)}</div></div>
        <div class="links">${linkButtons(links, m.id)}</div>
        ${mine ? dropButton(m.id) + (selecting ? selector(m) : '') : ''}
      </div>${eps.map(ep => `
      <div class="row compact">
        <div class="time">Folge ${ep}</div>
        <div class="info"></div>
        ${mine ? (selecting ? '<div class="watch-space"></div>' : watchButton(m.id, ep, missing)) : ''}
      </div>`).join('')}</div>`;
  };
  // At your own pace: one row per show with the next episode and its ✓ (that episode only).
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
      : `<div class="catchup-bar"><span class="hint">Klick auf ein ✓, um die Serie auszunehmen</span>
          <button id="cancelMark" class="pill">Abbrechen</button><button id="markAll" class="pill sure">${markAllLabel()}</button></div>`;
    $('list').innerHTML = rows.length ? top + rows.map(single ? perEpisode : grouped).join('') : '<div class="status happy"><img src="icon-192.png" alt="">Alles aufgeholt.</div>';
    // Your own list: shows finished lately that have no score yet, each with ★ to score it
    const unscored = mine ? toScore.filter(t => !knownEntries.get(t.media.id)?.score) : [];
    if (unscored.length) $('list').insertAdjacentHTML('beforeend', `<section class="day toscore"><h2>Beendet · noch nicht bewertet</h2>${unscored.map(({ media: m, completed }) => `
      <div class="row" ${searchKey(...mediaTitles(m))}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}
          <div class="ep">Abgeschlossen am ${completed.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </div>
        ${scoreButton(m.id)}
      </div>`).join('')}</section>`);
  }
  $('list').insertAdjacentHTML('afterbegin', notesHtml(['list:' + user.toLowerCase(), 'catchup:plan', 'catchup:missing']));
  // Not logged in, or someone else's list: say why there are no ✓ / Drop buttons. (Typing a name
  // into "Catch-up list of" only shows that list; logging in is "Connect AniList".)
  if (!mine && document.querySelector('#list .row')) $('list').insertAdjacentHTML('afterbegin', `<div class="notice">${auth
    ? `Das ist die Liste von ${esc(user)}: ✓ und Droppen gehen nur auf deiner eigenen (${esc(auth.name)}).`
    : 'Um Folgen abzuhaken oder Serien zu droppen, verbinde AniList: Personen-Symbol oben rechts → „AniList verbinden“.'}</div>`);
  const times = [...document.querySelectorAll('.time')];
  document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
  applySearch();
  syncSavingButtons();
  restore();
  resumeScroll();
  if (revealMarkBar) { revealMarkBar = false; window.scrollTo({ top: 0 }); }
  playEnter();
}

// The Solo person's Guckplan shows (this season, known to the weekly LiveChart data) that aren't
// on the Watching list, as list-like entries. Logged in, AniList also tells their real progress and
// status: Completed or Dropped ones stay out. Kept for 10 minutes.
let planShowsCache = { key: '', time: 0, media: [] };
async function missingPlanShows(plan, entries) {
  if (!plan || !soloPerson) return [];
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
      id status episodes siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } ${auth ? 'mediaListEntry { progress status }' : ''}
    } } }`;
    try {
      let data;
      if (auth?.provider === 'mal') {
        data = await anilist(query.replace('mediaListEntry { progress status }', 'idMal'), { ids });
        for (const m of data.Page.media) { MAL.rememberMedia(m); m.mediaListEntry = await MAL.entry(auth, m.id); }
      } else data = auth ? await anilistAsMe(query, { ids }) : await anilist(query, { ids });
      planShowsCache = { key, time: Date.now(), media: data.Page.media };
      setNote('catchup:missing', null);
    } catch {
      setNote('catchup:missing', `${unreachable('AniList')}: geplante Serien, die nicht auf der AniList-Liste sind, konnten nicht geprüft werden.`);
      return [];
    }
  }
  // Logged in, AniList said how these stand on the list: remember it for undo.
  if (auth) for (const m of planShowsCache.media) {
    if (m.mediaListEntry) knownEntries.set(m.id, { progress: m.mediaListEntry.progress, status: m.mediaListEntry.status });
    else notOnList.add(m.id);
  }
  return planShowsCache.media
    .filter(m => !['COMPLETED', 'DROPPED'].includes(m.mediaListEntry?.status))
    .map(m => ({ progress: m.mediaListEntry?.progress || 0, media: m, missing: true }));
}

// refresh: re-render after newer sheet data arrived, without jumping to today.
async function load(refresh = false) {
  if (listView()) return loadCatchup(refresh);
  const start = weekStart(weekOffset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  // The year only when it isn't this one, or the week spans New Year ("Dec 28, 2026 – Jan 3, 2027")
  const year = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== new Date().getFullYear();
  const fmt = d => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }) });
  $('week').textContent = $('weekSub').textContent = `${fmt(start)} – ${fmt(end)}`;
  if (!cache.has(start.getTime()) && !(refresh && document.querySelector('#list .row'))) $('list').innerHTML = LOADING_HTML;
  // Last week too: an episode airing after its watch day is watched the following week.
  const lastWeek = new Date(start); lastWeek.setDate(lastWeek.getDate() - 7);
  // Start AniList right away; it runs while the sheet loads.
  const airings = Promise.all([fetchWeek(lastWeek), fetchWeek(start)]);
  airings.catch(() => {}); // handled below
  await ready;

  // Every tab that can be active from last week to the end of this one, loaded side by side.
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
  if (view !== 'week') return; // switched to Catch-up meanwhile
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
    if (view !== 'week') return; // switched to Catch-up meanwhile
    if (start.getTime() === weekStart(weekOffset).getTime()) render(items, start, plans);
    // Rewatches seen for the first time: look them up, then show them.
    chaseLookups();
    // A new week starts at the top (with "Today", that's today itself); this week as a whole starts
    // at today, with the days before it a scroll up.
    if (!refresh) scrollToStart();
    resumeScroll();
    updateCatchupCount();
    readyNeighbours(start);
  } catch (e) {
    if (refresh && document.querySelector('#list .row')) {
      notice(`Der Zeitplan konnte nicht aktualisiert werden: ${e.message}. Es werden weiter die bisherigen Daten angezeigt.`);
      return;
    }
    $('list').innerHTML = failed(`Der Zeitplan konnte nicht geladen werden: ${e.message}`);
  }
}
$('list').addEventListener('click', e => { if (e.target.closest('.retry')) load(); });
// Phones show two people and "+3"; pressing it lists everyone, pressing again folds them back.
$('list').addEventListener('click', e => {
  const more = e.target.closest('.who-more');
  if (!more) return;
  const open = more.parentElement.classList.toggle('open');
  more.setAttribute('aria-expanded', open);
  more.textContent = open ? '–' : more.dataset.more;
});

// Which days of the week show: 'rest' (today to Sunday, how the page opens), 'today' (today only)
// or 'week' (all of it; the arrows always show whole weeks). The strip picks single days, the "Week" button
// is the whole week, and pressed again it's this week from today on, wherever the arrows have gone.
let range = 'rest';
// From the day strip: to that day, showing the whole week first if the day is hidden right now.
// A day in the strip: only that day is shown. Pressed again, the list goes back to the days around it.
let pickedDay = null;
function pickDay(iso) {
  const isToday = weekOffset === 0 && iso === isoDay(new Date());
  if (isToday ? range === 'today' : range === 'day' && pickedDay === iso) setRange(weekOffset === 0 ? 'rest' : 'week');
  else if (isToday) setRange('today');
  else { setRange('day'); pickedDay = iso; }
  enter = { y: 4 };
  load();
}
// One day shown: the day after or before it, on into the next or previous week.
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
}
setRange('rest');
// Back from a reload into a new version: the same week, and resumeScroll() puts the list back.
let resumeY = null;
try {
  const place = JSON.parse(sessionStorage.getItem('resumePlace'));
  sessionStorage.removeItem('resumePlace');
  if (place) { weekOffset = place.weekOffset; setRange(place.range); pickedDay = place.pickedDay; resumeY = place.y; }
} catch {}
function resumeScroll() {
  if (resumeY !== null) scrollTo(0, resumeY);
  resumeY = null;
}
$('prev').onclick = () => { weekOffset--; setRange('week'); enter = { x: -14 }; load(); };
$('next').onclick = () => { weekOffset++; setRange('week'); enter = { x: 14 }; load(); };
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
// Phones: swipe sideways over the week to change it. Not from the screen's edges (the phone's own
// back gesture) and not while editing (a card is being dragged then).
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
try { $('others').checked = localStorage.getItem('others') === '1'; } catch {}
$('others').onchange = () => {
  try { localStorage.setItem('others', $('others').checked ? '1' : '0'); } catch {}
  redraw(); // in place, no jump back to today
};

// ---------- Moved shows ----------
// moves.json on the site moves a show out of its Guckplan slot without touching the sheet:
// {updated, moves: [{show (norm of its sheet title), title, tag ('Sa.'), time ('21:00' or ''),
// week (that week's Monday, '2026-10-26', or '' = from now on)}]}. Everyone sees the moves; only
// a browser holding a GitHub key that may write to the site's repository gets "Move" (⚙ menu).
const MOVES_API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/moves.json';
let moves = [];
let movesKey = '';
try { movesKey = localStorage.getItem('movesKey') || ''; } catch {}
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
async function loadMoves() {
  let site = null, own = null;
  try {
    const res = await fetch('moves.json', { cache: 'no-cache' });
    site = res.status === 404 ? { moves: [] } : await res.json();
    setNote('moves', null);
  } catch {
    setNote('moves', `${unreachable('Die Seite')}: verschobene Serien konnten nicht geladen werden, daher stehen alle Serien in ihren Guckplan-Slots.`);
  }
  // Right after a move the site takes a minute to update: until then this browser's copy is newer
  try { own = JSON.parse(localStorage.getItem('movesOwn')); } catch {}
  const newest = own && (!site || Date.parse(own.updated) > Date.parse(site.updated)) ? own : site;
  moves = newest?.moves || [];
}
// The move for a show in the week starting `monday`: that week's own, else a lasting one
function moveFor(show, monday) {
  const key = norm(show.romaji || show.english);
  return moves.find(m => m.show === key && m.week === isoDay(monday)) || moves.find(m => m.show === key && !m.week);
}
async function saveMoves(next) {
  // Moves for weeks long gone are dropped along the way
  next = next.filter(m => !m.week || Date.parse(m.week) > Date.now() - 14 * 86400000);
  const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
  const current = await fetch(MOVES_API + '?ref=main', { headers, cache: 'no-store' });
  const sha = current.ok ? (await current.json()).sha : undefined;
  const file = { updated: new Date().toISOString(), moves: next };
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(file, null, 1) + '\n')));
  const res = await fetch(MOVES_API, { method: 'PUT', headers,
    body: JSON.stringify({ message: 'Move shows', content, branch: 'main', ...(sha && { sha }) }) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : `GitHub antwortet ${res.status}`);
  moves = next;
  try { localStorage.setItem('movesOwn', JSON.stringify(file)); } catch {}
}

// The ⚙ "Moving shows" entry only shows where a key is saved; the first time, open the site with
// #moves at the end of the address.
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
    $('keyMsg').textContent = 'Gespeichert. Mit „Plan bearbeiten“ über der Woche verschiebst du Serien.';
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

// ⇄ on a row: a new day and time, for this week or from now on; or back to the Guckplan slot
let moving = null, moveScope = 'week';
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
  openMoveDialog(b);
});
function openMoveDialog(b, destination = null) {
  if (!movesKey || !b) return;
  moving = { key: norm(b.dataset.moveTitle), name: b.dataset.moveName };
  const week = isoDay(weekStart(weekOffset));
  const mv = moves.find(m => m.show === moving.key && m.week === week) || moves.find(m => m.show === moving.key && !m.week);
  $('moveName').textContent = moving.name;
  $('moveFrom').textContent = mv ? `Verschoben ${mv.week ? 'für diese Woche' : 'ab jetzt immer'}; „Zurück“ setzt sie in den Guckplan-Slot zurück.` : `Guckplan: ${slotLabel({ tag: b.dataset.tag, time: b.dataset.time })}`;
  $('moveTag').value = b.dataset.tag || 'Mo.';
  $('moveTime').value = b.dataset.time || '';
  setMoveScope(mv && !mv.week ? 'always' : 'week');
  $('moveReset').hidden = !mv;
  $('moveMsg').textContent = '';
  if (destination) {
    $('moveTag').value = destination.tag;
    $('moveTime').value = destination.time;
    setMoveScope('week');
    $('moveMsg').textContent = destination.parallel ? 'Sie teilt sich dann den Slot mit der Zielserie. Speichern bestätigt das, oder wähle eine andere Zeit.' : 'Speichern bestätigt dieses Ziel.';
  }
  $('moveDlg').showModal();
}
async function storeMoves(next, done) {
  $('moveMsg').textContent = 'Speichert…';
  try {
    await saveMoves(next);
    $('moveDlg').close();
    notice(`${done} Alle sehen es in etwa einer Minute.`);
    load(true);
  } catch (e) { $('moveMsg').textContent = `Nicht gespeichert: ${e.message}`; }
}
$('moveSave').onclick = () => {
  const time = $('moveTime').value.trim();
  if (time && !parseTime(time)) { $('moveMsg').textContent = 'Uhrzeit wie 21:00, oder leer für den nächsten freien Slot.'; return; }
  const week = moveScope === 'week' ? isoDay(weekStart(weekOffset)) : '';
  const next = moves.filter(m => !(m.show === moving.key && m.week === week))
    .concat({ show: moving.key, title: moving.name, tag: $('moveTag').value, time, week });
  storeMoves(next, `${moving.name} verschoben auf ${slotLabel({ tag: $('moveTag').value, time })}${week ? ' (diese Woche)' : ''}.`);
};
$('moveReset').onclick = () => {
  const week = isoDay(weekStart(weekOffset));
  storeMoves(moves.filter(m => !(m.show === moving.key && (m.week === week || !m.week))), `${moving.name} is back in its Guckplan slot.`);
};

// The German links and the sheet's tab list, fetched side by side; load() waits for both.
const ready = Promise.all([
  loadFallbackLinks(),
  loadMoves(),
  fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json())
    .then(json => { streamsDe = json; }, e => {
      console.warn('streams-de.json not loaded:', e);
      setNote('streams', `${unreachable('Die Seite')}: die Stream-Daten wurden nicht geladen, daher kommen die Links von AniList, und Pausen und Rewatches fehlen.`);
    }),
  savedOrFresh('tabs', guckplanTabs, list => { tabs = list; load(true); })
    .then(list => { tabs = list; }, e => {
      console.warn('Sheet tabs not loaded:', e);
      setNote('tabs', `${unreachable('Google Sheets')}: die Liste der Guckplan-Tabs ist unbekannt, daher wird „${FALLBACK_TAB.name}“ angezeigt.`);
    }),
]);
// An AniList outage must not hold the independent schedule sources hostage.
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

// Home screen app: the service worker keeps the page fresh online and available offline.
// An installed app can stay open for days without reloading: whenever it's brought back, the browser
// looks for a new version. Once that has taken over, the page reloads into it the next time it's out of
// sight, on the same week and at the same place, unless something would be lost. The next visit has it either way.
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
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('No offline copy:', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) { updateWaiting = true; reloadWhenAway(); } });
}

function setMode(next) {
  mode = next;
  document.body.classList.toggle('solo', mode === 'solo');
  document.body.classList.toggle('group', mode === 'group');
  $('modeSolo').setAttribute('aria-pressed', mode === 'solo');
  $('modeGroup').setAttribute('aria-pressed', mode === 'group');
  try { localStorage.setItem('mode', mode); } catch {}
}
setMode(mode);

// Week, Catch-up (this season's shows) or Non-seasonal (older shows at your own pace); the last
// two both come from the AniList list and share its controls (body.catchup).
function listView() { return view === 'catchup' || view === 'pace'; }
function setView(next) {
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
// Catch-up layout (Per show | Single episodes), right in the controls row, saved per browser.
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
  try { localStorage.setItem('anilistUser', $('anilistUser').value.trim()); } catch {}
  load();
};
$('modeSolo').onclick = () => { setMode('solo'); redraw(); };
$('modeGroup').onclick = () => { setMode('group'); redraw(); };
// Group button: short summary of who's selected; opens the panel with everyone's names.
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
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  for (const [menu, button] of [['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
    if ($(menu).hidden) continue;
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

// The Solo dropdown in the chosen person's Guckplan color, and each name in the list in theirs
// (the list colors show where the browser allows styling them, e.g. on desktop).
function colorSolo() {
  const select = $('soloPerson');
  select.style.cssText = personStyle(select.value);
  for (const o of select.options) o.style.cssText = personStyle(o.value)
    .replace('--person:', 'background-color:').replace(';--person-text:', ';color:');
  applyAccent(); // the accent may follow the chosen person
}

// Solo dropdown and group toggles: one entry per person in the week's tab(s), rebuilt when the names change.
function fillPeople(people) {
  const select = $('soloPerson');
  if ([...select.options].map(o => o.value).join() !== people.join()) {
    select.replaceChildren(...people.map(p => new Option(p, p)));
    if (!people.includes(soloPerson) && people.length) soloPerson = people.includes(DEFAULT_PERSON) ? DEFAULT_PERSON : people[0];
    select.value = soloPerson;
  }
  colorSolo();
  const box = $('people');
  if ([...box.children].map(b => b.dataset.name).join() === people.join()) {
    for (const b of box.children) b.style.cssText = personStyle(b.dataset.name);
    return;
  }
  box.replaceChildren(...people.map(name => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.name = name;
    b.textContent = name;
    b.style.cssText = personStyle(name);
    b.setAttribute('aria-pressed', selectedPeople.has(name));
    b.onclick = () => {
      selectedPeople.has(name) ? selectedPeople.delete(name) : selectedPeople.add(name);
      b.setAttribute('aria-pressed', selectedPeople.has(name));
      try { localStorage.setItem('people', JSON.stringify([...selectedPeople])); } catch {}
      updateGroupButton();
      redraw();
    };
    return b;
  }));
}

// Last used service per show; refreshed URLs still come from the current stream data.
// Read-only navigation shortcuts: never hijack typing, native controls, dialogs or browser keys.
// The one help screen: the guide, with the shortcuts at its end. The ? key opens right at those.
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
$('helpDialog').addEventListener('close', () => helpReturnFocus?.focus({ preventScroll: true }));
for (const [id, key, hint] of [
  ['prev', 'ArrowLeft', 'Vorherige Woche (←)'], ['next', 'ArrowRight', 'Nächste Woche (→)'],
  ['viewWeek', '1', 'Zeitplan (1)'], ['viewCatchup', '2', 'Catch-up (2)'], ['viewPace', '3', 'Non-seasonal (3)'],
  ['modeSolo', 'G', 'Solo (G)'], ['modeGroup', 'G', 'Gruppe (G)'],
  ['searchButton', '/', 'Serien suchen (/)'], ['helpButton', 'Shift+/', 'Anleitung und Kürzel (?)'],
]) {
  $(id).setAttribute('aria-keyshortcuts', key);
  $(id).title = hint;
}
// J and K go through the shows: the selected one is the row that has the focus, so it wears the
// usual focus ring. Pauses have nothing to act on, and a per-episode head only heads its episodes.
function keyRows() {
  return [...document.querySelectorAll('#list .row:not(.pause):not(.show-head)')].filter(r => !r.closest('.hidden-by-search, details:not([open])'));
}
function selectRow(row) {
  row.tabIndex = -1;
  row.classList.add('selected-row');
  // Focusable only while selected, or a later mouse click would select it without showing it.
  // Switching to another window also blurs it, but it's still the active element: it stays selected.
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
  // Nothing selected yet: start from what's on screen, not from the top of the list
  const row = at < 0 ? rows.find(r => r.getBoundingClientRect().top >= headerBottom) || rows[0]
    : rows[Math.min(rows.length - 1, Math.max(0, at + by))];
  if (!row) return;
  selectRow(row);
  const box = row.getBoundingClientRect();
  const clear = headerBottom + (row.closest('.day')?.querySelector('h2')?.offsetHeight || 0) + 8;
  if (box.top < clear) scrollTo(0, scrollY + box.top - clear);
  else if (box.bottom > innerHeight - 8) scrollTo(0, scrollY + box.bottom - innerHeight + 8);
}
// Back from a stream, its row is still selected: W marks the episode, J and K go on from there.
// With "Mark on open" the episode is marked right away, unless it isn't out yet.
try { $('markOnOpen').checked = localStorage.getItem('markOnOpen') === '1'; } catch {}
$('markOnOpen').onchange = () => { try { localStorage.setItem('markOnOpen', $('markOnOpen').checked ? '1' : '0'); } catch {} };
document.addEventListener('click', event => {
  const row = event.target.closest?.('#list .row .links a')?.closest('.row');
  if (!row || !keyRows().includes(row)) return;
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
    // Only ever marks: a ticked one stays ticked, so a second press can't take it back
    const tick = selected.querySelector('.watch:not(.done):not(:disabled):not([data-select])');
    if (tick) action = () => tick.click();
  }
  else if (key === '/') action = () => openSearch(true);
  else if (key === '?') action = () => openHelp(true);
  else if (key === 't') action = () => { setView('week'); weekOffset = 0; setRange('today'); load(); };
  else if (['1', '2', '3'].includes(key)) action = () => $({ 1: 'viewWeek', 2: 'viewCatchup', 3: 'viewPace' }[key]).click();
  if (!action) return;
  event.preventDefault();
  action();
});

// Pair explicitly chosen accounts. Enabling a pair works from either side and never copies a list.
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
