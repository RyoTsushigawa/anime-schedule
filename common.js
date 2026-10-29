// Shared by the schedule (app.js) and the watch plan generator (planner.js): reading the Guckplan
// (read-only), title matching, AniList requests and small helpers.

const API = 'https://graphql.anilist.co';
// The group's Google Sheet (or another copy of it with ?sheet=<id> in the address, e.g. to try the
// planner on a test copy). The page only reads it (tab list + CSV export), never writes to it.
const SHEET = 'https://docs.google.com/spreadsheets/d/' +
  ((new URLSearchParams(location.search).get('sheet') || '').match(/^[\w-]{20,}$/)?.[0] || '1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ');
const FALLBACK_TAB = { name: 'Guckplan Herbst 2026', gid: '488548700' };
// First month of each season, as the tabs are named ("Guckplan Winter 2027").
const SEASON_MONTH = { winter: 0, frühling: 3, fruehling: 3, frühjahr: 3, sommer: 6, herbst: 9 };
const DEFAULT_PERSON = 'MaRyo';

const $ = id => document.getElementById(id);

// ---------- Sheet ----------

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

// Returns the copy saved in this browser right away (if there is one) and downloads a fresh one in
// the background; onChange runs when the fresh copy differs. Without a saved copy it waits for the download.
// onFresh(error) says whether the download worked (null) while a saved copy is shown.
function savedOrFresh(key, download, onChange, onFresh = () => {}) {
  let saved = null;
  try { saved = localStorage.getItem(key); } catch {}
  const fresh = download().then(value => {
    const json = JSON.stringify(value);
    try { localStorage.setItem(key, json); } catch {}
    if (saved) onFresh(null);
    if (saved && json !== saved) onChange(value);
    return value;
  });
  if (!saved) return fresh;
  fresh.catch(e => { console.warn(`${key}: kept the saved copy,`, e); onFresh(e); });
  return Promise.resolve(JSON.parse(saved));
}

// All "Guckplan <Season> <Year>" tabs with their start dates (as timestamps), newest first, each
// with `catalogGid`: the season's full show list ("Herbst 2026" for "Guckplan Herbst 2026").
async function guckplanTabs() {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  const all = new Map([...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)].map(([, name, gid]) => [name.trim(), gid]));
  const tabs = [];
  for (const [name, gid] of all) {
    const m = name.match(/^Guckplan\s+(\S+)\s+(\d{4})/i);
    const month = m && SEASON_MONTH[m[1].toLowerCase()];
    if (month === undefined || month === null) continue;
    const catalogGid = all.get(name.replace(/^Guckplan\s+/i, ''));
    tabs.push({ name, gid, start: new Date(Number(m[2]), month, 1).getTime(), ...(catalogGid && { catalogGid }) });
  }
  return tabs.sort((a, b) => b.start - a.start);
}

// The tab whose season the date falls in (newest season that has started), else the oldest one.
function tabFor(tabs, date) {
  return tabs.find(t => t.start <= date) || tabs.at(-1) || FALLBACK_TAB;
}

// Tabs that can be active around a date: its own season's tab plus the ones next to it, so shows
// that run on from the last plan or premiere early for the next one aren't lost in the overlap.
function activeTabs(tabs, date) {
  const tab = tabFor(tabs, date);
  const i = tabs.indexOf(tab);
  return i < 0 ? [tab] : [tab, tabs[i - 1], tabs[i + 1]].filter(Boolean);
}


async function loadPlan(tab) {
  const [hidden, catalog, colors] = await Promise.all([
    hiddenRows(tab).catch(e => { console.warn('Hidden rows unknown, all rows count:', e.message); return null; }),
    tab.catalogGid ? loadSheet(tab.catalogGid).catch(() => null) : null,
    headerColors(tab).catch(() => ({})),
  ]);
  const plan = await loadSheet(tab.gid, hidden);
  plan.catalog = (catalog?.shows || []).map(({ romaji, english, wo, tag }) => ({ romaji, english, wo, tag, time: '' }));
  plan.colors = colors;
  return plan;
}

// Each person's color: the background of their name in the Guckplan's header row (Sheets API,
// read-only like hiddenRows). { name: '#rrggbb' }
async function headerColors(tab) {
  const { sheetsKey } = await config();
  if (!sheetsKey) return {};
  const range = encodeURIComponent(`'${tab.name.replace(/'/g, "''")}'!A1:AZ6`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}` +
    `&fields=sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))&key=${encodeURIComponent(sheetsKey)}`);
  if (!res.ok) throw new Error('Sheets API returned ' + res.status);
  const rows = (await res.json()).sheets?.[0]?.data?.[0]?.rowData || [];
  const header = rows.find(r => (r.values || []).some(v => v.formattedValue?.trim() === 'Anime Titel'))?.values || [];
  const hex = c => '#' + ['red', 'green', 'blue'].map(k => Math.round((c[k] || 0) * 255).toString(16).padStart(2, '0')).join('');
  return Object.fromEntries(header.flatMap(v => v.formattedValue?.trim() && v.effectiveFormat?.backgroundColor
    ? [[v.formattedValue.trim(), hex(v.effectiveFormat.backgroundColor)]] : []));
}

// People's colors from every Guckplan tab loaded so far, as inline CSS variables for their chips
// (with black or white text, whichever reads better on it).
const personColor = new Map();
const rememberColors = plans => {
  for (const plan of plans) for (const [name, c] of Object.entries(plan?.colors || {})) personColor.set(name, c);
};
function personStyle(name) {
  const c = personColor.get(name);
  if (!/^#[0-9a-f]{6}$/.test(c || '')) return '';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const text = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
  return `--person:${c};--person-text:${text}`;
}

// The rows (numbers as in the sheet) and columns (0 = A) hidden by hand in a tab. Hidden Guckplan
// rows are dropped shows, or shows already covered by being named in another row's slot; a hidden
// person column is someone no longer taking part. Only the Sheets API tells
// "hidden by hand" apart from "hidden by a filter" (the Guckplan is nearly always filtered), so this
// needs the read-only API key from config.json (written by tools/publish.mjs); without one,
// hiding is ignored and every row counts.
const SHEET_ID = SHEET.split('/d/')[1];
let configPromise = null;
const config = () => configPromise ??= fetch('config.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
async function hiddenRows(tab) {
  const { sheetsKey } = await config();
  if (!sheetsKey) throw new Error('no Sheets API key');
  const range = encodeURIComponent(`'${tab.name.replace(/'/g, "''")}'!A1:AZ300`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}` +
    `&fields=sheets(data(rowMetadata(hiddenByUser),columnMetadata(hiddenByUser)))&key=${encodeURIComponent(sheetsKey)}`);
  if (!res.ok) throw new Error('Sheets API returned ' + res.status);
  const data = (await res.json()).sheets?.[0]?.data?.[0] || {};
  return {
    rows: new Set((data.rowMetadata || []).flatMap((r, i) => r.hiddenByUser ? [i + 1] : [])),
    cols: new Set((data.columnMetadata || []).flatMap((c, i) => c.hiddenByUser ? [i] : [])),
  };
}

async function loadSheet(gid, hidden = null) {
  const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error('Google Sheet returned ' + res.status);
  const rows = parseCsv(await res.text());
  const headerIndex = rows.findIndex(r => r.some(c => c.trim() === 'Anime Titel'));
  const header = rows[headerIndex]?.map(c => c.trim()) || [];
  const col = name => header.indexOf(name);
  for (const name of ['Anime Titel', 'Tag', 'Uhrzeit'])
    if (col(name) < 0) throw new Error(`the sheet has no "${name}" column anymore`);
  // Everyone right of "Uhrzeit", except columns hidden by hand. (All of them, hidden too, in
  // `columns`, for the planner's export in the sheet's own layout.)
  const columns = header.flatMap((name, i) => i > col('Uhrzeit') && name ? [{ name, hidden: !!hidden?.cols.has(i) }] : []);
  const people = columns.filter(c => !c.hidden).map(c => c.name);
  const shows = [];
  for (const [i, r] of rows.entries()) {
    if (i <= headerIndex) continue;
    const romaji = (r[col('Anime Titel')] || '').trim();
    if (!romaji) break; // the summary block below the list starts after an empty title
    const votes = {};
    for (const { name: p } of columns) votes[p] = (r[header.indexOf(p)] || '').trim().replace(/,$/, '');
    const show = {
      romaji, english: (r[col('Eng Anime Titel')] || '').trim(),
      wo: (r[col('Wo')] || '').trim().toUpperCase(),
      tag: (r[col('Tag')] || '').trim(), time: (r[col('Uhrzeit')] || '').trim(), votes,
      start: (r[col('Startdatum')] || '').trim(), sort: (r[col('Sort')] || '').trim(), slot: (r[col('Slot')] || '').trim(),
      hidden: !!hidden?.rows.has(i + 1), // CSV line i is sheet row i + 1
    };
    // The same show listed twice: the visible row wins, else the upper one.
    const twin = shows.findIndex(s => norm(s.romaji) === norm(romaji));
    if (twin < 0) shows.push(show);
    else if (shows[twin].hidden && !show.hidden) shows[twin] = show;
  }
  return { people, columns, shows };
}

// The sheet shows one person watches, each with the slot ({ tag, time }) it's watched in:
// Ja / Vielleicht / Wenn Belly dabei ist / group names in their own row's slot, and a show named
// in that person's column in the slot of the row that names it (watched there instead).
// Hidden rows (dropped, or covered by being named elsewhere) don't count themselves, but a show in
// a hidden row can still be named from a visible one.
function picks(sheet, person) {
  const result = new Map();
  const add = (show, slot) => { if (!result.get(show)?.time) result.set(show, slot); };
  for (const show of sheet.shows) {
    if (show.hidden) continue;
    const v = show.votes[person] || '';
    if (/^(ja|vielleicht)$|^wenn belly/i.test(v)) add(show, { tag: show.tag, time: show.time, slot: show.slot });
    else if (v && !/^(nein|default|allein)$/i.test(v)) {
      // A show's name: watched in this row's slot instead. Anything else ("Demons", a group
      // like "Okinawa 3") is a yes for this row.
      const named = resolveName(sheet, v);
      if (named) add(named, { tag: show.tag || named.tag, time: show.time, slot: show.slot });
      else add(show, { tag: show.tag, time: show.time, slot: show.slot });
    }
  }
  return result;
}

// The show a name in someone's column means. People shorten names ("Apothecary Diaries" for
// "The Apothecary Diaries Season 3"), so the season's full list (catalog) is checked too: its
// full titles lead back to the Guckplan row, or the catalog entry itself is used when the show
// has no row of its own.
function resolveName(sheet, value) {
  const short = norm(value);
  const contains = list => short.length >= 4 && list.find(s => [s.romaji, s.english].some(t => norm(t).includes(short)));
  const inPlan = titles => sheet.shows.find(s => titleMatches([s.romaji, s.english], titles));
  const direct = inPlan([value]);
  if (direct) return direct;
  const catalog = sheet.catalog || [];
  const entry = catalog.find(s => titleMatches([s.romaji, s.english], [value])) || contains(catalog);
  if (entry) return inPlan([entry.romaji, entry.english]) || entry;
  return contains(sheet.shows) || null;
}

// ---------- Title matching ----------

const norm = s => String(s || '').normalize('NFKD').toLowerCase()
  .replace(/½/g, '12').replace(/\b(\d+)(st|nd|rd|th) season\b/g, 'season $1').replace(/[^a-z0-9]/g, '');

// 2 = same title, 1 = one title starts with the other (e.g. "Season 2" spelled differently), 0 = no match.
function titleScore(a, b) {
  const A = a.map(norm).filter(Boolean), B = b.map(norm).filter(Boolean);
  if (A.some(x => B.includes(x))) return 2;
  return A.some(x => B.some(y => Math.min(x.length, y.length) >= 8 && (x.startsWith(y) || y.startsWith(x)))) ? 1 : 0;
}
const titleMatches = (a, b) => titleScore(a, b) > 0;

const mediaTitles = m => [m.title.romaji, m.title.english, ...(m.synonyms || [])];

// ---------- AniList ----------

// Every AniList request goes through here. When AniList limits requests it answers 429 without the
// header browsers need, so that shows up as a network error: both (and server errors) get a few
// retries with waits, and a "Loading…" message on the page says so meanwhile.
const RETRY_WAITS = [4000, 12000, 30000];
async function anilist(query, variables = {}, token, options = {}) {
  for (let attempt = 0; ; attempt++) {
    let res = null;
    try {
      res = await fetch(API, {
        signal: AbortSignal.timeout(options.timeout || 12000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
        body: JSON.stringify({ query, variables }),
      });
    } catch {}
    if (res && res.status !== 429 && res.status < 500) {
      if (res.status === 401) throw Object.assign(new Error('AniList login expired, connect again'), { status: 401 });
      const json = await res.json().catch(() => ({}));
      if (json.errors?.length) throw Object.assign(new Error(json.errors[0].message), { status: res.status });
      return json.data;
    }
    // Offline: no point waiting for retries
    if (attempt >= (options.retries ?? RETRY_WAITS.length) || (!res && navigator.onLine === false)) throw new Error("AniList isn't answering right now (it limits how often it can be asked). Try again in a minute");
    const status = document.querySelector('#list .status');
    if (status) status.textContent = 'AniList is busy, trying again…';
    await new Promise(r => setTimeout(r, RETRY_WAITS[attempt]));
  }
}

const WEEKDAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

// Watch times before 06:00 ("00:30") belong to the night after the "Tag" evening.
const NIGHT_UNTIL = 6;
const parseTime = time => (time || '').match(/^(\d{1,2})[:.](\d{2})/)?.slice(1).map(Number);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Links and pictures from AniList, LiveChart and Google: only plain https addresses get through
// (no javascript: or data: links, even if a source ever sent one).
const safeUrl = u => esc(/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : '#');

