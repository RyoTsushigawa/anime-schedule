// Main page, part 6: loading the views, moving shows (moves.json), Nachholen and the catch-up planner.
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
// absentDays: [{ day, people }] for the whole day, or with from ("ab 21:00") / until ("bis 20:00"),
// or maybe: true ("spontan da": not planned with, but might turn up).
// absentRules: weekly absences without an end, [{ id, person, weekdays: [0 = Mo … 6 = So], start, end?,
// from? | until? | maybe?, skip?: [days it doesn't apply] }]. moves.json keeps both ("absent", "absentRules");
// absencesForDay combines dated entries and recurring rules for the requested day.
let absentDays = [], absentRules = [], movesUpdated = '';
const ruleWeekday = day => (new Date(day + 'T12:00:00').getDay() + 6) % 7;
const ruleCovers = (r, day) => day >= r.start && (!r.end || day <= r.end) && r.weekdays.includes(ruleWeekday(day));
const ruleKind = r => r.maybe ? { maybe: true } : r.from ? { from: r.from } : r.until ? { until: r.until } : {};
function goodRules(list) {
return (Array.isArray(list) ? list : []).filter(r => r && typeof r.person === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.start)
  && Array.isArray(r.weekdays) && r.weekdays.length && (!r.end || r.end >= r.start));
}
const absencesForDay = day => [
  ...absentDays.filter(x => x.day === day),
  ...absentRules.filter(rule => ruleCovers(rule, day) && !rule.skip?.includes(day))
    .map(rule => ({ day, people: [rule.person], ...ruleKind(rule), rule: rule.id }))
];
const absentOn = date => absencesForDay(date).filter(x => !x.from && !x.until && !x.maybe).flatMap(x => x.people || []);
const clockMinutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
// minute: minutes after the day's midnight (after midnight counts on: 00:30 = 1470); null = unknown time
const awayAt = (date, person, minute) => absencesForDay(date).some(x => x.people?.includes(person)
&& (!x.from || (minute != null && minute >= clockMinutes(x.from)))
&& (!x.until || (minute != null && minute < clockMinutes(x.until))));
const awayLabel = x => x.maybe ? 'spontan da' : x.from ? `ab ${x.from}` : x.until ? `bis ${x.until}` : 'ganztägig';
const awayText = date => absencesForDay(date).flatMap(x => (x.people || []).map(p => x.from || x.until || x.maybe ? `${p} (${awayLabel(x)})` : p));
let reasonList = [];
let delaysUrl = '';
config().then(c => { if (c.delaysUrl) { delaysUrl = c.delaysUrl; if (lastWeekRender && view === 'week') render(...lastWeekRender); refreshEditor(); } });
let movesKey = '';
try { movesKey = localStorage.getItem('movesKey') || ''; } catch {}
// N61 Bearbeiter-Zugang: a trusted member moves shows with their own code instead of the owner's GitHub key.
// The owner creates the codes (a link "#editor=…"); moves.json "editors" keeps only each code's SHA-256, and
// the delays helper (v20+) checks it before it saves. Keys, editors and everything else stay owner-only.
let editorCode = '', editorName = '', editorList = [];
try { editorCode = localStorage.getItem('editorCode') || ''; } catch {}
if (location.hash.startsWith('#editor=')) {
editorCode = decodeURIComponent(location.hash.slice(8)).trim();
try { localStorage.setItem('editorCode', editorCode); } catch {}
history.replaceState(null, '', location.pathname + location.search);
}
const canMove = () => !!movesKey || (!!editorName && !!delaysUrl);
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
async function refreshEditor() {
const before = canMove();
let name = '';
try { if (editorCode && !movesKey) { const hash = await sha256Hex(editorCode); name = editorList.find(e => e?.hash === hash)?.name || ''; } } catch {}
editorName = name;
$('moveToggle').hidden = !canMove();
$('movesSetup').hidden = !movesKey && !editorCode;
syncMoveEditor();
if (before !== canMove() && lastWeekRender && view === 'week') render(...lastWeekRender, false, true);
}
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
movesUpdated = newest?.updated || '';
absentDays = Array.isArray(newest?.absent) ? newest.absent : [];
absentRules = goodRules(newest?.absentRules);
reasonList = goodReasons(newest?.reasons);
editorList = Array.isArray((site || newest)?.editors) ? (site || newest).editors : [];
refreshEditor();
}
function moveFor(show, monday) {
const key = norm(show.romaji || show.english);
return moves.find(m => m.show === key && m.week === isoDay(monday)) || moves.find(m => m.show === key && !m.week);
}
let movesQueue = Promise.resolve(), movesPending = 0;
function saveMoves(next, changeDelays = null, reasons = null, absentNext = null) {
next = next.filter(m => !m.week || Date.parse(m.week) > Date.now() - 14 * 86400000);
const before = { moves, absentDays, absentRules };
if (!changeDelays) {
moves = next;
if (absentNext) { absentDays = absentNext.days; absentRules = absentNext.rules; }
if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true);
}
movesPending++;
const job = movesQueue.catch(() => {}).then(() => saveMovesNow(next, changeDelays, reasons, absentNext)).finally(() => movesPending--);
movesQueue = job;
return job.catch(e => {
if (!changeDelays) { moves = before.moves; absentDays = before.absentDays; absentRules = before.absentRules; if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true); }
throw e;
});
}
let movesWritten = null;
async function saveMovesNow(next, changeDelays, reasons, absentNext) {
if (!movesKey) return saveMovesAsEditor(next, changeDelays || reasons || absentNext);
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
const nextAbsent = (absentNext?.days || (Array.isArray(remote.absent) ? remote.absent : [])).filter(x => Date.parse(x.day) > Date.now() - 2 * 86400000 && x.people?.length);
// rules that ended more than two days ago go, like single days
const nextRules = goodRules(absentNext ? absentNext.rules : remote.absentRules).filter(r => !r.end || Date.parse(r.end) > Date.now() - 2 * 86400000);
const file = { updated: new Date().toISOString(), moves: changeDelays ? (remote.moves || next) : next, ...(nextDelays.length && { delays: nextDelays }), ...(nextAbsent.length && { absent: nextAbsent }), ...(nextRules.length && { absentRules: nextRules }), ...(Array.isArray(remote.editors) && remote.editors.length && { editors: remote.editors }), reasons: reasons || (remoteReasons.length ? remoteReasons : DELAY_REASONS) };
const content = btoa(unescape(encodeURIComponent(JSON.stringify(file, null, 1) + '\n')));
const res = await fetch(MOVES_API, { method: 'PUT', headers,
body: JSON.stringify({ message: reasons ? 'Verspätungsgründe' : absentNext ? 'Abwesend' : changeDelays ? 'Verspätung' : 'Move shows', content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
if (res.ok) {
const sha = (await res.json().catch(() => null))?.content?.sha;
movesWritten = sha && meta?.sha ? { replaced: meta.sha, sha, file } : null;
const later = movesPending > 1;
if (!later) { moves = file.moves; absentDays = nextAbsent; absentRules = nextRules; }
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
// N61: an editor's moves go through the delays helper, which checks the code
async function saveMovesAsEditor(next, other) {
if (other || !editorName || !delaysUrl) throw new Error('kein Bearbeitungszugang');
const res = await fetch(delaysUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editor: editorCode, moves: next }) });
const file = await res.json().catch(() => ({}));
if (!res.ok) {
if (res.status === 403 && /Bearbeiter/.test(file.error || '')) { editorName = ''; refreshEditor(); }
const old = Number(res.headers?.get?.('X-Helper-Version')) < 20;
throw new Error(old ? 'der Speicher-Dienst kann noch keine Bearbeiter (Version 20 nötig)' : file.error || `Speicher-Dienst antwortet ${res.status}`);
}
if (movesPending <= 1) { moves = file.moves || []; absentDays = Array.isArray(file.absent) ? file.absent : []; absentRules = goodRules(file.absentRules); }
delays = file.delays || [];
movesSeen = movesStamp();
try { localStorage.setItem('movesOwn', JSON.stringify(file)); } catch {}
}
const movesStamp = () => JSON.stringify([moves, delays, absentDays, absentRules]);
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
$('movesSetup').hidden = !movesKey && !editorCode;
$('moveToggle').hidden = !canMove();
syncMoveEditor();
function openKeyDialog() {
$('keyInput').value = '';
$('keyMsg').textContent = movesKey ? 'In diesem Browser ist ein Schlüssel gespeichert.' : '';
drawEditorBoxes();
$('keyDlg').showModal();
}
$('movesSetup').onclick = openKeyDialog;
// N61: the owner's list of editors (name, date); an editor sees their own access
function drawEditorBoxes() {
$('editorAdmin').hidden = !movesKey;
$('editorSelf').hidden = !!movesKey || !editorCode;
$('editorSelfText').textContent = editorName ? `Du darfst als ${editorName} Serien verschieben.` + (delaysUrl ? '' : ' Der Speicher-Dienst ist gerade nicht erreichbar.')
  : 'Dieser Bearbeiter-Link gilt nicht (mehr). Frag nach einem neuen.';
$('editorList').innerHTML = editorList.length ? editorList.map(e => `<li><b>${esc(e.name)}</b><span>seit ${esc(new Date(e.at).toLocaleDateString('de-DE'))} <button type="button" class="pill" data-editor-remove="${esc(e.hash)}">Entfernen</button></span></li>`).join('')
  : '<li class="muted">Noch niemand.</li>';
}
// the owner changes the editors in moves.json directly (GitHub key); nothing else in the file changes
async function saveEditors(change) {
const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
for (let attempt = 0; attempt < 4; attempt++) {
const current = await fetch(MOVES_API + '?ref=main&_=' + Date.now(), { headers, cache: 'no-store' });
const meta = current.ok ? await current.json() : null;
let file = { moves: [] };
try { if (meta?.content) file = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch {}
const editors = change(Array.isArray(file.editors) ? file.editors : []);
const next = { ...file, updated: new Date().toISOString(), editors };
if (!editors.length) delete next.editors;
const content = btoa(unescape(encodeURIComponent(JSON.stringify(next, null, 1) + '\n')));
const res = await fetch(MOVES_API, { method: 'PUT', headers, body: JSON.stringify({ message: 'Bearbeiter', content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
if (res.ok) { editorList = editors; movesWritten = null; try { localStorage.setItem('movesOwn', JSON.stringify(next)); } catch {} return; }
if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : `GitHub antwortet ${res.status}`);
}
throw new Error('gerade gleichzeitig gespeichert, bitte nochmal versuchen');
}
$('editorAdd').onclick = async () => {
const name = $('editorNameInput').value.trim().replace(/[<>]/g, '').slice(0, 40);
if (!name) { $('editorMsg').textContent = 'Erst einen Namen eintragen.'; return; }
const bytes = crypto.getRandomValues(new Uint8Array(24));
const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hash = await sha256Hex(code);
$('editorAdd').disabled = true;
$('editorMsg').textContent = 'Wird gespeichert …';
try {
await saveEditors(list => list.filter(e => e.name !== name).concat({ name, hash, at: new Date().toISOString() }));
const link = location.origin + location.pathname + '#editor=' + encodeURIComponent(code);
let copied = false;
try { await navigator.clipboard.writeText(link); copied = true; } catch {}
$('editorMsg').textContent = (copied ? 'Link kopiert, nur diese eine Person schicken (z. B. per Discord-DM): ' : 'Diesen Link nur dieser einen Person schicken (z. B. per Discord-DM): ') + link;
$('editorNameInput').value = '';
drawEditorBoxes();
} catch (e) { $('editorMsg').textContent = 'Nicht gespeichert: ' + e.message; }
finally { $('editorAdd').disabled = false; }
};
$('editorList').addEventListener('click', async e => {
const b = e.target.closest('[data-editor-remove]');
if (!b) return;
b.disabled = true;
try { await saveEditors(list => list.filter(x => x.hash !== b.dataset.editorRemove)); $('editorMsg').textContent = 'Entfernt; der Link gilt nicht mehr.'; drawEditorBoxes(); }
catch (err) { $('editorMsg').textContent = 'Nicht entfernt: ' + err.message; b.disabled = false; }
});
$('editorLeave').onclick = () => {
editorCode = ''; editorName = '';
try { localStorage.removeItem('editorCode'); } catch {}
refreshEditor();
drawEditorBoxes();
$('keyMsg').textContent = 'Bearbeiter-Zugang aus diesem Browser entfernt.';
};
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
$('movesSetup').hidden = $('moveToggle').hidden = $('repairButton').hidden = $('deliveryButton').hidden = false;
syncMoveEditor();
drawEditorBoxes();
$('keyMsg').textContent = 'Gespeichert.';
load(true);
} catch (e) { $('keyMsg').textContent = `Nicht gespeichert: ${e.message}`; }
};
$('keyRemove').onclick = () => {
movesKey = '';
$('repairButton').hidden = $('deliveryButton').hidden = true;
refreshEditor();
drawEditorBoxes();
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
if (!canMove() || !b) return;
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
if (!canMove()) return;
const x = source.extra ? source : null;
const r = x ? null : source;
const m = x ? x.media : r.m;
const first = x ? x.first : r.first, out = x ? x.out : r.out;
planning = { m: x ? x.media : slimMedia(m), first, out, old: x };
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
// Smart catch-up planner: spreads the open episodes over this week's remaining evenings as "Nachholen"
// entries (one per show and week, time empty = next free slot). Shows whose next episode comes soonest go
// first, each on the least busy evening before that episode if possible; leftovers wait for next week.
const slimMedia = m => ({ id: m.id, title: { romaji: m.title.romaji, english: m.title.english }, coverImage: { medium: m.coverImage?.medium || '' }, siteUrl: m.siteUrl, episodes: m.episodes || null, duration: m.duration || null, externalLinks: (m.externalLinks || []).map(l => ({ site: l.site, url: l.url })) });
// N80: budgets { day: minutes } limit each evening by time too (episode length from AniList, else 24 min);
// a day without a budget is limited only by the number of episodes
const episodeMinutes = m => m?.duration || 24;
function autoCatchupPlan(rows, days, max, week, existing = [], budgets = null) {
const ids = new Set(rows.map(r => `extra:${r.m.id}`));
const load = new Map(days.map(d => [d, 0])), minutes = new Map(days.map(d => [d, 0]));
for (const x of existing) if (x.extra && x.week === week && !ids.has(x.show) && load.has(x.day)) {
  load.set(x.day, load.get(x.day) + x.last - x.first + 1);
  minutes.set(x.day, minutes.get(x.day) + (x.last - x.first + 1) * episodeMinutes(x.media));
}
const room = (d, length) => Math.min(max - load.get(d), budgets?.[d] ? Math.floor((budgets[d] - minutes.get(d)) / length) : Infinity);
const order = rows.filter(r => !r.missing && r.out >= r.first)
  .sort((a, b) => (a.nextAt || Infinity) - (b.nextAt || Infinity) || (a.out - a.first) - (b.out - b.first));
const entries = [];
let left = 0;
for (const r of order) {
  const open = r.out - r.first + 1, length = episodeMinutes(r.m);
  const free = days.filter(d => room(d, length) > 0);
  const before = r.nextAt ? free.filter(d => new Date(d + 'T23:59').getTime() / 1000 < r.nextAt) : free;
  const pick = (before.length ? before : free).sort((a, b) => load.get(a) - load.get(b) || a.localeCompare(b))[0];
  if (!pick) { left += open; continue; }
  const count = Math.min(open, room(pick, length));
  load.set(pick, load.get(pick) + count);
  minutes.set(pick, minutes.get(pick) + count * length);
  left += open - count;
  const m = slimMedia(r.m);
  entries.push({ show: `extra:${m.id}`, title: m.title.english || m.title.romaji, extra: true, media: m, first: r.first, last: r.first + count - 1, out: r.out, day: pick, time: '', week });
}
return { entries, left, minutes: Object.fromEntries(minutes) };
}
let autoPlan = null;
// time budget per weekday (0 = Mo … 6 = So), remembered in this browser; none = only the episode limit
const AUTO_BUDGETS = [0, 30, 45, 60, 90, 120, 180];
let autoBudgets = {};
try { autoBudgets = JSON.parse(localStorage.getItem('autoPlanBudgets') || '{}') || {}; } catch {}
const budgetWeekday = d => (new Date(d + 'T12:00').getDay() + 6) % 7;
const planClock = ms => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// when the evening's own plan ends: the last regular slot (not catch-up) plus one slot
function eveningEnd(day) {
const found = typeof discordDay === 'function' ? discordDay(day) : null;
const times = (found?.groups || []).flat().filter(r => !r.extra && Number.isFinite(r.watchAt)).map(r => r.watchAt);
return times.length ? Math.max(...times) + SLOT_MINUTES * 60000 : null;
}
function drawAutoPlan() {
const max = Number($('autoPlanMax').value);
const days = [...document.querySelectorAll('#autoPlanDays input:checked')].map(i => i.value);
const week = isoDay(weekStart(0));
const budgets = Object.fromEntries(days.map(d => [d, Number(autoBudgets[budgetWeekday(d)]) || 0]));
autoPlan = autoCatchupPlan([...catchupById.values()], days, max, week, moves, budgets);
const byDay = days.map(d => [d, autoPlan.entries.filter(e => e.day === d)]);
const budgetPick = d => `<select class="auto-plan-budget" data-budget-day="${budgetWeekday(d)}" aria-label="Zeit zum Nachholen">${AUTO_BUDGETS.map(v => `<option value="${v}"${v === budgets[d] ? ' selected' : ''}>${v ? v + ' Min.' : 'Zeit offen'}</option>`).join('')}</select>`;
const timing = d => {
  const end = eveningEnd(d), used = autoPlan.minutes[d] || 0;
  const parts = [end ? 'ab ' + planClock(end) : 'Abend ohne Plan', used && end ? 'bis ca. ' + planClock(end + used * 60000) : '', budgets[d] ? `${used} von ${budgets[d]} Min.` : used ? `${used} Min.` : ''];
  return `<small class="auto-plan-time">${esc(parts.filter(Boolean).join(' · '))}</small>`;
};
$('autoPlanPreview').innerHTML = !days.length ? '<div class="muted">Mindestens einen Abend wählen.</div>'
  : byDay.map(([d, list]) => `<div class="auto-plan-day"><b>${esc(new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }))}</b><span>${list.length
    ? list.map(e => `${esc(e.title)} <small>${e.last > e.first ? `${e.first}–${e.last}` : e.first}</small>`).join(' · ') : '<span class="muted">nichts</span>'}<br>${timing(d)}</span>${budgetPick(d)}</div>`).join('')
  + (autoPlan.left ? `<div class="muted">${autoPlan.left} ${autoPlan.left === 1 ? 'Folge bleibt' : 'Folgen bleiben'} für nächste Woche.</div>` : '');
$('autoPlanSave').disabled = !autoPlan.entries.length;
}
$('autoPlanPreview').addEventListener('change', e => {
const pick = e.target.closest('[data-budget-day]');
if (!pick) return;
autoBudgets[pick.dataset.budgetDay] = Number(pick.value);
try { localStorage.setItem('autoPlanBudgets', JSON.stringify(autoBudgets)); } catch {}
drawAutoPlan();
});
$('list').addEventListener('click', e => {
if (!e.target.closest('#autoPlanOpen')) return;
const today = new Date(); today.setHours(0, 0, 0, 0);
const days = Array.from({ length: 7 }, (_, i) => { const d = weekStart(0); d.setDate(d.getDate() + i); return d; }).filter(d => d >= today);
$('autoPlanDays').innerHTML = days.map(d => `<label class="auto-plan-check"><input type="checkbox" value="${isoDay(d)}" checked> ${esc(nearDayName(d) || shortDayName(d))}</label>`).join('');
try { $('autoPlanMax').value = localStorage.getItem('autoPlanMax') || '2'; } catch {}
$('autoPlanMsg').textContent = '';
drawAutoPlan();
$('autoPlanDlg').showModal();
});
$('autoPlanMax').onchange = () => { try { localStorage.setItem('autoPlanMax', $('autoPlanMax').value); } catch {} drawAutoPlan(); };
$('autoPlanDays').onchange = drawAutoPlan;
$('autoPlanSave').onclick = () => {
if (!autoPlan?.entries.length) return;
const week = isoDay(weekStart(0)), keys = new Set(autoPlan.entries.map(e => e.show));
const next = moves.filter(x => !(keys.has(x.show) && x.week === week)).concat(autoPlan.entries);
const count = autoPlan.entries.reduce((n, e) => n + e.last - e.first + 1, 0);
storeMoves(next, `${count} ${count === 1 ? 'Folge' : 'Folgen'} zum Nachholen eingeplant.`, 'autoPlanDlg', 'autoPlanMsg');
};
$('planRemove').onclick = () => {
const { m, old } = planning;
storeMoves(moves.filter(x => x !== old), `${m.title.english || m.title.romaji}: Nachholen entfernt.`, 'planDlg', 'planMsg');
};
