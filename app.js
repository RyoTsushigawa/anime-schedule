
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
  if (Array.isArray(saved)) { selectedPeople.clear(); saved.forEach(p => selectedPeople.add(p)); }
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

const sheets = new Map();
// A tab's Guckplan: the last copy shown in this browser at once, then the current one when it arrives.
// Comes with `catalog`, the season's full show list, for looking up names people abbreviate.
const sheetFor = tab => {
  const key = tab.gid + ':' + (tab.catalogGid || '');
  if (!sheets.has(key)) {
    const onChange = fresh => { sheets.set(key, Promise.resolve(fresh)); load(true); };
    sheets.set(key, savedOrFresh('sheet:' + key, () => loadPlan(tab), onChange)
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
      if (JSON.stringify(items) !== JSON.stringify(saved.items)) {
        cache.set(start.getTime(), Promise.resolve(items));
        load(true);
      }
    }, () => {});
    return saved.items;
  }
  let items;
  try {
    items = await downloadAirings(start);
  } catch (e) {
    throw new Error("AniList isn't answering right now (it limits how often it can be asked). Try again in a minute.");
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
      // Not on AniList: remember that. AniList busy: skip for this visit (the next one tries again).
      rewatchMedia.set(key, null);
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
function linkButtons(links) {
  const button = l => l.main
    ? `<a class="cr" style="background:${l.color}" href="${safeUrl(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
    : `<a class="cr other" style="color:${l.color};border-color:${l.color}" href="${safeUrl(l.url)}" target="_blank" rel="noopener" title="Available, but not a service we have">${esc(l.label)}</a>`;
  const shown = links.filter(l => l.main || $('others').checked);
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
}
$('search').addEventListener('input', applySearch);
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
  if (open) { $('search').value = ''; applySearch(); }
  openSearch(!open);
};
$('search').addEventListener('blur', e => {
  if (e.relatedTarget === $('searchButton')) return; // the 🔍 itself decides
  if (!$('search').value) openSearch(false);
});
$('search').addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('search').value = '';
  applySearch();
  openSearch(false);
  $('search').blur();
});

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
    else day.rows.push({ it, m, links, when, slot, episodes: [it.episode], who: whoBySheet.get(sheet).get(show) });
  }

  // Shows from this week's plan without an episode, checked against LiveChart (weekly script):
  // a next episode after this week means a break ("Pause" in its slot, with the return date and
  // any announcement); nothing scheduled means this season's run is over (left out). Shows
  // LiveChart doesn't know this season that AniList lists as finished are rewatches, shown in
  // their slot. The rest is listed below. Pause and rewatch only from this week on.
  const weekTabs = new Set(days.map(d => tabFor(tabs, d.date).gid));
  const weekEnd = days[6].date.getTime() + 86400000;
  const unknown = [];
  for (const [show, slot] of [...weekTabs].flatMap(gid => plans.has(gid) ? [...chosen.get(plans.get(gid))] : [])) {
    if (found.has(show)) continue;
    // The same show listed twice in the sheet, already on the schedule through its other row.
    if ([...found].some(f => titleMatches([f.romaji, f.english], [show.romaji, show.english]))) continue;
    const status = Object.values(streamsDe?.status || {}).find(s => titleMatches([show.romaji, show.english], s.titles));
    if (status && !status.next) continue; // finished
    const day = days.find(d => WEEKDAYS.indexOf(norm(slot.tag).slice(0, 2)) === (d.date.getDay() + 6) % 7);
    if (!day || weekEnd < Date.now()) { unknown.push(show); continue; }
    const next = status && new Date(status.next.at * 1000);
    if (next && next >= weekEnd) {
      day.rows.push({ pause: true, show, slot, when: next, news: status.news || [] });
      found.add(show);
      continue;
    }
    const media = !status && rewatchFor(show);
    if (media && media.status === 'FINISHED') {
      const links = streamLinks(media, show.wo, media.title.english || media.title.romaji);
      day.rows.push({ rewatch: true, m: media, links, slot, when: day.date });
      found.add(show);
    } else unknown.push(show);
  }
  for (const d of days) assignWatchTimes(d);

  // Opened or "Today" pressed: the week starts with today, the days already past are left out.
  // With the arrows it's always the whole week.
  const todayIndex = days.findIndex(d => d.date.toDateString() === today);
  const ordered = fromToday && todayIndex > 0 ? days.slice(todayIndex) : days;
  let html = ordered.map(({ date, rows }) => {
    const heading = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    // Rows without a ✓ keep its place, so every row's buttons line up.
    const checkSpace = auth ? '<div class="watch-space"></div>' : '';
    const pause = ({ show, when, news }) => `
      <div class="row pause" ${searchKey(show.english, show.romaji)}>
        <div class="time">Pause</div>
        <div class="info">
          <div class="title">${esc(show.english || show.romaji)}</div>
          <div class="ep">No episode this week · back ${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        </div>
        <div class="links">${news.slice(0, 1).map(n => `<a class="cr news" href="${safeUrl(n.url)}" target="_blank" rel="noopener" title="${esc(n.title)}">Why?</a>`).join('')}</div>
        ${checkSpace}
      </div>`;
    const rewatch = ({ m, links, watchAt }) => `
      <div class="row" data-fade-at="${watchAt}" ${searchKey(m.title.english, m.title.romaji)}>
        <div class="time">Rewatch</div>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">Rewatch</div>
        </div>
        <div class="links">${linkButtons(links)}</div>
        ${checkSpace}
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
    const episodeRow = ({ it, m, links, when, watchAt, episodes, who }) => `
      <div class="row" data-at="${when.getTime()}" data-fade-at="${Math.max(when.getTime(), watchAt)}" ${searchKey(...mediaTitles(m))}>
        <div class="time">${timeCell(when, watchAt)}</div>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">
          <div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>
          <div class="ep">${episodes.length > 1 ? `Episodes ${Math.min(...episodes)}–${Math.max(...episodes)}` : `Episode ${it.episode}`}${whoChips(who)}</div>
        </div>
        <div class="links">${linkButtons(links)}</div>
        ${watchButton(m.id, Math.max(...episodes))}
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
  // At the very top, in red: plan shows that couldn't be placed this week.
  if (unknown.length) html = `<details class="warning"><summary>${unknown.length} ${unknown.length === 1 ? 'show' : 'shows'} from the Guckplan ${unknown.length === 1 ? "isn't" : "aren't"} airing this week (or couldn't be matched)</summary>
    <ul>${unknown.map(s => `<li>${esc(s.english || s.romaji)}</li>`).join('')}</ul></details>` + html;
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
    return entries;
  } catch (e) {
    if (saved) return saved.entries;
    throw e;
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
for (const name of Object.keys(choices))
  try { choices[name] = localStorage.getItem(name) || choices[name]; } catch {}
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

// "Who's watching": name chips of everyone watching each show; on unless switched off.
try { $('who').checked = localStorage.getItem('who') !== '0'; } catch { $('who').checked = true; }
$('who').onchange = () => {
  try { localStorage.setItem('who', $('who').checked ? '1' : '0'); } catch {}
  load(true);
};

// Refresh data: forget the saved copies (weeks, sheet, AniList lists, rewatch lookups) and load
// everything fresh. Settings and logins stay.
$('refreshData').onclick = () => {
  try {
    for (const k of Object.keys(localStorage))
      if (/^(week:|sheet:|list:|rewatch:|tabs$)/.test(k)) localStorage.removeItem(k);
  } catch {}
  location.reload();
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
}

// $status only when given: CURRENT for a show not on the list yet, DROPPED for "Drop".
const SAVE_PROGRESS = `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id progress status }
}`;

// ---------- Undo (Ctrl+Z, or the notice's "Undo") ----------

// How the logged-in viewer's entries looked, to put them back: from their Watching list and the
// forgotten Guckplan shows; anything else is asked from AniList before changing it.
const knownEntries = new Map(); // media id → { progress, status }
const notOnList = new Set();    // media ids known not to be on the list
async function entryBefore(mediaId) {
  if (knownEntries.has(mediaId)) return { onList: true, ...knownEntries.get(mediaId) };
  if (notOnList.has(mediaId)) return { onList: false };
  const entry = (await anilistAsMe('query ($id: Int) { Media(id: $id) { mediaListEntry { progress status } } }', { id: mediaId })).Media.mediaListEntry;
  return entry ? { onList: true, progress: entry.progress, status: entry.status } : { onList: false };
}

// Every change goes through here and returns what's needed to undo it.
async function change(mediaId, vars) {
  const before = await entryBefore(mediaId);
  const saved = (await anilistAsMe(SAVE_PROGRESS, { mediaId, ...vars })).SaveMediaListEntry;
  knownEntries.set(mediaId, { progress: saved.progress, status: saved.status });
  notOnList.delete(mediaId);
  myProgress.set(mediaId, saved.progress);
  listChanged(mediaId, saved.progress, !!vars.status);
  return { mediaId, before, entryId: saved.id };
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
// of that step back the way it was, newest step first.
const undoSteps = [];
function remember(records, text) {
  if (!records.length) return;
  undoSteps.push(records);
  notice(text, true);
}
let undoing = false;
async function undo() {
  const step = undoSteps.pop();
  if (!step || !auth || undoing) return;
  undoing = true;
  notice('Undoing…');
  try {
    for (const [i, { mediaId, before, entryId }] of [...step].reverse().entries()) {
      if (before.onList) {
        await anilistAsMe(SAVE_PROGRESS, { mediaId, progress: before.progress, status: before.status });
        knownEntries.set(mediaId, { progress: before.progress, status: before.status });
        myProgress.set(mediaId, before.progress);
      } else {
        await anilistAsMe('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entryId });
        knownEntries.delete(mediaId);
        notOnList.add(mediaId);
        myProgress.delete(mediaId);
      }
      listChanged(mediaId, before.progress || 0, true);
      if (i < step.length - 1) await new Promise(r => setTimeout(r, 700));
    }
    notice(step.length > 1 ? `Undone (${step.length} shows)` : 'Undone');
  } catch (err) {
    notice(`Couldn't undo: ${err.message}`);
  }
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
  } catch (err) {
    b.title = `Couldn't save: ${err.message}`;
  }
  load(true);
});

// "Drop" in Catch-up: sets the show to Dropped on AniList, so it leaves Catch-up (and doesn't come
// back as a forgotten Guckplan show). The first click only asks.
const dropButton = mediaId => `<button class="drop" data-media="${mediaId}" title="Set to Dropped on AniList">Drop</button>`;
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
// "Uhrzeit") is over, or, without a time, the watch day is over; never before it's out.
function dueAt(released, slot) {
  const day = watchDay(new Date(released * 1000), slot?.tag, slot?.time);
  const hm = parseTime(slot?.time);
  if (hm) day.setHours(hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0], hm[1], 0, 0);
  else day.setDate(day.getDate() + 1);
  return Math.max(released, day.getTime() / 1000);
}

async function loadCatchup() {
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
    if (view === shown) $('list').innerHTML = `<div class="status">Couldn't load ${esc(user)}'s AniList list (${esc(e.message)}).</div>`;
    return;
  }
  if (view !== shown) return;
  // This season's Guckplan, for each show's "Wo" (that service's button first).
  let plan = null;
  try { plan = await sheetFor(tabFor(tabs, new Date())); } catch {}
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
    const slot = mySlots.find(([s]) => titleMatches([s.romaji, s.english], mediaTitles(m)))?.[1] || show;
    const released = ep => next.airingAt - (next.episode - ep) * week + offset;
    // Out so far: everything before the next episode, minus the newest ones whose watch time
    // hasn't passed yet (you're only behind once the planned slot is over).
    let out = next ? next.episode - 1 : m.status === 'FINISHED' ? m.episodes : 0;
    while (next && out > progress && dueAt(released(out), slot) > now) out--;
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
      ${showLinks ? `<div class="links">${linkButtons(links)}</div>` : ''}
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
        ${showLinks ? `<div class="links">${linkButtons(links)}</div>` : ''}
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
      ${showLinks ? `<div class="links">${linkButtons(links)}</div>` : ''}
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
  }
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
    } catch {
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
  if (listView()) return loadCatchup();
  const start = weekStart(weekOffset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const fmt = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  $('week').textContent = `${fmt(start)} – ${fmt(end)}`;
  if (!cache.has(start.getTime())) $('list').innerHTML = '<div class="status">Loading…</div>';
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
    .then(sheet => plans.set(t.gid, sheet))
    .catch(e => problems.push(`${t.name}: ${e.message}`))));
  const weekTabs = [...new Set([tabFor(tabs, start), tabFor(tabs, end)])];
  if (view !== 'week') return; // switched to Catch-up meanwhile
  if (!weekTabs.some(t => plans.has(t.gid))) {
    $('list').innerHTML = `<div class="status">Couldn't read the Guckplan (${esc(problems.join('; ') || 'unknown error')}).</div>`;
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
    // A new week starts at the top (with "Today", that's today itself).
    if (!refresh) window.scrollTo(0, 0);
  } catch (e) {
    $('list').innerHTML = `<div class="status">Couldn't load the schedule: ${esc(e.message)}</div>`;
  }
}

// The page opens "from today"; the arrows show whole weeks. "Today" goes to this week from today,
// and pressed again shows the whole week; it's highlighted while "from today" is on.
let fromToday = true;
function setFromToday(on) {
  fromToday = on;
  $('thisWeek').setAttribute('aria-pressed', on);
}
setFromToday(true);
$('prev').onclick = () => { weekOffset--; setFromToday(false); load(); };
$('next').onclick = () => { weekOffset++; setFromToday(false); load(); };
$('thisWeek').onclick = () => {
  setFromToday(!(weekOffset === 0 && fromToday));
  weekOffset = 0;
  load();
};
try { localStorage.removeItem('todayFirst'); } catch {}
try { $('others').checked = localStorage.getItem('others') === '1'; } catch {}
$('others').onchange = () => {
  try { localStorage.setItem('others', $('others').checked ? '1' : '0'); } catch {}
  load(true); // redraw in place, no jump back to today
};

// The German links and the sheet's tab list, fetched side by side; load() waits for both.
const ready = Promise.all([
  fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json())
    .then(json => { streamsDe = json; }, e => console.warn('streams-de.json not loaded:', e)),
  savedOrFresh('tabs', guckplanTabs, list => { tabs = list; load(true); })
    .then(list => { tabs = list; }, e => console.warn('Sheet tabs not loaded:', e)),
  loadMe().catch(e => console.warn('AniList account not loaded:', e)),
]);
updateConnect();
load();

// Home screen app: the service worker keeps the page fresh online and available offline.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('No offline copy:', e));

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
