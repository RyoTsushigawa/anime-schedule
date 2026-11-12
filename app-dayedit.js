// Main page, part 9: Wochenübersicht and editing a day.
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
function withMove(next, s, tag, time) {
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
next = withMove(next, show.skip ? { ...show, tag: null, skip: false } : show, dayEdit.tag, time);
}
for (const row of $('dayMissing').querySelectorAll('.day-missing')) {
const s = dayEdit.all.find(x => x.key === row.dataset.key);
const time = row.querySelector('input').value.trim();
if (time && !parseTime(time)) { $('dayMsg').textContent = `${s.name}: Uhrzeit wie 21:00, oder leer.`; return; }
next = withMove(next, s, row.querySelector('select').value, clockOf(time));
}
if (next === moves) { $('dayDlg').close(); return; }
storeMoves(next, `${dayEdit.label} gespeichert${dayEdit.scope === 'week' ? ' (diese Woche)' : ''}.`, 'dayDlg', 'dayMsg');
};
