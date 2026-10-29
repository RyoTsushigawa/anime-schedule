
const QUERY = `query ($page: Int, $from: Int, $to: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      airingAt episode
      media {
        id isAdult siteUrl
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
      try { localStorage.setItem('anilistAccounts', JSON.stringify(accounts)); } catch {}
      location.replace(back);
    }
  }
}
accounts = accounts.filter(a => !a.expires || a.expires > Date.now());
if (!auth) {
  let active = null;
  try { active = localStorage.getItem('anilistActive'); } catch {}
  auth = accounts.find(a => a.name === active) || accounts[0] || null;
}
function saveAccounts() {
  try {
    localStorage.setItem('anilistAccounts', JSON.stringify(accounts));
    localStorage.setItem('anilistActive', auth?.name || '');
  } catch {}
}
saveAccounts();
const myProgress = new Map(); // media id → episodes watched, for the logged-in viewer

// Week schedule or Catch-up (from an AniList list), remembered per browser.
const DEFAULT_ANILIST = 'RyoTsushigawa';
let view = 'week';
$('anilistUser').value = DEFAULT_ANILIST;
try {
  view = ['catchup', 'pace'].includes(localStorage.getItem('view')) ? localStorage.getItem('view') : 'week';
  $('anilistUser').value = localStorage.getItem('anilistUser') ?? DEFAULT_ANILIST;
} catch {}
let streamsDe = null; // streams-de.json: { generated, byAnilist: { anilistId: [{ name, url }] } }
let tabs = []; // Guckplan tabs, newest first
// Each tab's sheet: { people: [...], shows: [{ romaji, english, wo, tag, time, votes: { name: value } }] }

// AniList / LiveChart site name pattern → button label and colour. `wo` is the sheet's "Wo" code
// ("P" in the sheet means no legal stream, so it has no service here). `main` = a service the group
// has; everything else only shows with the "Other services" toggle.
const SERVICES = [
  { match: /crunchyroll/i, label: 'Crunchyroll', color: '#f47521', wo: 'C', main: true, search: 'https://www.crunchyroll.com/search?q=' },
  { match: /netflix/i, label: 'Netflix', color: '#e50914', wo: 'N', main: true, search: 'https://www.netflix.com/search?q=' },
  { match: /amazon|prime video/i, label: 'Prime Video', color: '#1a98ff', wo: 'AM', main: true, search: 'https://www.primevideo.com/search/?phrase=' },
  { match: /youtube/i, label: 'YouTube', color: '#ff0033', wo: 'Y', main: true },
  { match: /disney/i, label: 'Disney+', color: '#113ccf', wo: 'D+', main: true, search: 'https://www.disneyplus.com/search?q=' },
  { match: /hidive/i, label: 'HIDIVE', color: '#00aeef', wo: 'H' },
  { match: /^adn$|animation digital network/i, label: 'ADN', color: '#0096d6', wo: 'ADN' },
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
const unreachable = name => navigator.onLine === false ? "You're offline" : `${name} didn't answer`;
const savedAt = time => new Date(time).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
function notesHtml(scoped = []) {
  const lines = new Set([...dataNotes].filter(([k]) => !k.includes(':') || scoped.includes(k)).map(([, t]) => t));
  return lines.size ? `<div class="datanote" role="status">${[...lines].map(t => `<div>${esc(t)}</div>`).join('')}</div>` : '';
}
// A load that failed with nothing saved to show instead: the reason and a way to try again
const failed = text => `<div class="status">${esc(text)}<br><button class="pill retry">Try again</button></div>`;

const sheets = new Map();
// A tab's Guckplan: the last copy shown in this browser at once, then the current one when it arrives.
// Comes with `catalog`, the season's full show list, for looking up names people abbreviate.
const sheetFor = tab => {
  const key = tab.gid + ':' + (tab.catalogGid || '');
  if (!sheets.has(key)) {
    const onChange = fresh => { sheets.set(key, Promise.resolve(fresh)); load(true); };
    const onFresh = e => { if (setNote('sheet ' + tab.gid, e && `${unreachable('Google Sheets')}: “${tab.name}” as last saved in this browser.`)) load(true); };
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
      storeWeek(storeKey, items);
      const noted = setNote(storeKey, null);
      if (JSON.stringify(items) !== JSON.stringify(saved.items)) {
        cache.set(start.getTime(), Promise.resolve(items));
        load(true);
      } else if (noted) load(true);
    }, () => { if (setNote(storeKey, `${unreachable('AniList')}: airings as saved ${savedAt(saved.time)}.`)) load(true); });
    return saved.items;
  }
  let items;
  try {
    items = await downloadAirings(start);
  } catch (e) {
    throw new Error(navigator.onLine === false ? "You're offline, and this week isn't saved in this browser yet."
      : "AniList isn't answering right now (it limits how often it can be asked). Try again in a minute.");
  }
  storeWeek(storeKey, items);
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
    const data = await anilist(QUERY, { page, from, to });
    items.push(...data.Page.airingSchedules);
    if (!data.Page.pageInfo.hasNextPage) return items;
  }
}

// The owner gets a ⇄ on each show to move it (others just see it in its new place).
const slotLabel = s => [s?.tag, s?.time].filter(Boolean).join(' ') || 'no day';
const moveButton = (show, slot) => !movesKey || !show ? '' :
  `<button class="move" data-move-title="${esc(show.romaji || show.english)}" data-move-name="${esc(show.english || show.romaji)}"
    data-tag="${esc(slot?.tag || '')}" data-time="${esc(slot?.time || '')}" data-moved="${slot?.from ? 1 : ''}" title="Move to another day or time (everyone sees it)">⇄</button>`;

// Why a show has a break: LiveChart's timetable note for that week, else its newest break
// headline (linked), else `none` (already HTML). A note is cut down to its cause ("…no broadcast
// today due to sports coverage." → "sports coverage"); otherwise its "today" becomes its day.
const noteReason = note => note.text.match(/\b(?:due to|because of)\s+(.+?)\.?$/i)?.[1]
  || note.text.replace(/\btoday\b/i, 'on ' + new Date(note.at * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
const reasonHtml = (note, news, none) => note
  ? esc(noteReason(note))
  : news?.length ? `<a href="${safeUrl(news[0].url)}" target="_blank" rel="noopener">${esc(news[0].title)}</a>` : none;

// When the weekly LiveChart data is out of date (its "next episode" has already passed), AniList's
// next airing episode decides whether a show has a break: AniList id → {episode, at} (null = none
// scheduled), kept 6 hours; ids still waiting for a lookup are collected in render().
const NEXT_KEEP_MS = 6 * 3600000;
const aniNext = new Map();
const pendingNext = new Set();
function nextFromAniList(id) {
  if (!aniNext.has(id)) {
    try {
      const saved = JSON.parse(localStorage.getItem('next:' + id));
      if (saved && Date.now() - saved.time < NEXT_KEEP_MS) aniNext.set(id, saved.next);
    } catch {}
  }
  if (!aniNext.has(id)) pendingNext.add(id);
  return aniNext.get(id);
}
async function lookUpNext() {
  const ids = [...pendingNext];
  pendingNext.clear();
  let media = [];
  try {
    media = (await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id nextAiringEpisode { episode airingAt } } } }',
      { ids: ids.map(Number) })).Page.media;
  } catch {
    for (const id of ids) aniNext.set(id, 'failed'); // AniList busy: listed as unknown this visit
    return;
  }
  for (const id of ids) {
    const n = media.find(m => String(m.id) === String(id))?.nextAiringEpisode;
    const next = n ? { episode: n.episode, at: n.airingAt } : null;
    aniNext.set(id, next);
    try { localStorage.setItem('next:' + id, JSON.stringify({ time: Date.now(), next })); } catch {}
  }
}

// Older shows in the plan (rewatches): looked up on AniList by title once, kept for 7 days.
// title → media, null = not found; shows still waiting for a lookup are collected in render().
const rewatchMedia = new Map();
const pendingRewatch = new Set();
const REWATCH_QUERY = `query ($search: String) {
  Media(search: $search, type: ANIME) {
    id status siteUrl title { romaji english } coverImage { medium } externalLinks { site url }
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
function streamLinks(media, wo, searchTitle) {
  const links = [];
  // German availability from LiveChart (tools/build-streams.mjs) wins over AniList's worldwide links.
  const de = streamsDe?.byAnilist[media.id];
  if (de?.length) {
    for (const { name, url, extra } of de) {
      const s = SERVICES.find(s => s.match.test(name));
      // Needs an add-on channel we don't have (e.g. Prime Video + aniverse): counts as another service.
      const label = (s?.label || name) + (extra ? ' + ' + extra : '');
      if (!links.some(l => l.url === url))
        links.push({ url, label, color: s?.color || '#5b5b66', main: !!s?.main && !extra, first: !!s && s.wo === wo && !extra });
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
    links.unshift({ url: service.search + encodeURIComponent(searchTitle), label: service.label + ' 🔍', color: service.color, main: !!service.main, first: true });
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
let resumeServices = {};
try { resumeServices = JSON.parse(localStorage.getItem('resumeServices')) || {}; } catch {}
const serviceKey = label => label.replace(/ 🔍$/, '');
function linkButtons(links, mediaId) {
  const preferred = $('resumeWatching').checked ? resumeServices[mediaId] : null;
  const attrs = l => `data-stream-show="${Number(mediaId)}" data-stream-service="${esc(serviceKey(l.label))}"`;
  const label = l => esc(l.label) + (serviceKey(l.label) === preferred ? ' · Resume' : '');
  const button = l => l.main
    ? `<a class="cr" style="background:${l.color}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" ${attrs(l)}>${label(l)}</a>`
    : `<a class="cr other" style="color:${l.color};border-color:${l.color}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Available, but not a service we have" ${attrs(l)}>${label(l)}</a>`;
  const shown = links.filter(l => l.main || $('others').checked).sort((a, b) => Number(serviceKey(b.label) === preferred) - Number(serviceKey(a.label) === preferred));
  // The piracy label is a rickroll, nothing more.
  if (!shown.length) return '<a class="cr none" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener" title="Not on any streaming service">Piracy</a>';
  return shown.map(button).join('');
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
    none.textContent = `No show matches “${$('search').value.trim()}”${view === 'week' ? ' this week' : ''}.`;
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
  $('search').blur();
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
// they fade while the page stays open.
function tick() {
  const now = Date.now();
  for (const r of document.querySelectorAll('.row[data-fade-at]'))
    r.classList.toggle('aired', now >= Number(r.dataset.fadeAt));
}
setInterval(tick, 30000);

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


// plans: Map tab gid → sheet, for every Guckplan tab that can be active this week.
function render(items, start, plans) {
  // Shows any selected person watches (solo: one person, group: the toggled ones); nobody = nothing.
  const people = activePeople();
  if (!people.length) {
    $('list').innerHTML = '<div class="status">Pick at least one person above.</div>';
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
  const whoChips = who => showWho && who?.length
    ? `<span class="who">${who.map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span>` : '';
  const found = new Set();
  const today = new Date().toDateString();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push({ date: d, rows: [] });
  }
  // A sheet show only links to its best-matching AniList entries, so spin-off mini anime
  // ("… Mini Anime" synonyms) don't tag along with the main show.
  const score = (s, m) => titleScore([s.romaji, s.english], mediaTitles(m));
  const best = new Map();
  // A tab's shows, plus catalog entries someone named that have no Guckplan row of their own.
  const showsOf = sheet => sheet ? [...sheet.shows, ...[...chosen.get(sheet).keys()].filter(s => !sheet.shows.includes(s))] : [];
  for (const sheet of plans.values())
    for (const s of showsOf(sheet)) best.set(s, Math.max(0, ...items.map(it => score(s, it.media))));
  for (const it of items) {
    const m = it.media;
    if (m.isAdult) continue;
    // When it comes out on our service (LiveChart's offset to Japanese TV), else AniList's TV time.
    const when = new Date((it.airingAt + (streamsDe?.release?.[m.id]?.offset || 0)) * 1000);
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
    const links = streamLinks(m, show.wo, m.title.english || m.title.romaji);
    const day = days.find(d => d.date.toDateString() === watchDay(when, slot.tag, slot.time).toDateString());
    if (!day) continue;
    found.add(show);
    // One entry per show and week; several episodes (batch drops, double episodes) are merged.
    const existing = days.flatMap(d => d.rows).find(r => r.m.id === m.id);
    if (existing) existing.episodes.push(it.episode);
    else day.rows.push({ it, m, links, when, slot, show, episodes: [it.episode], who: whoBySheet.get(sheet).get(show) });
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
  const busy = () => `${unreachable('AniList')}, so it's unknown whether it airs`;
  // Without the LiveChart data (streams-de.json didn't load) breaks and rewatches can't be told
  // from finished shows: none are guessed (the note at the top says so).
  for (const [show, slot] of !streamsDe ? [] : [...weekTabs].flatMap(gid => plans.has(gid) ? [...chosen.get(plans.get(gid))] : [])) {
    if (found.has(show)) continue;
    // The same show listed twice in the sheet, already on the schedule through its other row.
    if ([...found].some(f => titleMatches([f.romaji, f.english], [show.romaji, show.english]))) continue;
    const [alId, status] = Object.entries(streamsDe?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles)) || [];
    let upcoming = status?.next;
    // LiveChart's next episode already passed: the weekly data is behind, AniList knows better
    if (upcoming && upcoming.at * 1000 < days[0].date.getTime()) {
      const fresh = nextFromAniList(alId);
      if (fresh === undefined) { unknown.push({ show, why: 'checking AniList…' }); continue; }
      if (fresh === 'failed') { unknown.push({ show, why: busy() }); continue; }
      upcoming = fresh && { episode: fresh.episode, at: fresh.at + (streamsDe?.release?.[alId]?.offset || 0) };
    }
    if (status && !upcoming) continue; // finished
    const day = days.find(d => WEEKDAYS.indexOf(norm(slot.tag).slice(0, 2)) === (d.date.getDay() + 6) % 7);
    if (!day || weekEnd < Date.now()) { unknown.push({ show }); continue; }
    const next = upcoming && new Date(upcoming.at * 1000);
    if (next && next >= weekEnd) {
      // The reason: LiveChart's timetable note for this week ("no broadcast today due to sports
      // coverage"), else its newest break headline
      const note = (status.notes || []).find(n => n.at * 1000 >= days[0].date.getTime() - 86400000 && n.at * 1000 < weekEnd);
      const why = { note: note || null, news: status.news || [] };
      day.rows.push({ pause: true, show, slot, when: next, episode: upcoming.episode, ...why });
      breaks.push({ show, when: next, episode: upcoming.episode, ...why });
      found.add(show);
      continue;
    }
    const media = !status && rewatchFor(show);
    if (media === 'failed') unknown.push({ show, why: busy() });
    else if (media && media.status === 'FINISHED') {
      const links = streamLinks(media, show.wo, media.title.english || media.title.romaji);
      day.rows.push({ rewatch: true, m: media, links, slot, when: day.date });
      found.add(show);
    } else unknown.push({ show, why: media === undefined ? 'checking AniList…' : '' });
  }
  for (const d of days) assignWatchTimes(d);

  // Opened or "From today" pressed: the week starts with today, the days already past are left
  // out; "Today": today only. With the arrows it's always the whole week, and while searching too
  // (so a show that aired earlier this week is found).
  const todayIndex = days.findIndex(d => d.date.toDateString() === today);
  const ordered = searching() || todayIndex < 0 || range === 'week' ? days
    : range === 'today' ? [days[todayIndex]] : days.slice(todayIndex);
  let html = ordered.map(({ date, rows }) => {
    const heading = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    // Rows without a ✓ keep its place, so every row's buttons line up.
    const checkSpace = auth ? '<div class="watch-space"></div><div class="drop-space"></div>' : '';
    // The reason: the newest LiveChart headline about the break (linked to the article), or a
    // note that none was announced.
    const pause = ({ show, slot, when, episode, note, news }) => `
      <div class="row pause" ${searchKey(show.english, show.romaji)}>
        <div class="time">Pause</div>
        <div class="info">
          <div class="title">${esc(show.english || show.romaji)}</div>
          <div class="ep">No episode this week · ${episode ? `episode ${episode} ` : ''}${episode ? 'on' : 'back'} ${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <div class="ep reason">${reasonHtml(note, news, 'No reason announced on LiveChart')}</div>
        </div>
        <div class="links"></div>
        ${checkSpace}${moveButton(show, slot)}
      </div>`;
    const rewatch = ({ m, links, watchAt }) => `
      <div class="row" data-fade-at="${watchAt}" ${searchKey(m.title.english, m.title.romaji)}>
        <div class="time">Rewatch</div>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">Rewatch</div>
        </div>
        <div class="links">${linkButtons(links, m.id)}</div>
        ${checkSpace}${movesKey ? '<div class="move-space"></div>' : ''}
      </div>`;
    const row = r => r.pause ? pause(r) : r.rewatch ? rewatch(r) : episodeRow(r);
    // ⚙ Time: the release ("Wed 15:00"), the watch time from the Guckplan ("19:30"), or both.
    const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const timeCell = (when, watchAt) => {
      const release = `${when.toLocaleDateString(undefined, { weekday: 'short' })} ${hm(when)}`;
      const watch = hm(new Date(watchAt));
      return choices.time === 'watch' ? watch
        : choices.time === 'both' ? `${watch}<small>out ${release}</small>` : release;
    };
    const episodeRow = ({ it, m, links, when, watchAt, episodes, who, slot, show }) => `
      <div class="row" data-at="${when.getTime()}" data-fade-at="${Math.max(when.getTime(), watchAt)}" ${searchKey(...mediaTitles(m))}>
        <div class="time">${timeCell(when, watchAt)}</div>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">${episodes.length > 1 ? `Episodes ${Math.min(...episodes)}–${Math.max(...episodes)}` : `Episode ${it.episode}`}${whoChips(who)}</div>
        </div>
        <div class="links">${linkButtons(links, m.id)}</div>
        ${watchButton(m.id, Math.max(...episodes))}${auth ? dropButton(m.id) : ''}${moveButton(show, slot)}
      </div>`;
    // Shows sharing a watch slot (e.g. one watched instead of the other) go into one card.
    const groups = [];
    for (const r of rows) {
      if (groups.at(-1)?.[0].watchAt === r.watchAt) groups.at(-1).push(r);
      else groups.push([r]);
    }
    const body = groups.length
      ? groups.map(g => g.length > 1 ? `<div class="shared">${g.map(row).join('')}</div>` : row(g[0])).join('')
      : '<div class="ep" style="padding:0 10px">Nothing airing</div>';
    return `<section class="day${date.toDateString() === today ? ' is-today' : ''}"><h2>${heading}</h2>${body}</section>`;
  }).join('');

  // Only when the weekly refresh seems to have stopped (PC task, GitHub token, LiveChart changes).
  const age = streamsDe?.generated && Math.floor((Date.now() - Date.parse(streamsDe.generated)) / 86400000);
  if (age >= 14) html = `<div class="notice">Stream links were last updated ${age} days ago; the weekly refresh may have stopped.</div>` + html;
  // At the very top, in red, one line per show: breaks with the reason (the newest LiveChart
  // headline about it, linked) and when it's back, then plan shows that couldn't be placed.
  const dayName = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const lines = [
    ...breaks.map(b => `<div><b>${esc(b.show.english || b.show.romaji)}</b> isn't airing this week → ${reasonHtml(b.note, b.news,
      '<span class="why">no reason announced on LiveChart</span>')} · ${b.episode ? `episode ${b.episode} on` : 'back'} ${dayName(b.when)}</div>`),
    ...unknown.map(({ show: s, why }) => `<div><b>${esc(s.english || s.romaji)}</b> isn't airing this week → <span class="why">${esc(why || "nothing found for it this week (or couldn't be matched)")}</span></div>`),
  ];
  if (lines.length) html = `<div class="alerts" role="status">${lines.join('')}</div>` + html;
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
    setNote(key, `${unreachable('AniList')}: ${user}'s list as saved ${savedAt(saved.time)}.`);
    return saved.entries;
  }
}

// ---------- Writing to AniList (when connected) ----------

async function anilistAsMe(query, variables = {}) {
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
  accounts = accounts.filter(a => a !== auth);
  useAccount(accounts[0] || null);
}

// Make an account the active one: ✓ and Catch-up then use its list.
function useAccount(account) {
  auth = account;
  myProgress.clear();
  saveAccounts();
  if (auth?.name) {
    $('anilistUser').value = auth.name;
    try { localStorage.setItem('anilistUser', auth.name); } catch {}
  }
  updateConnect();
  if (auth) loadMe().catch(e => console.warn('AniList account not loaded:', e)).then(() => load(true));
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
  button.title = auth?.name ? `AniList: ${auth.name}` : 'AniList';
  // A pill: optionally the account's picture or initial, then the text.
  const item = (text, onclick, { account = null, muted = false, current = false } = {}) => {
    const b = document.createElement('button');
    b.className = (muted ? 'muted' : '') + (current ? ' current' : '');
    if (account) b.append(avatarOf(account, 'avatar'));
    b.append(text);
    b.onclick = onclick;
    return b;
  };
  const row = (...pills) => {
    const div = document.createElement('div');
    div.className = 'pill-row';
    div.append(...pills);
    return div;
  };
  $('accountSection').replaceChildren(...(!auth ? [item('+ Connect AniList', connect, { muted: true })] : [
    ...accounts.map(a => item(a.name || 'AniList', () => a !== auth && useAccount(a), { account: a, current: a === auth })),
    row(item('+ Add', connect, { muted: true }), item('Log out', disconnect, { muted: true })),
  ]));
}

// ⚙ and the AniList button open and close their menus; a click anywhere else closes them.
function showMenu(menu, button, open) {
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

// Theme: follows the system until the sun/moon is clicked, then Light or Dark, remembered per
// browser. data-dark marks the theme actually showing (for the icon).
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let theme = 'auto';
function setTheme(choice) {
  theme = choice === 'light' || choice === 'dark' ? choice : 'auto';
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.documentElement.toggleAttribute('data-dark', theme === 'dark' || (theme === 'auto' && systemDark.matches));
  try { localStorage.setItem('theme', theme); } catch {}
}
try { theme = localStorage.getItem('theme') || 'auto'; } catch {}
setTheme(theme);
systemDark.addEventListener('change', () => setTheme(theme));
$('themeButton').onclick = () => setTheme(document.documentElement.hasAttribute('data-dark') ? 'light' : 'dark');

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
// The accent color ("person": the Solo person's Guckplan color, orange until it's known), today's
// header tinted with it, and black or white text on it, whichever reads better.
function applyAccent() {
  const root = document.documentElement.style;
  const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
  const c = (choices.accent === 'person' ? hex(personColor.get(soloPerson)) : hex(choices.accent)) || '#f47521';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  root.setProperty('--accent', c);
  root.setProperty('--accent-text', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff');
  root.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
}
for (const name of Object.keys(choices)) setChoice(name, choices[name]);
for (const b of document.querySelectorAll('[data-set]'))
  b.onclick = () => {
    setChoice(b.dataset.set, b.dataset.value);
    if (b.dataset.set !== 'accent') load(true);
  };

// ⚙ Show: the Drop buttons and the ⇄ (owner only) can be hidden; both on unless switched off.
for (const [id, cls] of [['dropButtons', 'no-drop'], ['moveButtons', 'no-move']]) {
  try { $(id).checked = localStorage.getItem(id) !== '0'; } catch { $(id).checked = true; }
  document.body.classList.toggle(cls, !$(id).checked);
  $(id).onchange = () => {
    try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch {}
    document.body.classList.toggle(cls, !$(id).checked);
  };
}

// "Who's watching": name chips of everyone watching each show; on unless switched off.
try { $('who').checked = localStorage.getItem('who') !== '0'; } catch { $('who').checked = true; }
$('who').onchange = () => {
  try { localStorage.setItem('who', $('who').checked ? '1' : '0'); } catch {}
  load(true);
};

// Refresh data: forget the saved copies (weeks, sheet, AniList lists, rewatch and next-episode
// lookups) and load everything fresh, in place: same view, week, people and settings, and the row
// at the top of the screen stays there. What's on screen stays until the new data is in; if
// anything fails, the copies from before come back and a short notice says so.
const FRESH_KEYS = /^(week:|sheet:|list:|rewatch:|next:|tabs$)/;
let refreshing = false;
// The first row under the header (by its titles and day), to find it again after redrawing
function scrollAnchor() {
  const below = document.querySelector('header').getBoundingClientRect().bottom;
  const row = [...document.querySelectorAll('#list [data-search]:not(.hidden-by-search)')].find(r => r.getBoundingClientRect().bottom > below);
  return row ? { key: row.dataset.search, day: row.closest('.day')?.querySelector('h2')?.textContent, top: row.getBoundingClientRect().top } : { y: scrollY };
}
function restoreAnchor(a) {
  const rows = [...document.querySelectorAll('#list [data-search]')];
  const row = a.key && (rows.find(r => r.dataset.search === a.key && r.closest('.day')?.querySelector('h2')?.textContent === a.day)
    || rows.find(r => r.dataset.search === a.key));
  if (row) scrollBy(0, row.getBoundingClientRect().top - a.top);
  else if (a.y !== undefined) scrollTo(0, a.y);
}
$('refreshData').onclick = async () => {
  if (refreshing) return;
  refreshing = true;
  $('refreshData').disabled = true;
  $('settingsMenu').hidden = true;
  $('settingsButton').setAttribute('aria-expanded', 'false');
  const anchor = scrollAnchor();
  // Everything that's about to be replaced, to put back if the refresh fails
  const kept = {};
  try { for (const k of Object.keys(localStorage)) if (FRESH_KEYS.test(k)) { kept[k] = localStorage.getItem(k); localStorage.removeItem(k); } } catch {}
  const memory = { weeks: new Map(cache), sheetsCopy: new Map(sheets), rewatch: new Map(rewatchMedia), next: new Map(aniNext), streams: streamsDe, moved: moves, tabList: tabs, plans: { ...planShowsCache } };
  cache.clear(); sheets.clear(); rewatchMedia.clear(); aniNext.clear(); planShowsCache.time = 0;
  notice('Refreshing…');
  try {
    const res = await fetch('streams-de.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`stream data: ${res.status}`);
    streamsDe = await res.json();
    setNote('streams', null);
    await loadMoves();
    if (auth) await loadMe().catch(() => {}); // ticks from elsewhere (AniList itself, the phone)
    tabs = await guckplanTabs();
    setNote('tabs', null);
    try { localStorage.setItem('tabs', JSON.stringify(tabs)); } catch {}
    await load(true, true);
    restoreAnchor(anchor);
    notice('Data refreshed');
  } catch (e) {
    try { for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v); } catch {}
    cache.clear(); for (const [k, v] of memory.weeks) cache.set(k, v);
    sheets.clear(); for (const [k, v] of memory.sheetsCopy) sheets.set(k, v);
    for (const [k, v] of memory.rewatch) rewatchMedia.set(k, v);
    for (const [k, v] of memory.next) aniNext.set(k, v);
    streamsDe = memory.streams; moves = memory.moved; tabs = memory.tabList; planShowsCache = memory.plans;
    await load(true).catch(() => {});
    restoreAnchor(anchor);
    notice(`Couldn't refresh (${e.message}); still showing the data from before.`);
  }
  $('refreshData').disabled = false;
  refreshing = false;
};

// Who's logged in and how far they are in each show (their Watching/Rewatching list).
async function loadMe() {
  if (!auth) return;
  // The account's picture for the AniList button (accounts saved before it was asked get it once).
  if (auth.name && auth.avatar === undefined) {
    auth.avatar = (await anilistAsMe('{ Viewer { avatar { medium } } }')).Viewer.avatar?.medium || '';
    saveAccounts();
    updateConnect();
  }
  if (!auth.name) {
    const { Viewer } = await anilistAsMe('{ Viewer { name avatar { medium } } }');
    auth.name = Viewer.name;
    auth.avatar = Viewer.avatar?.medium || '';
    // Logged in again with an account that was already saved: keep the new login only.
    accounts = accounts.filter(a => a === auth || a.name !== auth.name);
    saveAccounts();
    // A new login: Catch-up shows their own list.
    $('anilistUser').value = auth.name;
    try { localStorage.setItem('anilistUser', auth.name); } catch {}
    updateConnect();
  }
  for (const { progress, status, media } of await anilistList(auth.name)) {
    myProgress.set(media.id, progress);
    knownEntries.set(media.id, { progress, status });
  }
  // Dropped shows too, so the Week view shows "Dropped" instead of a Drop button for them.
  try {
    const dropped = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: DROPPED) {
      lists { entries { progress status media { id } } } } }`, { user: auth.name });
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
  try {
    const done = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: COMPLETED) {
      lists { entries { progress status score completedAt { year month day }
        media { id siteUrl synonyms title { romaji english } coverImage { medium } } } } } }`, { user: auth.name });
    const entries = done.MediaListCollection.lists.flatMap(l => l.entries);
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
  const entry = (await anilistAsMe('query ($id: Int) { Media(id: $id) { mediaListEntry { progress status score } } }', { id: mediaId })).Media.mediaListEntry;
  return entry ? { onList: true, progress: entry.progress, status: entry.status, score: entry.score } : { onList: false };
}
const entryBefore = entryNow;

// Every change goes through here and returns what's needed to undo it. Progress on a show that
// isn't on the Watching list (not on the list at all, or Planning/Paused/Completed/Dropped) also
// sets it to Watching; otherwise AniList keeps it elsewhere and the page, which reads the Watching
// list, shows it as unwatched again after a reload. (A show still airing can be on Completed by
// mistake; AniList moves it to Completed by itself once the last episode is ticked.)
const ON_WATCHING_LIST = ['CURRENT', 'REPEATING'];
async function change(mediaId, vars) {
  const before = await entryBefore(mediaId);
  const status = vars.status || (vars.progress !== undefined && !ON_WATCHING_LIST.includes(before.status) ? 'CURRENT' : undefined);
  const saved = (await anilistAsMe(SAVE_PROGRESS, { mediaId, ...vars, status })).SaveMediaListEntry;
  knownEntries.set(mediaId, { progress: saved.progress, status: saved.status, score: saved.score });
  notOnList.delete(mediaId);
  myProgress.set(mediaId, saved.progress);
  listChanged(mediaId, saved.progress, !!status);
  return { mediaId, before, after: { progress: saved.progress, status: saved.status, score: saved.score }, entryId: saved.id };
}

// Keep the saved Watching list in step, so Catch-up shows changes right away; a status change
// means the list itself changed, so it's fetched again.
function listChanged(mediaId, progress, statusChanged) {
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
  undoSteps.push({ records, time: Date.now(), token: auth.token, name: auth.name || 'the other account' });
  notice(text, true);
}
let undoing = false;
async function undo() {
  if (!auth || undoing) return;
  const last = undoSteps.at(-1);
  if (!last) return;
  if (Date.now() - last.time > UNDO_MS) { undoSteps.length = 0; notice('Too late to undo; change it on AniList instead.'); return; }
  if (last.token !== auth.token) { notice(`Made with ${last.name}: switch back to that account to undo it.`); return; }
  undoSteps.pop();
  undoing = true;
  notice('Undoing…');
  const left = [...last.records]; // newest change first comes off the end
  let done = 0, elsewhere = 0, failed = null;
  while (left.length) {
    const { mediaId, before, after, entryId } = left.at(-1);
    try {
      const now = await entryNow(mediaId);
      if (!now.onList || now.progress !== after.progress || now.status !== after.status || now.score !== after.score) elsewhere++;
      else {
        if (before.onList) {
          await anilistAsMe(SAVE_PROGRESS, { mediaId, progress: before.progress, status: before.status, score: before.score });
          knownEntries.set(mediaId, { progress: before.progress, status: before.status, score: before.score });
          myProgress.set(mediaId, before.progress);
        } else {
          await anilistAsMe('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entryId });
          knownEntries.delete(mediaId);
          notOnList.add(mediaId);
          myProgress.delete(mediaId);
        }
        listChanged(mediaId, before.progress || 0, true);
        done++;
      }
    } catch (err) { failed = err; break; }
    left.pop(); // this show is settled (put back, or changed elsewhere)
    if (left.length) await new Promise(r => setTimeout(r, 700));
  }
  const parts = [];
  if (done) parts.push(last.records.length > 1 ? `Undone for ${done}` : 'Undone');
  if (elsewhere) parts.push(`${elsewhere === 1 ? (done || failed ? 'one show was' : 'This show was') : `${elsewhere} shows were`} changed elsewhere meanwhile and left as is`);
  if (failed) {
    // The rest stays for another try (same account, same 10 minutes)
    undoSteps.push({ ...last, records: left });
    parts.push(`${left.length === 1 ? 'one show is' : `${left.length} shows are`} still to undo (${failed.message})`);
  }
  const text = parts.join('; ');
  notice(text.charAt(0).toUpperCase() + text.slice(1) + '.', !!failed);
  undoing = false;
  load(true);
}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
  if (e.target.closest?.('input, textarea, select')) return; // typing: the field's own undo
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
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, withUndo ? 8000 : 3000);
}
$('noticeUndo').onclick = () => undo();
const rowTitle = el => el.closest('.shared, .row')?.querySelector('.title')?.textContent.trim() || 'show';
const watchButton = (mediaId, episode, add = false) => !auth ? '' :
  `<button class="watch${(myProgress.get(mediaId) || 0) >= episode ? ' done' : ''}" data-media="${mediaId}" data-ep="${episode}"${add ? ' data-add="1"' : ''}
    title="Episode ${episode} watched (AniList)">✓</button>`;

// ✓ sets the AniList progress to that episode; clicking a ticked one undoes it (back to what it
// was before this visit's tick, else one episode back).
const before = new Map();
$('list').addEventListener('click', async e => {
  const b = e.target.closest('.watch');
  if (!b || !auth || b.dataset.select) return; // while selecting, ✓ only picks
  const mediaId = Number(b.dataset.media), episode = Number(b.dataset.ep);
  const current = myProgress.get(mediaId) || 0;
  let progress;
  if (current >= episode) progress = before.has(mediaId) ? before.get(mediaId) : episode - 1;
  else { before.set(mediaId, current); progress = episode; }
  b.disabled = true;
  const title = rowTitle(b);
  try {
    const record = await change(mediaId, { progress, status: b.dataset.add ? 'CURRENT' : undefined });
    remember([record], `${title}: episode ${progress} watched`);
    // The last episode: AniList set it to Completed, so ask for the score right away
    if (record.after.status === 'COMPLETED' && record.before.status !== 'COMPLETED' && !record.after.score) {
      openScore(mediaId, title);
      loadToScore().then(() => load(true));
    }
  } catch (err) {
    b.title = `Couldn't save: ${err.message}`;
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
  return `<button class="score${score ? ' scored' : ''}" data-score-media="${mediaId}" title="${score ? 'Change the score' : 'Score it'} on AniList">${score ? esc(showScore(score)) : '★ Score'}</button>`;
};
let scoring = null; // { mediaId, title }
function openScore(mediaId, title) {
  scoring = { mediaId, title };
  showSettings(false);
  showMenu('accountMenu', 'accountButton', false);
  const format = scoreFormat();
  const current = knownEntries.get(mediaId)?.score || 0;
  $('scoreName').textContent = title;
  $('scoreMsg').textContent = '';
  $('scoreClear').hidden = !current;
  $('scoreSave').hidden = !['POINT_100', 'POINT_10_DECIMAL'].includes(format); // buttons save by themselves
  const box = $('scoreInput');
  if (format === 'POINT_100' || format === 'POINT_10_DECIMAL') {
    // 100 points: whole numbers from 1. 10 points with decimals: the arrows step by .5, but any one
    // decimal (8.3) is fine, as on AniList.
    const max = format === 'POINT_100' ? 100 : 10;
    box.innerHTML = `<input id="scoreValue" type="number" min="${max === 100 ? 1 : 0.5}" max="${max}" step="${max === 100 ? 1 : 0.5}"
      inputmode="decimal" value="${current || ''}" placeholder="${max === 100 ? 1 : 0.5}–${max}" aria-label="Score out of ${max}"><span class="muted">/ ${max}</span>`;
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
  $('scoreMsg').textContent = 'Saving…';
  try {
    const record = await change(mediaId, { score });
    $('scoreDlg').close();
    toScore = toScore.filter(t => t.media.id !== mediaId || !score);
    remember([record], score ? `${title}: scored ${showScore(record.after.score)}` : `${title}: score removed`);
    load(true);
  } catch (e) { $('scoreMsg').textContent = `Not saved: ${e.message}`; }
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
  if (!input.value || !(v >= Number(input.min) && v <= Number(input.max))) { $('scoreMsg').textContent = `A score from ${input.min} to ${input.max}.`; return; }
  saveScore(v);
};
$('scoreDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'scoreValue') { e.preventDefault(); $('scoreSave').click(); } });
$('scoreClear').onclick = () => saveScore(0);

// "Drop" in Catch-up: sets the show to Dropped on AniList, so it leaves Catch-up (and doesn't come
// back as a forgotten Guckplan show). The first click only asks.
// Already dropped (e.g. from the Week view, where dropped shows stay as long as the Guckplan lists
// them): a quiet "Dropped" in its place; Ctrl+Z / Undo brings it back.
// Completed: ★ to score it in Drop's place (the score once given).
const dropButton = mediaId => knownEntries.get(mediaId)?.status === 'DROPPED'
  ? '<span class="drop dropped" title="Dropped on AniList">Dropped</span>'
  : knownEntries.get(mediaId)?.status === 'COMPLETED' ? scoreButton(mediaId)
  : `<button class="drop" data-media="${mediaId}" title="Set to Dropped on AniList">Drop</button>`;
$('list').addEventListener('click', async e => {
  const b = e.target.closest('.drop');
  if (!b || !auth || b.disabled) return;
  if (!b.dataset.sure) {
    b.dataset.sure = '1';
    b.textContent = 'Sure?';
    setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.sure; b.textContent = 'Drop'; } }, 4000);
    return;
  }
  b.disabled = true;
  const title = rowTitle(b);
  try {
    remember([await change(Number(b.dataset.media), { status: 'DROPPED' })], `${title} dropped`);
  } catch (err) {
    b.textContent = `Couldn't drop: ${err.message}`;
    return;
  }
  load(true);
});

// "Mark all as watched" in Catch-up: every show up to its latest released episode. The first click
// lets you pick (each show's ✓ filled = included; click to leave one out), the second saves the
// included ones show by show (spaced out, AniList limits requests per minute).
let catchupTargets = [];
let selecting = false;
const skipped = new Set(); // media ids left out while selecting
const markAllLabel = () => `Mark ${catchupTargets.filter(t => !skipped.has(t.mediaId)).length} as watched`;
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
$('list').addEventListener('click', async e => {
  const b = e.target.closest('#markAll');
  if (!b || !auth || b.disabled) return;
  if (!selecting) {
    selecting = true;
    skipped.clear();
    load(true);
    return;
  }
  b.disabled = true;
  const targets = catchupTargets.filter(t => !skipped.has(t.mediaId));
  selecting = false;
  const records = []; // the whole run is one undo step
  for (const [i, { mediaId, progress, add }] of targets.entries()) {
    b.textContent = `Saving ${i + 1}/${targets.length}…`;
    try {
      records.push(await change(mediaId, { progress, status: add ? 'CURRENT' : undefined }));
    } catch (err) {
      b.textContent = `Stopped at ${i + 1}/${targets.length}: ${err.message}`;
      remember(records, `${records.length} of ${targets.length} shows marked as watched`);
      return;
    }
    await new Promise(r => setTimeout(r, 700));
  }
  remember(records, `${records.length} ${records.length === 1 ? 'show' : 'shows'} marked as watched`);
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

async function loadCatchup(strict = false) {
  const user = $('anilistUser').value.trim();
  const shown = view; // Catch-up or Non-seasonal; stop if the view changes while loading
  const name = shown === 'pace' ? 'Non-seasonal' : 'Catch-up';
  $('tabName').textContent = user ? `${name} · ${user} on AniList` : name;
  if (!user) { $('list').innerHTML = '<div class="status">Enter an AniList name in the AniList menu.</div>'; return; }
  if (!document.querySelector('#list .row')) $('list').innerHTML = '<div class="status">Loading…</div>';
  await ready;
  let entries;
  try {
    entries = await anilistList(user);
  } catch (e) {
    if (strict) throw new Error(`AniList: ${e.message}`);
    if (view === shown) $('list').innerHTML = failed(navigator.onLine === false
      ? `You're offline, and ${user}'s AniList list isn't saved in this browser yet.` : `Couldn't load ${user}'s AniList list (${e.message}).`);
    return;
  }
  if (view !== shown) return;
  // This season's Guckplan, for each show's "Wo" (that service's button first).
  let plan = null;
  try {
    plan = await sheetFor(tabFor(tabs, new Date()));
    setNote('catchup:plan', null);
  } catch (e) {
    setNote('catchup:plan', `${unreachable('Google Sheets')}: without the Guckplan, watch slots and planned shows missing from the list are left out.`);
  }
  // Plus the Solo person's Guckplan shows that aren't on the AniList Watching list (forgotten).
  const planShows = await missingPlanShows(plan, entries);
  if (view !== shown) return;
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
    const released = ep => next.airingAt - (next.episode - ep) * week + offset;
    // Out so far: everything before the next episode, minus the newest ones whose watch time
    // hasn't passed yet (you're only behind once the planned slot is over).
    let out = next ? next.episode - 1 : m.status === 'FINISHED' ? m.episodes : 0;
    while (next && out > progress && dueAt(released(out), slot, mine?.[0] || show) > now) out--;
    if (!out || out <= progress) continue;
    const first = progress + 1;
    const since = next ? released(first) : 0;
    const row = { m, first, out, since, missing, progress, links: streamLinks(m, show?.wo, m.title.english || m.title.romaji) };
    (missing || show || recent(m) ? rows : ownPace).push(row);
  }
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
  const note = missing => missing ? ' · not on your AniList yet' : '';
  // While picking shows for "Mark all as watched", each show's ✓ is its switch: filled = included.
  const selector = m => `<button class="watch${skipped.has(m.id) ? '' : ' done'}" data-select="${m.id}"
    title="Include in Mark all as watched">✓</button>`;
  const check = (m, ep, missing) => selecting ? selector(m) : watchButton(m.id, ep, missing);
  const single = singleEpisodes;
  const showLinks = $('catchupLinks').checked;
  const title = m => `<div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>`;
  const grouped = ({ m, first, out, missing, links }) => `
    <div class="row" ${searchKey(...mediaTitles(m))}>
      <div class="time">Ep ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep">${out - first + 1} to catch up${out > first ? ` · Ep ${first}–${out}` : ''}${note(missing)}</div>
      </div>
      ${showLinks ? `<div class="links">${linkButtons(links, m.id)}</div>` : ''}
      ${mine ? check(m, out, missing) + dropButton(m.id) : ''}
    </div>`;
  // A header per show (cover, title, links, Drop; while selecting its ✓ is the switch), then every
  // open episode as an equal slim row with its own ✓.
  const perEpisode = ({ m, first, out, missing, links }) => {
    const eps = Array.from({ length: out - first + 1 }, (_, i) => first + i);
    return `<div class="shared" ${searchKey(...mediaTitles(m))}>
      <div class="row show-head">
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}<div class="ep">${eps.length} to catch up${note(missing)}</div></div>
        ${showLinks ? `<div class="links">${linkButtons(links, m.id)}</div>` : ''}
        ${mine ? (selecting ? selector(m) : '') + dropButton(m.id) : ''}
      </div>${eps.map(ep => `
      <div class="row compact">
        <div class="time">Ep ${ep}</div>
        <div class="info"></div>
        ${mine ? (selecting ? '<div class="watch-space"></div>' : watchButton(m.id, ep, missing)) + '<div class="drop-space"></div>' : ''}
      </div>`).join('')}</div>`;
  };
  // At your own pace: one row per show with the next episode and its ✓ (that episode only).
  const paced = ({ m, first, out, progress, links }) => `
    <div class="row" ${searchKey(...mediaTitles(m))}>
      <div class="time">Ep ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep">${progress} of ${m.episodes || out} watched</div>
      </div>
      ${showLinks ? `<div class="links">${linkButtons(links, m.id)}</div>` : ''}
      ${mine ? (selecting ? '<div class="watch-space"></div>' : watchButton(m.id, first)) + dropButton(m.id) : ''}
    </div>`;
  if (!mine || shown === 'pace') selecting = false;
  if (shown === 'pace') {
    ownPace.sort(choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first) : byTitle);
    $('list').innerHTML = ownPace.length ? ownPace.map(paced).join('')
      : '<div class="status">No older shows open on the Watching list.</div>';
  } else {
    const top = !mine || !rows.length ? ''
      : selecting ? `<div class="catchup-bar"><span class="hint">Click a ✓ to leave that show out</span>
          <button id="cancelMark" class="pill">Cancel</button><button id="markAll" class="pill sure">${markAllLabel()}</button></div>`
      : `<div class="catchup-bar"><button id="markAll" class="pill">Mark all as watched</button></div>`;
    $('list').innerHTML = rows.length ? top + rows.map(single ? perEpisode : grouped).join('') : '<div class="status">All caught up.</div>';
    // Your own list: shows finished lately that have no score yet, each with ★ to score it
    const unscored = mine ? toScore.filter(t => !knownEntries.get(t.media.id)?.score) : [];
    if (unscored.length) $('list').insertAdjacentHTML('beforeend', `<section class="day toscore"><h2>Finished · not scored yet</h2>${unscored.map(({ media: m, completed }) => `
      <div class="row" ${searchKey(...mediaTitles(m))}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}
          <div class="ep">Completed ${completed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
        </div>
        ${scoreButton(m.id)}
      </div>`).join('')}</section>`);
  }
  $('list').insertAdjacentHTML('afterbegin', notesHtml(['list:' + user.toLowerCase(), 'catchup:plan', 'catchup:missing']));
  // Not logged in, or someone else's list: say why there are no ✓ / Drop buttons. (Typing a name
  // into "Catch-up list of" only shows that list; logging in is "Connect AniList".)
  if (!mine && document.querySelector('#list .row')) $('list').insertAdjacentHTML('afterbegin', `<div class="notice">${auth
    ? `This is ${esc(user)}'s list: ✓ and Drop only work on your own (${esc(auth.name)}).`
    : 'To tick episodes or drop shows, connect AniList: the person icon at the top right → “Connect AniList”.'}</div>`);
  const times = [...document.querySelectorAll('.time')];
  document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
  applySearch();
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
  const key = ids.join() + (auth ? ':' + auth.name : '');
  if (planShowsCache.key !== key || Date.now() - planShowsCache.time > LIST_CACHE_MS) {
    const query = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
      id status episodes siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } ${auth ? 'mediaListEntry { progress status }' : ''}
    } } }`;
    try {
      const data = auth ? await anilistAsMe(query, { ids }) : await anilist(query, { ids });
      planShowsCache = { key, time: Date.now(), media: data.Page.media };
      setNote('catchup:missing', null);
    } catch {
      setNote('catchup:missing', `${unreachable('AniList')}: planned shows missing from the AniList list couldn't be checked.`);
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
// strict (Refresh data): no "Loading…" over what's on screen, and a failure is thrown to the caller
// instead of replacing the schedule with an error.
async function load(refresh = false, strict = false) {
  if (listView()) return loadCatchup(strict);
  const start = weekStart(weekOffset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  // The year only when it isn't this one, or the week spans New Year ("Dec 28, 2026 – Jan 3, 2027")
  const year = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== new Date().getFullYear();
  const fmt = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }) });
  $('week').textContent = `${fmt(start)} – ${fmt(end)}`;
  if (!cache.has(start.getTime()) && !strict) $('list').innerHTML = '<div class="status">Loading…</div>';
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
      setNote('missing ' + t.gid, `${unreachable('Google Sheets')}: “${t.name}” couldn't be read, its shows are missing.`);
    })));
  const weekTabs = [...new Set([tabFor(tabs, start), tabFor(tabs, end)])];
  if (view !== 'week') return; // switched to Catch-up meanwhile
  if (!weekTabs.some(t => plans.has(t.gid))) {
    if (strict) throw new Error(`Guckplan: ${problems.join('; ') || 'not readable'}`);
    $('list').innerHTML = failed(navigator.onLine === false ? "You're offline, and this Guckplan isn't saved in this browser yet."
      : `Couldn't read the Guckplan (${problems.join('; ') || 'unknown error'}).`);
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
    if (pendingRewatch.size) lookUpRewatches().then(() => load(true));
    if (pendingNext.size) lookUpNext().then(() => load(true));
    // A new week starts at the top (with "Today", that's today itself).
    if (!refresh) window.scrollTo(0, 0);
  } catch (e) {
    if (strict) throw e;
    $('list').innerHTML = failed(`Couldn't load the schedule: ${e.message}`);
  }
}
$('list').addEventListener('click', e => { if (e.target.closest('.retry')) load(); });

// Which days of the week show: 'rest' (today to Sunday, how the page opens), 'today' (today only)
// or 'week' (all of it; the arrows always show whole weeks). "Today" and "From today" go to this
// week that way, and pressed again show the whole week; the one in use is highlighted.
let range = 'rest';
function setRange(next) {
  range = next;
  $('thisWeek').setAttribute('aria-pressed', range === 'today');
  $('fromToday').setAttribute('aria-pressed', range === 'rest');
}
setRange('rest');
$('prev').onclick = () => { weekOffset--; setRange('week'); load(); };
$('next').onclick = () => { weekOffset++; setRange('week'); load(); };
for (const [id, value] of [['thisWeek', 'today'], ['fromToday', 'rest']])
  $(id).onclick = () => {
    setRange(weekOffset === 0 && range === value ? 'week' : value);
    weekOffset = 0;
    load();
  };
try { localStorage.removeItem('todayFirst'); } catch {}
try { $('others').checked = localStorage.getItem('others') === '1'; } catch {}
$('others').onchange = () => {
  try { localStorage.setItem('others', $('others').checked ? '1' : '0'); } catch {}
  load(true); // redraw in place, no jump back to today
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
    setNote('moves', `${unreachable('The site')}: moved shows couldn't be loaded, so all shows are in their Guckplan slots.`);
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
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'the GitHub key may not write here' : `GitHub answered ${res.status}`);
  moves = next;
  try { localStorage.setItem('movesOwn', JSON.stringify(file)); } catch {}
}

// The ⚙ "Moving shows" entry only shows where a key is saved; the first time, open the site with
// #moves at the end of the address.
$('movesSetup').hidden = $('moveToggle').hidden = !movesKey;
function openKeyDialog() {
  $('keyInput').value = '';
  $('keyMsg').textContent = movesKey ? 'A key is saved in this browser.' : '';
  $('keyDlg').showModal();
}
$('movesSetup').onclick = openKeyDialog;
if (location.hash === '#moves') { history.replaceState(null, '', location.pathname + location.search); openKeyDialog(); }
$('keySave').onclick = async () => {
  const key = $('keyInput').value.trim();
  if (!key) return;
  $('keyMsg').textContent = 'Checking…';
  try {
    const res = await fetch('https://api.github.com/repos/RyoTsushigawa/anime-schedule', { headers: { Authorization: `Bearer ${key}` } });
    const repo = res.ok ? await res.json() : null;
    if (!repo?.permissions?.push) throw new Error(res.ok ? "this key can't change the site" : `GitHub answered ${res.status}`);
    movesKey = key;
    try { localStorage.setItem('movesKey', key); } catch {}
    $('movesSetup').hidden = $('moveToggle').hidden = false;
    $('keyMsg').textContent = 'Saved. Shows in the week now have ⇄ to move them.';
    load(true);
  } catch (e) { $('keyMsg').textContent = `Not saved: ${e.message}`; }
};
$('keyRemove').onclick = () => {
  movesKey = '';
  $('moveToggle').hidden = true;
  try { localStorage.removeItem('movesKey'); } catch {}
  $('keyMsg').textContent = 'Removed from this browser.';
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
  if (!b) return;
  moving = { key: norm(b.dataset.moveTitle), name: b.dataset.moveName };
  const week = isoDay(weekStart(weekOffset));
  const mv = moves.find(m => m.show === moving.key && m.week === week) || moves.find(m => m.show === moving.key && !m.week);
  $('moveName').textContent = moving.name;
  $('moveFrom').textContent = mv ? `Moved ${mv.week ? 'for this week' : 'from now on'}; “Back” returns it to the Guckplan slot.` : `Guckplan: ${slotLabel({ tag: b.dataset.tag, time: b.dataset.time })}`;
  $('moveTag').value = b.dataset.tag || 'Mo.';
  $('moveTime').value = b.dataset.time || '';
  setMoveScope(mv && !mv.week ? 'always' : 'week');
  $('moveReset').hidden = !mv;
  $('moveMsg').textContent = '';
  $('moveDlg').showModal();
});
async function storeMoves(next, done) {
  $('moveMsg').textContent = 'Saving…';
  try {
    await saveMoves(next);
    $('moveDlg').close();
    notice(`${done} Everyone sees it in about a minute.`);
    load(true);
  } catch (e) { $('moveMsg').textContent = `Not saved: ${e.message}`; }
}
$('moveSave').onclick = () => {
  const time = $('moveTime').value.trim();
  if (time && !parseTime(time)) { $('moveMsg').textContent = 'Time like 21:00, or empty for the next free slot.'; return; }
  const week = moveScope === 'week' ? isoDay(weekStart(weekOffset)) : '';
  const next = moves.filter(m => !(m.show === moving.key && m.week === week))
    .concat({ show: moving.key, title: moving.name, tag: $('moveTag').value, time, week });
  storeMoves(next, `${moving.name} moved to ${slotLabel({ tag: $('moveTag').value, time })}${week ? ' this week' : ''}.`);
};
$('moveReset').onclick = () => {
  const week = isoDay(weekStart(weekOffset));
  storeMoves(moves.filter(m => !(m.show === moving.key && (m.week === week || !m.week))), `${moving.name} is back in its Guckplan slot.`);
};

// The German links and the sheet's tab list, fetched side by side; load() waits for both.
const ready = Promise.all([
  loadMoves(),
  fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json())
    .then(json => { streamsDe = json; }, e => {
      console.warn('streams-de.json not loaded:', e);
      setNote('streams', `${unreachable('The site')}: the stream data didn't load, so links come from AniList and breaks and rewatches aren't shown.`);
    }),
  savedOrFresh('tabs', guckplanTabs, list => { tabs = list; load(true); })
    .then(list => { tabs = list; }, e => {
      console.warn('Sheet tabs not loaded:', e);
      setNote('tabs', `${unreachable('Google Sheets')}: the list of Guckplan tabs is unknown, so “${FALLBACK_TAB.name}” is shown.`);
    }),
  loadMe().catch(e => console.warn('AniList account not loaded:', e)),
]);
updateConnect();
load();

// Home screen app: the service worker keeps the page fresh online and available offline.
// An installed app can stay open for days without reloading: whenever it's brought back, the browser
// looks for a new version, and once that has taken over, a bar offers to reload into it.
if ('serviceWorker' in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('No offline copy:', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) $('update').hidden = false; });
  $('updateReload').onclick = () => location.reload();
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
$('viewWeek').onclick = () => { setView('week'); load(); };
$('viewCatchup').onclick = () => { setView('catchup'); load(); };
$('viewPace').onclick = () => { setView('pace'); load(); };
try { $('catchupLinks').checked = localStorage.getItem('catchupLinks') === '1'; } catch {}
$('catchupLinks').onchange = () => {
  try { localStorage.setItem('catchupLinks', $('catchupLinks').checked ? '1' : '0'); } catch {}
  load(true);
};
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
$('modeSolo').onclick = () => { setMode('solo'); load(true); };
$('modeGroup').onclick = () => { setMode('group'); load(true); };
// Group button: short summary of who's selected; opens the panel with everyone's names.
function updateGroupButton() {
  const names = [...selectedPeople];
  $('groupButton').textContent = !names.length ? 'Pick people'
    : names.length <= 2 ? names.join(', ')
    : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
updateGroupButton();
function showPeople(open) {
  $('people').hidden = !open;
  $('groupButton').setAttribute('aria-expanded', open);
}
$('groupButton').onclick = () => showPeople($('people').hidden);
document.addEventListener('click', e => { if (!e.target.closest('.picker')) showPeople(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') showPeople(false); });
$('soloPerson').onchange = () => {
  soloPerson = $('soloPerson').value;
  colorSolo();
  try { localStorage.setItem('soloPerson', soloPerson); } catch {}
  load(true);
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
      load(true);
    };
    return b;
  }));
}

// Last used service per show; refreshed URLs still come from the current stream data.
try { $('resumeWatching').checked = localStorage.getItem('resumeWatching') === '1'; } catch {}
$('resumeWatching').onchange = () => {
  try { localStorage.setItem('resumeWatching', $('resumeWatching').checked ? '1' : '0'); } catch {}
  load(true);
};
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-stream-show]');
  if (!link || !$('resumeWatching').checked) return;
  const id = link.dataset.streamShow, service = link.dataset.streamService;
  resumeServices[id] = service;
  try { localStorage.setItem('resumeServices', JSON.stringify(resumeServices)); } catch {}
  document.querySelectorAll('a[data-stream-show]').forEach(button => {
    if (button.dataset.streamShow !== id) return;
    button.textContent = button.textContent.replace(/ · Resume$/, '') + (button.dataset.streamService === service ? ' · Resume' : '');
    if (button.dataset.streamService === service) button.parentElement.prepend(button);
  });
});

// Explicit allowlist excludes account sessions, access keys and cached personal lists.
const BACKUP_KEYS = ['mode', 'soloPerson', 'people', 'view', 'anilistUser', 'theme', 'time', 'sort', 'accent',
  'others', 'who', 'dropButtons', 'moveButtons', 'catchupLinks', 'singleEpisodes', 'resumeWatching', 'resumeServices',
  'planUnavailable', 'planStarts', 'planStart', 'planBusy', 'planMoves', 'planFixed', 'planBreaks', 'planUntil', 'planView'];
function settingsBackup() {
  const settings = {};
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) settings[key] = value;
  }
  return { app: 'anime-schedule', version: 1, saved: new Date().toISOString(), settings };
}
function readSettingsBackup(text) {
  if (text.length > 1000000) throw new Error('This backup is too large.');
  const data = JSON.parse(text);
  if (data?.app !== 'anime-schedule' || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))
    throw new Error('Choose an Anime Schedule settings backup.');
  const settings = {};
  for (const key of BACKUP_KEYS) if (Object.hasOwn(data.settings, key)) {
    if (typeof data.settings[key] !== 'string' || data.settings[key].length > 200000) throw new Error('Invalid setting: ' + key);
    settings[key] = data.settings[key];
  }
  if (settings.resumeServices) {
    const services = JSON.parse(settings.resumeServices);
    if (!services || Array.isArray(services) || typeof services !== 'object' || Object.entries(services).some(([id, name]) => !/^\d+$/.test(id) || typeof name !== 'string' || name.length > 200))
      throw new Error('Invalid saved services.');
  }
  for (const key of ['people', 'planUnavailable', 'planStarts', 'planBusy', 'planFixed', 'planBreaks', 'planUntil'])
    if (settings[key]) {
      const value = JSON.parse(settings[key]);
      if (!value || typeof value !== 'object') throw new Error('Invalid setting: ' + key);
      if (['people', 'planBusy', 'planFixed'].includes(key) && !Array.isArray(value)) throw new Error('Invalid setting: ' + key);
    }
  for (const key of ['time', 'sort', 'accent']) if (settings[key] && !CHOICE_OK[key](settings[key])) throw new Error('Invalid setting: ' + key);
  return settings;
}
$('backupSettings').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(settingsBackup(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'anime-schedule-settings-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('restoreSettings').onclick = () => $('settingsFile').click();
let pendingSettings;
$('settingsFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('This backup is too large.');
    pendingSettings = readSettingsBackup(await file.text());
    $('restoreDialog').showModal();
  } catch (error) { notice('Could not restore: ' + error.message); }
  event.target.value = '';
};
$('confirmRestore').onclick = () => {
  const before = settingsBackup().settings;
  try {
    for (const key of BACKUP_KEYS) {
      if (Object.hasOwn(pendingSettings, key)) localStorage.setItem(key, pendingSettings[key]);
      else localStorage.removeItem(key);
    }
  } catch {
    for (const key of BACKUP_KEYS) {
      if (Object.hasOwn(before, key)) localStorage.setItem(key, before[key]);
      else localStorage.removeItem(key);
    }
    notice('Could not save settings; your previous settings were kept.'); return;
  }
  location.reload();
};
$('cancelRestore').onclick = () => $('restoreDialog').close();
