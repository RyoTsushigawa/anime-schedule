// Main page, part 8: delays (Verspätung) and absences (Abwesend).
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
if (Array.isArray(body.moves)) { // the whole saved file
  absentDays = Array.isArray(body.absent) ? body.absent : [];
  absentRules = goodRules(body.absentRules);
}
if (body.reasons) reasonList = goodReasons(body.reasons);
movesSeen = movesStamp();
try { localStorage.setItem('movesOwn', JSON.stringify(body)); } catch {}
return body;
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
// Abwesenheiten: two tabs. "Kalender" is a month calendar (top bar button, or any day's "Abwesend") for one day
// or a range, the whole day or only "ab"/"bis" a time. "Wiederkehrend" sets up weekly absences: who, which
// weekdays, the kind, from when and (if at all) until when. Those are saved as rules (absentRules, see
// app-moves.js) with no end needed; a single day of a rule can still be changed in the calendar, which saves
// it as an exception of the rule. Shows with too few people left are skipped on the schedule and in Discord.
const awayCal = { month: null, start: null, end: null, mode: 'day', tab: 'calendar', allOnce: false, extra: [] };
const awayRep = { people: [], weekdays: [], mode: 'day', edit: null };
const AWAY_SHOWN = 4, AWAY_AHEAD = 400;
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const AWAY_WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const allPeople = () => {
const fromPlan = lastWeekRender ? [...new Set([...lastWeekRender[2].values()].flatMap(s => s.people))] : [];
return fromPlan.length ? fromPlan : [...$('soloPerson').options].map(o => o.value);
};
const dayOf = iso => new Date(iso + 'T12:00:00');
const addDay = (iso, n) => { const d = dayOf(iso); d.setDate(d.getDate() + n); return isoDay(d); };
const shortDate = iso => `${shortDayName(dayOf(iso))} ${germanDate(dayOf(iso))}`;
const weekdayOf = ruleWeekday; // 0 = Monday
const plain = ({ rule, ...x }) => x;
function selectedDays() {
if (!awayCal.start) return [];
const days = [];
for (let d = awayCal.start; d <= (awayCal.end || awayCal.start) && days.length < 92; d = addDay(d, 1)) days.push(d);
return days;
}
// Rules in one fixed shape, so the site and the save service can compare them
function canonRule(r) {
const skip = [...new Set(r.skip || [])].filter(d => d >= addDay(isoDay(new Date()), -2) && ruleCovers({ ...r, skip: [] }, d)).sort();
return { id: r.id, person: r.person, weekdays: [...new Set(r.weekdays)].sort(), start: r.start, ...(r.end && { end: r.end }), ...ruleKind(r), ...(skip.length && { skip }) };
}
// the save service drops what's over a little earlier or later than the site: only compare from today on
const rulesFromToday = list => JSON.stringify(goodRules(list).map(canonRule).filter(r => !r.end || r.end >= isoDay(new Date()))
  .map(r => ({ ...r, skip: (r.skip || []).filter(d => d >= isoDay(new Date())) })));
const newRuleId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
// The absences (single days, including occurrences of rules) with the people in `on` set on `days`, the rest left as
// they are. Whole day: replaces their "ab"/"bis"/"spontan da" there; people in `off` lose their whole day.
function withAway(list, days, on, mode, time, off = []) {
const kept = list.flatMap(x => {
  if (!days.includes(x.day)) return [x];
  const timed = x.from || x.until || x.maybe;
  const people = (x.people || []).filter(p => !on.includes(p) && (mode !== 'day' || timed || !off.includes(p)));
  return people.length ? [{ ...x, people }] : [];
});
const added = !on.length ? [] : days.map(day => mode === 'day' ? { day, people: on } : { day, people: on, [mode]: time });
return kept.concat(added).sort((a, b) => a.day.localeCompare(b.day));
}
// What `days` should look like (wanted, single days) → saved single days and rules: a day a rule still gives
// stays the rule's (an old exception there goes), a day it no longer gives becomes an exception of the rule.
function splitAway(wanted, days) {
const want = wanted.filter(x => days.includes(x.day)).map(x => ({ ...plain(x), people: [...x.people] }));
const rules = absentRules.map(r => ({ ...r, skip: [...(r.skip || [])] }));
for (const r of rules) for (const d of days) {
  if (!ruleCovers(r, d)) continue;
  const hit = want.find(x => x.day === d && x.people.includes(r.person) && awayLabel(x) === awayLabel(ruleKind(r)));
  if (hit) { hit.people = hit.people.filter(p => p !== r.person); r.skip = r.skip.filter(s => s !== d); }
  else if (!r.skip.includes(d)) r.skip.push(d);
}
return {
  days: absentDays.filter(x => !days.includes(x.day)).concat(want.filter(x => x.people.length)).sort((a, b) => a.day.localeCompare(b.day)),
  rules: rules.map(canonRule),
};
}
function withoutRun(list, run, days) {
return list.flatMap(x => {
  if (!days.includes(x.day) || awayLabel(x) !== run.cond) return [x];
  const who = run.people || [run.p];
  const people = (x.people || []).filter(p => !who.includes(p));
  return people.length ? [{ ...x, people }] : [];
});
}
// Saved single days, grouped for the lists: a weekly series (from before rules: the same person, kind and
// weekday every 7 days, at least 3 times, not just the inside of one long stretch); the rest single days or ranges.
function awayRuns() {
const groups = new Map();
for (const x of absentDays) for (const p of x.people || []) {
  const key = JSON.stringify([p, awayLabel(x)]);
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key).add(x.day);
}
const runs = [];
for (const [key, set] of groups) {
  const [p, cond] = JSON.parse(key), dates = [...set].sort(), has = new Set(dates), used = new Set();
  const stretch = new Map();
  dates.forEach((d, i) => stretch.set(d, i && addDay(dates[i - 1], 1) === d ? stretch.get(dates[i - 1]) : d));
  for (const d of dates) {
    if (used.has(d)) continue;
    const chain = [d];
    while (has.has(addDay(chain.at(-1), 7)) && !used.has(addDay(chain.at(-1), 7))) chain.push(addDay(chain.at(-1), 7));
    if (chain.length >= 3 && new Set(chain.map(c => stretch.get(c))).size > 1) {
      chain.forEach(c => used.add(c));
      runs.push({ p, cond, weekly: true, weekday: weekdayOf(d), days: chain, from: chain[0], to: chain.at(-1) });
    }
  }
  for (const d of dates) {
    if (used.has(d)) continue;
    const prev = runs.at(-1);
    if (prev && !prev.weekly && prev.p === p && prev.cond === cond && addDay(prev.to, 1) === d) { prev.to = d; prev.days.push(d); }
    else runs.push({ p, cond, days: [d], from: d, to: d });
  }
}
// what's left from today on (past days stay saved, but aren't offered for editing)
const today = isoDay(new Date());
return runs.map(r => {
  const days = r.days.filter(d => d >= today);
  return days.length ? { ...r, days, from: days[0], to: days.at(-1) } : null;
}).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from) || a.p.localeCompare(b.p));
}
// the same days and kind for several people: one row
function mergedRuns(weekly) {
const out = [];
for (const r of awayRuns().filter(r => !!r.weekly === weekly)) {
  const same = out.find(x => x.cond === r.cond && x.days.join() === r.days.join());
  if (same) same.people.push(r.p); else out.push({ ...r, people: [r.p] });
}
return out;
}
// Rules for the list: one row for people with the same weekdays, kind and dates
function ruleGroups() {
const out = [];
for (const r of absentRules) {
  const key = JSON.stringify([r.weekdays, awayLabel(ruleKind(r)), r.start, r.end || '']);
  const same = out.find(g => g.key === key);
  if (same) { same.people.push(r.person); same.ids.push(r.id); }
  else out.push({ key, ids: [r.id], people: [r.person], weekdays: r.weekdays, cond: awayLabel(ruleKind(r)), start: r.start, end: r.end || '' });
}
return out.sort((a, b) => a.weekdays[0] - b.weekdays[0] || a.people[0].localeCompare(b.people[0]));
}
function showAwayTab(tab) {
awayCal.tab = tab === 'recurring' ? 'recurring' : 'calendar';
const calendar = awayCal.tab === 'calendar';
$('awayCalendarPanel').hidden = !calendar;
$('awayRecurringPanel').hidden = calendar;
$('awayTabCalendar').setAttribute('aria-selected', String(calendar));
$('awayTabRecurring').setAttribute('aria-selected', String(!calendar));
$('awayMsg').textContent = '';
if (calendar) drawAway(); else drawRepeat();
}
function openAway(date) {
const today = isoDay(new Date());
const pick = date && date >= today ? date : null;
awayCal.month = (pick || today).slice(0, 7);
awayCal.start = pick; awayCal.end = null; awayCal.mode = 'day'; awayCal.allOnce = false; awayCal.extra = [];
// in Solo view the dialog starts with that person chosen, until someone picks by hand
awayCal.me = mode === 'solo' && soloPerson ? soloPerson : null;
resetRepeat();
showAwayTab('calendar');
$('awayDlg').showModal();
}
function drawAway() {
const today = isoDay(new Date());
const [y, m] = awayCal.month.split('-').map(Number);
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
$('awayHint').textContent = !awayCal.start ? 'Tag antippen · für einen Zeitraum danach den letzten Tag.'
  : awayCal.end ? `${chosen.length} Tage ausgewählt.` : 'Für einen Zeitraum noch den letzten Tag antippen.';
const cells = AWAY_WEEKDAYS.map(d => `<span class="away-wd">${d}</span>`);
for (let i = 0; i < lead; i++) cells.push('<span class="away-empty" aria-hidden="true"></span>');
for (let n = startDay; n <= length; n++) {
const iso = `${awayCal.month}-${String(n).padStart(2, '0')}`;
const entries = absencesForDay(iso);
const dots = entries.flatMap(x => (x.people || []).map(p => `<i style="${personStyle(p)}" title="${esc(p)} ${awayLabel(x)}${x.rule ? ' (wiederkehrend)' : ''}"${x.maybe ? ' class="maybe"' : x.from || x.until ? ' class="part"' : ''}></i>`)).join('');
cells.push(`<button type="button" class="away-day${iso === today ? ' today' : ''}${sel.has(iso) ? ' sel' : ''}${entries.length ? ' has-entries' : ''}" data-away-day="${iso}"${iso < today ? ' disabled' : ''}${iso === today ? ' aria-current="date"' : ''} aria-pressed="${sel.has(iso)}" aria-label="${esc(shortDate(iso))}${entries.length ? ': ' + esc(awayText(iso).join(', ')) : ''}"><b>${n}</b><span class="away-dots">${dots}</span></button>`);
}
$('awayGrid').innerHTML = cells.join('');
drawAwayEditor();
drawAwayList();
}
const modeButtons = (box, current) => { for (const b of box.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === current)); };
function drawAwayEditor() {
const days = selectedDays();
$('awayEditor').hidden = !days.length;
if (!days.length) return;
$('awayRange').textContent = days.length > 1 ? `${shortDate(days[0])} – ${shortDate(days.at(-1))}` : shortDate(days[0]);
modeButtons($('awayMode'), awayCal.mode);
$('awayTime').hidden = awayCal.mode === 'day' || awayCal.mode === 'maybe';
// whole day: pressed = away on every chosen day, "mixed" = on some (left alone unless clicked)
$('awayPeople').innerHTML = [...new Set([...allPeople(), ...awayCal.extra])].map(p => {
const on = awayCal.mode === 'day' ? days.filter(d => absentOn(d).includes(p)).length : 0;
const state = on === days.length && on ? 'true' : on ? 'mixed' : p === awayCal.me ? 'true' : 'false';
return `<button type="button" class="pill" data-away="${esc(p)}" aria-pressed="${state}" style="${personStyle(p)}">${esc(p)}</button>`;
}).join('');
}
const pencil = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const awayRow = (who, label, edit, remove, action) => `<li><span class="away-whos">${who.map(p => `<span class="away-who" style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span><span class="away-what">${esc(label)}</span><span class="away-entry-actions"><button type="button" class="pill" ${edit} aria-label="Bearbeiten: ${esc(who.join(', '))}, ${esc(label)}" title="Bearbeiten">${pencil}</button><button type="button" class="pill" ${remove} aria-label="${action}: ${esc(who.join(', '))}, ${esc(label)}" title="${action}">✕</button></span></li>`;
const runRow = (r, label) => {
const payload = esc(JSON.stringify(r));
return awayRow(r.people || [r.p], label, `data-away-edit="${payload}"`, `data-away-remove="${payload}"`, r.weekly ? 'Wiederholung entfernen' : 'Eintrag entfernen');
};
function drawAwayList() {
const runs = mergedRuns(false);
const shown = awayCal.allOnce ? runs : runs.slice(0, AWAY_SHOWN);
$('awayListCount').textContent = runs.length ? String(runs.length) : '';
$('awayList').innerHTML = shown.map(r => runRow(r, `${r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} – ${shortDate(r.to)}`} · ${r.cond}`)).join('')
  || '<li class="muted">Nichts eingetragen.</li>';
$('awayMore').hidden = runs.length <= AWAY_SHOWN;
$('awayMore').textContent = awayCal.allOnce ? 'Weniger anzeigen' : `Alle ${runs.length} anzeigen`;
}
// Wiederkehrend
const weekdayNames = list => list.map(i => AWAY_WEEKDAYS[i]).join(', ');
const repeatLabel = days => days.length === AWAY_WEEKDAYS.length ? 'täglich' : 'jeden ' + weekdayNames(days);
function ruleLabel(g) {
const today = isoDay(new Date());
const span = g.start > today ? `ab ${shortDate(g.start)}` : '';
const end = g.end ? `bis ${shortDate(g.end)}` : 'bis auf Weiteres';
return [repeatLabel(g.weekdays), g.cond, span, end].filter(Boolean).join(' · ');
}
function resetRepeat() {
Object.assign(awayRep, { people: mode === 'solo' && soloPerson ? [soloPerson] : [], weekdays: [], mode: 'day', edit: null });
$('repFrom').value = isoDay(new Date());
$('repUntil').value = '';
$('repOpen').checked = true;
}
const repEnd = () => $('repOpen').checked ? '' : $('repUntil').value;
function drawRepeat() {
const groups = ruleGroups(), legacy = mergedRuns(true);
$('repList').innerHTML = groups.map(g => awayRow(g.people, ruleLabel(g), `data-rule-edit="${esc(g.key)}"`, `data-rule-remove="${esc(g.key)}"`, 'Wiederholung entfernen')).join('')
  + legacy.map(r => runRow(r, `jeden ${AWAY_WEEKDAYS[r.weekday]} · ${r.cond} · bis ${shortDate(r.to)}`)).join('')
  || '<li class="muted">Noch keine Wiederholung.</li>';
$('repFormTitle').textContent = awayRep.edit ? 'Wiederholung ändern' : 'Neue Wiederholung';
$('repCancel').hidden = !awayRep.edit;
$('repPeople').innerHTML = [...new Set([...allPeople(), ...awayRep.people])].map(p => `<button type="button" class="pill" data-rep-person="${esc(p)}" aria-pressed="${awayRep.people.includes(p)}" style="${personStyle(p)}">${esc(p)}</button>`).join('');
$('repWeekdays').innerHTML = AWAY_WEEKDAYS.map((d, i) => `<button type="button" data-rep-day="${i}" aria-pressed="${awayRep.weekdays.includes(i)}">${d}</button>`).join('');
$('repDaily').setAttribute('aria-pressed', String(awayRep.weekdays.length === AWAY_WEEKDAYS.length));
modeButtons($('repMode'), awayRep.mode);
$('repTime').hidden = awayRep.mode === 'day' || awayRep.mode === 'maybe';
$('repUntilBox').hidden = $('repOpen').checked;
const today = isoDay(new Date());
$('repFrom').min = today; $('repFrom').max = addDay(today, AWAY_AHEAD - 30);
$('repUntil').min = $('repFrom').value || today;
const start = $('repFrom').value > today ? $('repFrom').value : today, end = repEnd();
let first = '';
for (let d = start, i = 0; i < 7 && !first; d = addDay(d, 1), i++) if (awayRep.weekdays.includes(weekdayOf(d))) first = d;
$('repSummary').textContent = !awayRep.weekdays.length ? 'Wochentag wählen.'
  : !first || (end && first > end) ? 'In diesem Zeitraum gibt es keinen solchen Tag.'
  : `Erster Termin ${shortDate(first)} · ${end ? `letzter ${shortDate(end)}` : 'ohne Ende, bis ihr es ändert'}`;
}
// Saves `next` ({ days, rules }); `days` are the single days that changed. The save service takes 92 days at a
// time; rules go along with the first part (only when they changed), and its answer must have them.
async function saveAway(next, days) {
if (movesKey) return saveMoves(moves, d => d, null, next);
if (!delaysUrl) throw new Error('Speichern für alle ist noch nicht eingerichtet');
const rulesChanged = JSON.stringify(next.rules) !== JSON.stringify(absentRules.map(canonRule));
try {
  const parts = [];
  for (let i = 0; i < days.length; i += 92) parts.push(days.slice(i, i + 92));
  if (!parts.length) parts.push([]);
  for (const [i, part] of parts.entries()) {
    const withRules = rulesChanged && i === 0;
    const body = await postDelay({ absent: next.days.filter(x => part.includes(x.day)), days: part, ...(withRules && { rules: next.rules }) });
    if (withRules && rulesFromToday(body.absentRules) !== rulesFromToday(next.rules))
      throw new Error('der Speicherdienst kennt wöchentliche Abwesenheiten noch nicht (Helfer-Update v19 nötig)');
  }
}
catch (e) { throw /nichts zu tun|unbekannt|unknown|not allowed|ungültige Tage/i.test(e.message) ? new Error('der Speicherdienst kann das noch nicht speichern (Helfer-Update v19 nötig). Bis dahin geht es mit dem Bearbeitungszugang') : e; }
}
async function storeAway(next, days, done) {
$('awayMsg').textContent = 'Speichert…';
for (const b of $('awayDlg').querySelectorAll('button')) b.disabled = true;
try {
await saveAway(next, days);
} catch (e) { $('awayMsg').textContent = `Nicht gespeichert: ${e.message}.`; return false; }
finally { for (const b of $('awayDlg').querySelectorAll('button')) b.disabled = false; }
absentDays = next.days; absentRules = next.rules;
if (awayCal.tab === 'recurring') { resetRepeat(); drawRepeat(); } else drawAway();
$('awayMsg').textContent = `${done} Alle sehen es in etwa einer Minute.`;
try { if (lastWeekRender && view === 'week') render(...lastWeekRender, false, true); } catch (e) { console.error(e); }
return true;
}
$('awayButton').onclick = () => openAway();
$('awayTabCalendar').onclick = () => showAwayTab('calendar');
$('awayTabRecurring').onclick = () => showAwayTab('recurring');
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-day-absent]');
if (b) openAway(b.closest('.day').dataset.date);
});
$('awayPrev').onclick = () => { const d = dayOf(awayCal.month + '-01'); d.setMonth(d.getMonth() - 1); awayCal.month = isoDay(d).slice(0, 7); drawAway(); };
$('awayNext').onclick = () => { const d = dayOf(awayCal.month + '-01'); d.setMonth(d.getMonth() + 1); awayCal.month = isoDay(d).slice(0, 7); drawAway(); };
$('awayToday').onclick = () => { awayCal.month = isoDay(new Date()).slice(0, 7); drawAway(); };
$('awayMore').onclick = () => { awayCal.allOnce = !awayCal.allOnce; drawAwayList(); };
$('awayGrid').addEventListener('click', e => {
const iso = e.target.closest('[data-away-day]')?.dataset.awayDay;
if (!iso) return;
// first tap: one day; second tap on a later day: the range up to it; one more tap starts over
if (awayCal.start && !awayCal.end && iso > awayCal.start) awayCal.end = iso;
else { awayCal.start = iso; awayCal.end = null; }
$('awayMsg').textContent = '';
drawAway();
});
$('awayMode').addEventListener('click', e => {
const m = e.target.closest('[data-mode]')?.dataset.mode;
if (!m) return;
awayCal.mode = m;
drawAwayEditor();
if (m === 'from' || m === 'until') $('awayClock').focus();
});
$('awayPeople').addEventListener('click', e => {
const b = e.target.closest('[data-away]');
if (b) { awayCal.me = null; b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); }
});
$('awaySave').onclick = () => {
const days = selectedDays();
if (!days.length) { $('awayMsg').textContent = 'Bitte einen Tag wählen.'; return; }
const chips = [...$('awayPeople').querySelectorAll('[data-away]')];
const on = chips.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.away);
const off = chips.filter(b => b.getAttribute('aria-pressed') === 'false').map(b => b.dataset.away);
const time = awayCal.mode === 'maybe' ? true : awayCal.mode === 'day' ? null : clockOf($('awayClock').value);
if (awayCal.mode !== 'day' && !time) { $('awayMsg').textContent = 'Uhrzeit wie 21:00.'; return; }
if (awayCal.mode !== 'day' && !on.length) { $('awayMsg').textContent = 'Wer? Mindestens eine Person auswählen.'; return; }
const label = awayCal.mode === 'day' ? (on.length ? `Abwesend: ${on.join(', ')}.` : 'Gespeichert.') : awayCal.mode === 'maybe' ? `${on.join(', ')}: spontan da.` : `${on.join(', ')} ${awayCal.mode === 'from' ? 'ab' : 'bis'} ${time}.`;
storeAway(splitAway(withAway(days.flatMap(absencesForDay), days, on, awayCal.mode, time, off), days), days, label);
};
$('repPeople').addEventListener('click', e => {
const p = e.target.closest('[data-rep-person]')?.dataset.repPerson;
if (!p) return;
awayRep.people = awayRep.people.includes(p) ? awayRep.people.filter(x => x !== p) : [...awayRep.people, p];
drawRepeat();
});
$('repDaily').onclick = () => {
  const daily = awayRep.weekdays.length === AWAY_WEEKDAYS.length;
  awayRep.weekdays = daily ? [] : AWAY_WEEKDAYS.map((_, day) => day);
  drawRepeat();
};
$('repWeekdays').addEventListener('click', e => {
const d = e.target.closest('[data-rep-day]')?.dataset.repDay;
if (d === undefined) return;
const n = Number(d);
awayRep.weekdays = awayRep.weekdays.includes(n) ? awayRep.weekdays.filter(x => x !== n) : [...awayRep.weekdays, n].sort();
drawRepeat();
});
$('repMode').addEventListener('click', e => {
const m = e.target.closest('[data-mode]')?.dataset.mode;
if (!m) return;
awayRep.mode = m;
drawRepeat();
if (m === 'from' || m === 'until') $('repClock').focus();
});
$('repFrom').onchange = $('repUntil').onchange = () => drawRepeat();
$('repOpen').onchange = () => { if (!$('repOpen').checked && !$('repUntil').value) $('repUntil').value = addDay($('repFrom').value || isoDay(new Date()), 12 * 7 - 1); drawRepeat(); };
$('repCancel').onclick = () => { resetRepeat(); $('awayMsg').textContent = ''; drawRepeat(); };
$('repSave').onclick = () => {
const today = isoDay(new Date()), on = awayRep.people, say = text => { $('awayMsg').textContent = text; };
const start = $('repFrom').value > today ? $('repFrom').value : today, end = repEnd();
const time = awayRep.mode === 'maybe' ? true : awayRep.mode === 'day' ? null : clockOf($('repClock').value);
if (!on.length) return say('Wer? Mindestens eine Person auswählen.');
if (!awayRep.weekdays.length) return say('Mindestens einen Wochentag auswählen.');
if (!/^\d{4}-\d{2}-\d{2}$/.test($('repFrom').value)) return say('Ab wann? Bitte ein Datum wählen.');
if (start > addDay(today, AWAY_AHEAD - 30)) return say('Der Start darf höchstens ein Jahr entfernt sein.');
if (!$('repOpen').checked && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return say('Bis wann? Datum wählen oder „Ohne Ende“ ankreuzen.');
if (end && end < start) return say('Das Ende liegt vor dem Start.');
if (awayRep.mode !== 'day' && !time) return say('Uhrzeit wie 21:00.');
const edit = awayRep.edit;
// a change replaces the rules being edited (or an old series of single days); their exceptions stay where they still fit
const oldRules = edit?.ids ? absentRules.filter(r => edit.ids.includes(r.id)) : [];
const kept = absentRules.filter(r => !oldRules.includes(r));
const made = on.map(person => canonRule({ id: oldRules.find(r => r.person === person)?.id || newRuleId(), person, weekdays: awayRep.weekdays, start, ...(end && { end }),
  ...(awayRep.mode === 'maybe' ? { maybe: true } : awayRep.mode === 'day' ? {} : { [awayRep.mode]: time }), skip: oldRules.find(r => r.person === person)?.skip }));
// single days of these people that the new rules now cover give way to them
const covered = absentDays.filter(x => x.day >= start && (!end || x.day <= end) && awayRep.weekdays.includes(weekdayOf(x.day)) && x.people.some(p => on.includes(p))).map(x => x.day);
const legacyDays = edit && !edit.ids ? edit.days : [];
let daysList = absentDays;
if (legacyDays.length) daysList = withoutRun(daysList, edit, legacyDays);
daysList = daysList.flatMap(x => {
  if (!covered.includes(x.day)) return [x];
  const people = x.people.filter(p => !on.includes(p));
  return people.length ? [{ ...x, people }] : [];
});
const cond = awayRep.mode === 'day' ? 'ganztägig' : awayRep.mode === 'maybe' ? 'spontan da' : `${awayRep.mode === 'from' ? 'ab' : 'bis'} ${time}`;
const rules = kept.map(canonRule).concat(made);
storeAway({ days: daysList, rules }, [...new Set([...covered, ...legacyDays])].sort(),
  `${on.join(', ')}: ${repeatLabel(awayRep.weekdays)}, ${cond}, ${end ? `bis ${shortDate(end)}` : 'bis auf Weiteres'}.`);
};
// Bearbeiten / ✕ in both lists
$('awayDlg').addEventListener('click', e => {
const ruleEdit = e.target.closest('[data-rule-edit]')?.dataset.ruleEdit;
const ruleRemove = e.target.closest('[data-rule-remove]')?.dataset.ruleRemove;
if (ruleEdit || ruleRemove) {
  const g = ruleGroups().find(x => x.key === (ruleEdit || ruleRemove));
  if (!g) return;
  if (ruleRemove) {
    if (!confirm(`Wiederholung für ${g.people.join(', ')} (${repeatLabel(g.weekdays)}) beenden?`)) return;
    storeAway({ days: absentDays, rules: absentRules.filter(r => !g.ids.includes(r.id)).map(canonRule) }, [], `${g.people.join(', ')}: Wiederholung beendet.`);
    return;
  }
  const r = absentRules.find(x => x.id === g.ids[0]);
  Object.assign(awayRep, { people: [...g.people], weekdays: [...g.weekdays], mode: r.maybe ? 'maybe' : r.from ? 'from' : r.until ? 'until' : 'day', edit: { ids: g.ids } });
  $('repFrom').value = g.start < isoDay(new Date()) ? isoDay(new Date()) : g.start;
  $('repOpen').checked = !g.end; $('repUntil').value = g.end;
  if (r.from || r.until) $('repClock').value = r.from || r.until;
  $('awayMsg').textContent = '';
  drawRepeat();
  $('repForm').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return;
}
const edit = e.target.closest('[data-away-edit]')?.dataset.awayEdit;
if (edit) {
  const run = JSON.parse(edit);
  const p0 = (run.people || [run.p])[0];
  const existing = absentDays.find(x => x.day === run.from && (x.people || []).includes(p0) && awayLabel(x) === run.cond);
  const kind = existing?.maybe ? 'maybe' : existing?.from ? 'from' : existing?.until ? 'until' : 'day';
  if (run.weekly) {
    // an old series of single days: edited, it becomes a rule
    Object.assign(awayRep, { people: run.people || [run.p], weekdays: [run.weekday], mode: kind, edit: run });
    $('repFrom').value = run.from; $('repOpen').checked = false; $('repUntil').value = run.to;
    if (existing?.from || existing?.until) $('repClock').value = existing.from || existing.until;
    drawRepeat();
    $('awayMsg').textContent = '';
    $('repForm').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  awayCal.month = run.from.slice(0, 7);
  awayCal.start = run.from;
  awayCal.end = run.to !== run.from ? run.to : null;
  awayCal.mode = kind;
  awayCal.extra = run.people || [run.p];
  if (existing?.from || existing?.until) $('awayClock').value = existing.from || existing.until;
  drawAway();
  for (const b of $('awayPeople').querySelectorAll('[data-away]'))
    b.setAttribute('aria-pressed', String((run.people || [run.p]).includes(b.dataset.away)));
  $('awayMsg').textContent = 'Eintrag ausgewählt. Ändern und speichern.';
  $('awayEditor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return;
}
const raw = e.target.closest('[data-away-remove]')?.dataset.awayRemove;
if (!raw) return;
const run = JSON.parse(raw);
const who = (run.people || [run.p]).join(', ');
if (run.weekly && !confirm(`Alle ${run.days.length} kommenden Termine (jeden ${AWAY_WEEKDAYS[run.weekday]}) für ${who} entfernen?`)) return;
storeAway({ days: withoutRun(absentDays, run, run.days), rules: absentRules.map(canonRule) }, run.days, `${who}: entfernt.`);
});
