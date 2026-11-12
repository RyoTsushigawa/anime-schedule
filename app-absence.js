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
