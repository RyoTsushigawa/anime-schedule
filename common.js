const API = 'https://graphql.anilist.co';
const SHEET = 'https://docs.google.com/spreadsheets/d/' +
((new URLSearchParams(location.search).get('sheet') || '').match(/^[\w-]{20,}$/)?.[0] || '1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ');
const FALLBACK_TAB = { name: 'Guckplan Herbst 2026', gid: '488548700' };
const SEASON_MONTH = { winter: 0, frühling: 3, fruehling: 3, frühjahr: 3, sommer: 6, herbst: 9 };
const DEFAULT_PERSON = 'MaRyo';
const $ = id => document.getElementById(id);
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
function tabFor(tabs, date) {
return tabs.find(t => t.start <= date) || tabs.at(-1) || FALLBACK_TAB;
}
function activeTabs(tabs, date) {
const tab = tabFor(tabs, date);
const i = tabs.indexOf(tab);
return i < 0 ? [tab] : [tab, tabs[i - 1], tabs[i + 1]].filter(Boolean);
}
async function loadPlan(tab, requireHiddenMetadata = false) {
const [hidden, catalog, colors] = await Promise.all([
hiddenRows(tab).catch(e => { if (requireHiddenMetadata) throw new Error('Ausgeblendete Serien und Personen konnten nicht geprüft werden: ' + e.message); console.warn('Hidden rows unknown, all rows count:', e.message); return null; }),
tab.catalogGid ? loadSheet(tab.catalogGid).catch(() => null) : null,
headerColors(tab).catch(() => ({})),
]);
const plan = await loadSheet(tab.gid, hidden);
plan.catalog = (catalog?.shows || []).map(({ romaji, english, wo, tag }) => ({ romaji, english, wo, tag, time: '' }));
plan.colors = colors;
return plan;
}
async function headerColors(tab) {
const { sheetsKey } = await config();
if (!sheetsKey) return {};
const range = encodeURIComponent(`'${tab.name.replace(/'/g, "''")}'!A1:AZ6`);
const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}` +
`&fields=sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))&key=${encodeURIComponent(sheetsKey)}`);
if (!res.ok) throw new Error('Sheets-API antwortet ' + res.status);
const rows = (await res.json()).sheets?.[0]?.data?.[0]?.rowData || [];
const header = rows.find(r => (r.values || []).some(v => v.formattedValue?.trim() === 'Anime Titel'))?.values || [];
const hex = c => '#' + ['red', 'green', 'blue'].map(k => Math.round((c[k] || 0) * 255).toString(16).padStart(2, '0')).join('');
return Object.fromEntries(header.flatMap(v => v.formattedValue?.trim() && v.effectiveFormat?.backgroundColor
? [[v.formattedValue.trim(), hex(v.effectiveFormat.backgroundColor)]] : []));
}
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
const SHEET_ID = SHEET.split('/d/')[1];
let configPromise = null;
const config = () => configPromise ??= fetch('config.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
async function hiddenRows(tab) {
const { sheetsKey } = await config();
if (!sheetsKey) throw new Error('kein Sheets-API-Schlüssel');
const range = encodeURIComponent(`'${tab.name.replace(/'/g, "''")}'!A1:AZ300`);
const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}` +
`&fields=sheets(data(rowMetadata(hiddenByUser),columnMetadata(hiddenByUser)))&key=${encodeURIComponent(sheetsKey)}`);
if (!res.ok) throw new Error('Sheets-API antwortet ' + res.status);
const data = (await res.json()).sheets?.[0]?.data?.[0] || {};
return {
rows: new Set((data.rowMetadata || []).flatMap((r, i) => r.hiddenByUser ? [i + 1] : [])),
cols: new Set((data.columnMetadata || []).flatMap((c, i) => c.hiddenByUser ? [i] : [])),
};
}
async function loadSheet(gid, hidden = null) {
const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`);
if (!res.ok) throw new Error('Google Sheet antwortet ' + res.status);
return sheetFromRows(parseCsv(await res.text()), hidden);
}
function sheetFromRows(rows, hidden = null) {
const headerIndex = rows.findIndex(r => r.some(c => c.trim() === 'Anime Titel'));
const header = rows[headerIndex]?.map(c => c.trim()) || [];
const col = name => header.indexOf(name);
for (const name of ['Anime Titel', 'Tag', 'Uhrzeit'])
if (col(name) < 0) throw new Error(`die Tabelle hat keine Spalte „${name}“ mehr`);
const columns = header.flatMap((name, i) => i > col('Uhrzeit') && name ? [{ name, hidden: !!hidden?.cols.has(i) }] : []);
const people = columns.filter(c => !c.hidden).map(c => c.name);
const shows = [];
for (const [i, r] of rows.entries()) {
if (i <= headerIndex) continue;
const romaji = (r[col('Anime Titel')] || '').trim();
if (!romaji) break;
const votes = {};
for (const { name: p } of columns) votes[p] = (r[header.indexOf(p)] || '').trim().replace(/,$/, '');
const show = {
romaji, english: (r[col('Eng Anime Titel')] || '').trim(),
wo: (r[col('Wo')] || '').trim().toUpperCase(),
tag: (r[col('Tag')] || '').trim(), time: (r[col('Uhrzeit')] || '').trim(), votes,
start: (r[col('Startdatum')] || '').trim(), sort: (r[col('Sort')] || '').trim(), slot: (r[col('Slot')] || '').trim(),
hidden: !!hidden?.rows.has(i + 1),
};
const twin = shows.findIndex(s => norm(s.romaji) === norm(romaji));
if (twin < 0) shows.push(show);
else if (shows[twin].hidden && !show.hidden) shows[twin] = show;
}
return { people, columns, shows };
}
function picks(sheet, person) {
const result = new Map();
const add = (show, slot) => { if (!result.get(show)?.time) result.set(show, slot); };
for (const show of sheet.shows) {
if (show.hidden) continue;
const v = show.votes[person] || '';
if (/^(ja|vielleicht)$|^wenn belly/i.test(v)) add(show, { tag: show.tag, time: show.time, slot: show.slot });
else if (v && !/^(nein|default|allein)$/i.test(v)) {
const named = resolveName(sheet, v);
if (named) add(named, { tag: show.tag || named.tag, time: show.time, slot: show.slot });
else add(show, { tag: show.tag, time: show.time, slot: show.slot });
}
}
return result;
}
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
const normalized = new Map();
const norm = s => {
const text = String(s || '');
let out = normalized.get(text);
if (out === undefined) {
out = text.normalize('NFKD').toLowerCase()
.replace(/½/g, '12').replace(/\b(\d+)(st|nd|rd|th) season\b/g, 'season $1')
.replace(/\b(\d+)(st|nd|rd|th) cour\b|\bcour (\d+)\b/g, (m, a, b, c) => `part ${a || c}`)
.replace(/[^a-z0-9]/g, '');
normalized.set(text, out);
}
return out;
};
function titleScore(a, b) {
const A = a.map(norm).filter(Boolean), B = b.map(norm).filter(Boolean);
if (A.some(x => B.includes(x))) return 2;
return A.some(x => B.some(y => Math.min(x.length, y.length) >= 8 && (x.startsWith(y) || y.startsWith(x)))) ? 1 : 0;
}
const titleMatches = (a, b) => titleScore(a, b) > 0;
const mediaTitles = m => [m.title.romaji, m.title.english, ...(m.synonyms || [])];
const RETRY_WAITS = [4000, 12000, 30000];
const aniLimit = { limit: 0, remaining: Infinity, sent: [], count: 0, until: 0 };
let onAniListPause = null;
function aniMinuteEnd() {
const now = Date.now();
aniLimit.sent = aniLimit.sent.filter(t => now - t < 60000);
return (aniLimit.sent[0] || now) + 60000;
}
const TITLE_FIXES = {
209872: 'Ranma ½ (2024) Season 3', 216557: 'Keroro Gunsou☆', 209032: 'Magical Sisters Lulutto Lilly Part 2',
160803: 'Magical Girl Raising Project: Restart', 179876: 'Dark Machine: The Animation', 199426: 'Hotel Inhumans Season 2',
203473: 'Horror Collector', 209499: 'Tank Chair', 204650: 'Tougen Anki: Nikko Kegon Falls Arc',
199594: 'Tetsuryo! Meet with Railroad Girls', 187990: 'Battle Spirits [Re]: Zekkai no Kuu', 187316: 'Suikoden: The Anime',
207191: 'Hello, I Am a Witch and My Crush Wants Me to Make a Love Potion!', 172192: "A Returner's Magic Should Be Special Season 2",
213658: 'Ace of Diamond Act II Season 2 Part 2', 198727: 'Chitose Is in the Ramune Bottle Part 2',
};
function fixTitles(data) {
const seen = new Set();
const walk = v => {
if (!v || typeof v !== 'object' || seen.has(v)) return;
seen.add(v);
if (Array.isArray(v)) { v.forEach(walk); return; }
const fix = TITLE_FIXES[v.id];
if (fix && v.title && typeof v.title === 'object' && v.title.english !== fix) {
if (v.title.english) v.synonyms = [...(v.synonyms || []), v.title.english];
v.title.english = fix;
}
for (const k in v) walk(v[k]);
};
walk(data);
return data;
}
async function anilist(query, variables = {}, token, options = {}) {
for (let attempt = 0; ; attempt++) {
if (aniLimit.until > Date.now()) {
onAniListPause?.(aniLimit.until);
await new Promise(r => setTimeout(r, aniLimit.until - Date.now()));
aniLimit.remaining = Infinity;
}
aniLimit.sent.push(Date.now());
aniLimit.count++;
let res = null;
try {
res = await fetch(API, {
signal: AbortSignal.timeout(options.timeout || 12000),
method: 'POST',
headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
body: JSON.stringify({ query, variables }),
});
} catch {}
const left = res?.headers?.get?.('x-ratelimit-remaining');
if (left != null && left !== '') {
aniLimit.remaining = Number(left);
aniLimit.limit = Number(res.headers.get('x-ratelimit-limit')) || aniLimit.limit;
if (aniLimit.remaining <= 0) aniLimit.until = aniMinuteEnd();
}
if (res && res.status !== 429 && res.status < 500) {
if (res.status === 401) throw Object.assign(new Error('AniList-Anmeldung abgelaufen, bitte neu verbinden'), { status: 401 });
const json = await res.json().catch(() => ({}));
if (json.errors?.length) throw Object.assign(new Error(json.errors[0].message), { status: res.status });
return fixTitles(json.data);
}
if (attempt >= (options.retries ?? RETRY_WAITS.length) || (!res && navigator.onLine === false)) throw new Error("AniList antwortet gerade nicht (es begrenzt, wie oft man fragen darf). Versuch es in einer Minute nochmal");
if (res?.status === 429 || (!res && aniLimit.remaining <= 2)) { aniLimit.until = Math.max(aniLimit.until, aniMinuteEnd()); continue; }
const status = document.querySelector('#list .status');
if (status) status.textContent = 'AniList ist beschäftigt, neuer Versuch…';
await new Promise(r => setTimeout(r, RETRY_WAITS[attempt]));
}
}
const WEEKDAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const NIGHT_UNTIL = 6;
const parseTime = time => (time || '').match(/^(\d{1,2})[:.](\d{2})/)?.slice(1).map(Number);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => esc(/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : '#');
function isSeasonFinalWeek(now = new Date()) {
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
const last=new Date(Date.UTC(parts.year,parts.month,0)).getUTCDate();
return parts.month%3===0 && parts.day>last-7;
}

