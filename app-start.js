// Main page, part 10: start-up, views and modes, people, help, keyboard and list sync pairs.
async function firstTabs() {
try {
if (localStorage.getItem('tabs')) return;
const res = await fetch('tabs.json', { signal: AbortSignal.timeout(1500) });
const list = res.ok ? await res.json() : null;
if (Array.isArray(list) && list.length && list.every(t => t && /^\d+$/.test(t.gid) && typeof t.name === 'string' && Number.isFinite(t.start)))
localStorage.setItem('tabs', JSON.stringify(list));
} catch {}
}
const streamsReady = fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json())
.then(json => { streamsDe = json; }, e => {
console.warn('streams-de.json not loaded:', e);
setNote('streams', `${unreachable('Die Seite')}: die Stream-Daten wurden nicht geladen, daher kommen die Links von AniList, und Pausen und Rewatches fehlen.`);
});
const tabsReady = firstTabs().then(() => savedOrFresh('tabs', guckplanTabs, list => { tabs = list; load(true); }))
.then(list => { tabs = list; }, e => {
console.warn('Sheet tabs not loaded:', e);
setNote('tabs', `${unreachable('Google Sheets')}: die Liste der Guckplan-Tabs ist unbekannt, daher wird „${FALLBACK_TAB.name}“ angezeigt.`);
});
const ready = Promise.all([
tabsReady,
streamsReady,
loadFallbackLinks().then(() => { if (lastWeekRender && view === 'week') redraw(); }),
loadMoves().then(() => {
movesSeen = movesStamp();
if (lastWeekRender && view === 'week') redraw();
}),
]);
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
let lastUpdateCheck = Date.now();
document.addEventListener('visibilitychange', () => {
if (document.visibilityState !== 'visible' || Date.now() - lastUpdateCheck < 60000) return;
lastUpdateCheck = Date.now();
reg.update().catch(() => {});
});
}).catch(e => console.warn('No offline copy:', e));
navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) { updateWaiting = true; $('update').hidden = false; reloadWhenAway(); } });
}
$('updateReload').onclick = () => {
try { sessionStorage.setItem('resumePlace', JSON.stringify({ weekOffset, range, pickedDay, y: scrollY })); } catch {}
reloadPage();
};
const PATCH_NOTES = [
{ id: '2026-11-10', title: 'Long episodes, clearer days and a tidier editor', items: [
'Long episodes: „Lang“ in the move dialog gives an episode two slots, and later shows move back 30 minutes. LiveChart notes such as „Double-length premiere“ are picked up automatically. A „Lang“ tag marks the episode, and pushed times are coloured.',
'„Doppelt“ now also takes two slots, survives dragging and the day editor, and shows as „(x2)“ in the Discord message.',
'Absences: on a show that still runs, the names of absent watchers are struck through. „ab“/„bis“ absences are checked at the time a show is really watched, after delays and long episodes.',
'Recap weeks are named „Recap“ in the Discord message; a plain break stays „Pause“.',
'„Pause überspringen“ is now a small icon on the day heading, next to delay and absence.',
'The move dialog is grouped into where, how and actions. „Edit“ moved to the top row, so the header stays at two lines.',
'The daily Discord post is started by the Cloudflare helper at 08:50 and posted at 09:00, since GitHub\'s own timer proved unreliable.',
'Help: new sections on the day icons, absences, pauses and long episodes.',
'Pause rows share one „Pause“ label, with the reason (Recap, Skip, Abwesend) as a tag next to the show. The day\'s edit button is a pencil icon.',
] },
{ id: '2026-11-09', title: 'Calendar, Discord and a cleaner schedule', items: [
'New absence calendar: mark one day or a date range, including absences starting or ending at a particular time. A legend, clearer selection and a Today shortcut make it easier to use.',
'Weekly absences: repeat a selected day for 12 weeks, see recurring dates grouped in the list and remove the series together.',
'The watch plan and Discord messages take absences into account. If too few people are available, affected shows are skipped and later watch slots can move up.',
'Broadcast breaks and recap episodes now appear as pauses. A day-specific option automatically moves later shows into free slots while respecting fixed times.',
'Daily Discord schedule posts at 09:00 German time can ping the weekday role, use custom anime nicknames and show which titles dropped out of today’s plan.',
'Nickname editing is available both in the Discord day view and in Settings: filter by weekday (including shows on break), search titles or show every anime in the season. Suggested names are only saved when confirmed.',
'Discord messages now follow the group’s layout, with tidier formatting, short reasons and emote support.',
'Settings, schedule controls, dialogs and the Watch Planner received a more consistent pill design, spacing and mobile styling.',
] },
{ id: '2026-11-08', title: 'Skips, absences and catching up', items: [
'A show can be skipped for a week. When the slot becomes empty, later shows move up unless you select „Beim Skip Zeiten beibehalten“.',
'Away for a day? It can be marked now. Shows left with just one watcher are skipped (MaRyo counts as two), and the evening moves up.',
'Double episodes: last week\'s episode can come along in this week\'s slot.',
'Catch-up shows can be put into the plan. They show up as "Nachholen" on their day.',
'Two shows sharing a slot can be moved or skipped together.',
'Shows dragged to a new place land in 30-minute steps.',
'Edit windows are tidier: "Once" is for this week only, "Permanent" for every week from now on.',
] },
];
const NOTES_KEY = 'notesSeen';
function showNotes(list) {
$('notesList').innerHTML = list.map(n => `<section class="notes-entry"><h3>${esc(n.title)}<span>${esc(new Date(n.id + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></h3>
    <ul>${n.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('');
$('notesDlg').showModal();
$('notesDlg').scrollTop = 0;
}
function newNotes() {
const newest = PATCH_NOTES[0]?.id;
if (!newest) return;
let seen = null;
try { seen = localStorage.getItem(NOTES_KEY); localStorage.setItem(NOTES_KEY, newest); } catch { return; }
if (!seen && !returningVisitor) return;
const fresh = PATCH_NOTES.filter(n => !seen || n.id > seen);
if (fresh.length && !document.querySelector('dialog[open]')) showNotes(fresh);
}
// N39 Datenstand: when each source was last updated, and whether a saved copy is in use
const ago = time => { if (!time) return 'unbekannt'; const d = new Date(time); return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`; };
async function drawDataStatus() {
const notes = [...dataNotes.keys()];
const saved = prefix => notes.some(k => k.startsWith(prefix));
let week = null; try { week = JSON.parse(localStorage.getItem('week:' + weekStart(weekOffset).getTime()) || 'null'); } catch {}
const rows = [
['Guckplan (Google Sheet)', saved('missing ') ? 'nicht geladen · Google Sheets antwortet gerade nicht' : saved('sheet ') ? 'gespeicherte Kopie in diesem Browser · Google Sheets antwortet gerade nicht' : dataStamps.has('sheet') ? 'aktuell · geladen ' + ago(dataStamps.get('sheet')) : 'aus diesem Browser, wird gerade geprüft'],
['Sendetermine (AniList)', notes.some(k => k.startsWith('week:') && /LiveChart/.test(dataNotes.get(k))) ? 'Ersatz von LiveChart · AniList antwortet nicht' : saved('week:') ? 'gespeicherte Kopie vom ' + ago(week?.time) : week?.time ? 'geladen ' + ago(week.time) : 'unbekannt'],
['Pausen & Stream-Status (LiveChart)', streamsDe ? 'Stand ' + ago(streamsDe.statusUpdated || streamsDe.generated) : 'nicht geladen'],
['Verschiebungen & Abwesenheiten', movesUpdated ? 'zuletzt geändert ' + ago(movesUpdated) : 'unbekannt'],
['Season-Katalog', '…'], ['Trailer-Listen', '…'],
];
const draw = () => { $('dataList').innerHTML = rows.map(([name, text]) => `<li><b>${esc(name)}</b><span>${esc(text)}</span></li>`).join(''); };
draw();
const catalog = fetch('seasons.json', { cache: 'no-cache' }).then(r => r.json()).then(j => 'Stand ' + ago(j.generated), () => 'nicht erreichbar');
const trailers = fetch('https://api.github.com/repos/RyoTsushigawa/anime-schedule/commits?path=season-trailers.json&per_page=1', { headers: { Accept: 'application/vnd.github+json' } })
.then(r => r.ok ? r.json() : Promise.reject()).then(list => 'zuletzt geändert ' + ago(list[0]?.commit?.committer?.date), () => 'unbekannt (GitHub nicht erreichbar)');
rows[4][1] = await catalog; draw();
rows[5][1] = await trailers; draw();
}
function drawSyncHistory() {
let list = [];
try { list = JSON.parse(localStorage.getItem(SYNC_LOG) || '[]'); } catch {}
const what = e => e.ok
  ? [e.score !== undefined ? `Wertung ${e.score}` : e.status === 'DROPPED' ? 'gedroppt' : e.from !== e.to ? `Folge ${e.from ?? 0} → ${e.to}` : `Folge ${e.to}`, e.note].filter(Boolean).join(' · ')
  : `Nicht gespeichert${e.to != null ? ` (Folge ${e.to})` : ''}: ${e.error}`;
$('syncList').innerHTML = list.length ? list.map(e => `<li class="${e.ok ? 'ok' : 'failed'}"><b>${e.ok ? '✓' : '✕'} ${esc(e.title)}</b><span>${esc(what(e))}</span><small>${esc(ago(e.at))}${e.account ? ' · ' + esc(e.account) : ''}</small></li>`).join('')
  : '<li class="muted">Noch nichts gespeichert.</li>';
}
// N24 Listen-Check: problems in an AniList list, each with a link to fix it there (nothing is changed here)
const HEALTH_QUERY = `query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status_in: [CURRENT, REPEATING, PAUSED, COMPLETED, PLANNING]) {
  lists { entries { status progress updatedAt media { id status episodes siteUrl synonyms title { romaji english } } } } } }`;
const HEALTH_STALE_DAYS = 90;
function listHealth(entries, planned, now = Date.now()) {
const title = m => m.title.english || m.title.romaji;
const stale = [], beyond = [], incomplete = [], missing = [];
for (const { status, progress, updatedAt, media: m } of entries) {
  if (status === 'CURRENT' && m.status === 'FINISHED' && updatedAt && now - updatedAt * 1000 > HEALTH_STALE_DAYS * 864e5)
    stale.push({ m, text: `Seit ${Math.floor((now - updatedAt * 1000) / 864e5)} Tagen nicht weitergeschaut, bei Folge ${progress || 0}${m.episodes ? ' von ' + m.episodes : ''}` });
  if (m.episodes && progress > m.episodes) beyond.push({ m, text: `Fortschritt ${progress}, die Serie hat nur ${m.episodes} Folgen` });
  if (status === 'COMPLETED' && m.episodes && (progress || 0) < m.episodes) incomplete.push({ m, text: `Abgeschlossen, aber nur ${progress || 0} von ${m.episodes} Folgen abgehakt` });
}
const onList = new Set(entries.flatMap(e => [e.media.title.romaji, e.media.title.english, ...(e.media.synonyms || [])]).filter(Boolean).map(norm));
for (const show of planned) if (![show.romaji, show.english].some(t => t && onList.has(norm(t))))
  missing.push({ show, text: 'Im Guckplan, aber nicht auf der Liste' });
return [
  ['Vergessen?', 'Noch auf „Schaue ich“, obwohl die Serie längst fertig ist', stale],
  ['Mehr Folgen als die Serie hat', '', beyond],
  ['Unvollständig abgeschlossen', '', incomplete],
  ['Fehlt auf der Liste', 'Serien aus deinem Guckplan dieser Season', missing],
].map(([name, note, items]) => ({ name, note, items: items.sort((a, b) => (a.m ? title(a.m) : a.show.english || a.show.romaji).localeCompare(b.m ? title(b.m) : b.show.english || b.show.romaji)) }));
}
async function drawHealth() {
const person = ownPerson();
const anilistName = auth && auth.provider !== 'mal' ? auth.name : (profileList[person] || []).find(a => (a?.provider || 'anilist') === 'anilist')?.name;
$('healthList').innerHTML = '';
if (!anilistName) { $('healthIntro').textContent = 'Melde dich mit AniList an (oder trag unter „Wer ist wer“ ein AniList-Konto ein), dann wird die Liste geprüft.'; return; }
$('healthIntro').textContent = `Prüfe die AniList-Liste von ${anilistName} …`;
try {
  const entries = (await anilist(HEALTH_QUERY, { user: anilistName })).MediaListCollection.lists.flatMap(l => l.entries);
  const sheet = lastWeekRender ? [...lastWeekRender[2].values()].find(s => s?.people?.includes(person)) : null;
  const planned = sheet && person ? [...picks(sheet, person).keys()].filter(s => !s.hidden) : [];
  const groups = listHealth(entries, planned), found = groups.reduce((n, g) => n + g.items.length, 0);
  $('healthIntro').textContent = found ? `${entries.length} Einträge von ${anilistName} geprüft · ${found} ${found === 1 ? 'Hinweis' : 'Hinweise'}. Ändern geht auf AniList.` : `${entries.length} Einträge von ${anilistName} geprüft: alles in Ordnung ✓`;
  $('healthList').innerHTML = groups.filter(g => g.items.length).map(g => `<section><h3>${esc(g.name)} <span>${g.items.length}</span></h3>${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}<ul class="data-list">${g.items.map(i => i.m
    ? `<li><a href="${safeUrl(i.m.siteUrl)}" target="_blank" rel="noopener"><b>${esc(i.m.title.english || i.m.title.romaji)}</b></a><span>${esc(i.text)}</span></li>`
    : `<li><b>${esc(i.show.english || i.show.romaji)}</b><span>${esc(i.text)}</span></li>`).join('')}</ul></section>`).join('');
} catch (e) { $('healthIntro').textContent = `Die Liste konnte nicht geladen werden: ${e.message}`; }
}
$('healthButton').onclick = () => { showSettings(false); $('healthDlg').showModal(); drawHealth(); };
$('syncButton').onclick = () => { showSettings(false); drawSyncHistory(); $('syncDlg').showModal(); };
$('syncClear').onclick = () => { try { localStorage.removeItem(SYNC_LOG); } catch {} drawSyncHistory(); };
function drawEpisodeCrosswalk() {
  const show = $('episodeCrosswalkShow').value;
  const input = $('episodeCrosswalkNumber');
  const result = $('episodeCrosswalkResults');
  const episode = input.valueAsNumber;
  const mapped = episode - lagOf(show);
  const rows = !show ? ['Keine bestätigte Nummernabweichung geladen.']
    : !Number.isSafeInteger(episode) || !input.validity.valid ? ['Gib eine ganze Folgennummer ab 1 ein.']
    : [
      'AniList: Folge ' + episode,
      mapped > 0 ? 'Guckplan: Folge ' + mapped : 'Guckplan: Keine Zuordnung für diese Folge',
      'MyAnimeList: Nummerierung nicht bestätigt',
      'Streamingdienste: Staffel- und Folgennummern nicht bestätigt',
    ];
  result.replaceChildren(...rows.map(text => Object.assign(document.createElement('li'), { textContent: text })));
}
$('episodeCrosswalkButton').onclick = () => {
  showSettings(false);
  const select = $('episodeCrosswalkShow'), input = $('episodeCrosswalkNumber');
  const options = Object.entries(streamsDe?.release || {})
    .filter(([id, entry]) => Number.isSafeInteger(entry.lag) && entry.lag !== 0 && streamsDe.status?.[id]?.titles?.[0])
    .map(([id]) => new Option(streamsDe.status[id].titles[0], id));
  select.replaceChildren(...options);
  select.disabled = input.disabled = !options.length;
  drawEpisodeCrosswalk();
  $('episodeCrosswalkDlg').showModal();
};
$('episodeCrosswalkShow').onchange = drawEpisodeCrosswalk;
$('episodeCrosswalkNumber').oninput = drawEpisodeCrosswalk;
$('dataButton').onclick = () => { showSettings(false); $('dataDlg').showModal(); drawDataStatus(); };
$('notesButton').onclick = () => {
showSettings(false);
showNotes(PATCH_NOTES);
};
setTimeout(newNotes, 1200);
config().then(c => {
const url = typeof c.feedbackUrl === 'string' && /^https:\/\/(discord\.com|discord\.gg|ptb\.discord\.com|canary\.discord\.com)\//.test(c.feedbackUrl) ? c.feedbackUrl : '';
$('feedbackLink').hidden = !url;
if (url) $('feedbackLink').href = url;
});
function setMode(next) {
mode = next;
document.body.classList.toggle('solo', mode === 'solo');
document.body.classList.toggle('group', mode === 'group');
$('modeSolo').setAttribute('aria-pressed', mode === 'solo');
$('modeGroup').setAttribute('aria-pressed', mode === 'group');
try { localStorage.setItem('mode', mode); } catch {}
}
setMode(mode);
function listView() { return view === 'catchup' || view === 'pace'; }
let jumpSearch = '';
function setView(next) {
if (next !== 'week') syncListToSolo();
if (next === 'week' && jumpSearch) {
if ($('search').value === jumpSearch) { $('search').value = ''; openSearch(false); searchedWeek = false; }
jumpSearch = '';
}
view = next;
document.body.classList.toggle('catchup', listView());
document.body.classList.toggle('pace', view === 'pace');
$('viewWeek').setAttribute('aria-pressed', view === 'week');
$('viewCatchup').setAttribute('aria-pressed', view === 'catchup');
$('viewPace').setAttribute('aria-pressed', view === 'pace');
try { localStorage.setItem('view', view); } catch {}
if (view === 'week') refreshPaceNav();
}
setView(view);
$('viewWeek').onclick = () => { setView('week'); enter = { y: 4 }; load(); };
$('viewCatchup').onclick = () => { setView('catchup'); enter = { y: 4 }; load(); };
$('viewPace').onclick = () => { setView('pace'); enter = { y: 4 }; load(); };
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
friendList.value = '';
try { localStorage.setItem('anilistUser', $('anilistUser').value.trim()); } catch {}
load();
};
friendList.onchange = () => {
refreshPaceNav();
selecting = false;
catchupTargets = [];
$('markAllStart').hidden = true;
$('list').innerHTML = '';
load();
};
$('list').addEventListener('click', event => {
if (!event.target.closest('[data-own-list]')) return;
friendList.value = '';
friendList.onchange();
friendList.focus();
});
$('modeSolo').onclick = () => { setMode('solo'); redraw(); };
$('modeGroup').onclick = () => { setMode('group'); redraw(); };
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
if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
for (const [menu, button] of [['miscMenu', 'miscButton'], ['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
if ($(menu).hidden) continue;
e.preventDefault();
    showMenu(menu, button, false);
$(button).focus();
break;
}
});
$('soloPerson').onchange = () => {
soloPerson = $('soloPerson').value;
syncListToSolo();
refreshPaceNav();
colorSolo();
try { localStorage.setItem('soloPerson', soloPerson); } catch {}
redraw();
};
function colorSolo() {
const select = $('soloPerson');
select.style.cssText = personStyle(select.value);
for (const o of select.options) o.style.cssText = personStyle(o.value)
.replace('--person:', 'background-color:').replace(';--person-text:', ';color:');
applyAccent();
}
function fillPeople(people) {
localPlanPeople = people.slice();
updateLocalListOptions();
const select = $('soloPerson');
if ([...select.options].map(o => o.value).join() !== people.join()) {
select.replaceChildren(...people.map(p => new Option(p, p)));
if (!people.includes(soloPerson) && people.length) soloPerson = people.includes(DEFAULT_PERSON) ? DEFAULT_PERSON : people[0];
select.value = soloPerson;
}
colorSolo();
syncListToSolo();
const box = $('people');
const chips = () => [...box.querySelectorAll('[data-name]')];
if (chips().map(b => b.dataset.name).join() === people.join()) {
for (const b of chips()) b.style.cssText = personStyle(b.dataset.name);
return;
}
const all = document.createElement('button');
all.className = 'chip';
all.textContent = 'Alle';
all.setAttribute('aria-label', 'Alle Personen auswählen');
const saveSelection = () => {
for (const b of chips()) b.setAttribute('aria-pressed', selectedPeople.has(b.dataset.name));
all.setAttribute('aria-pressed', people.every(name => selectedPeople.has(name)));
try { localStorage.setItem('people', JSON.stringify([...selectedPeople])); } catch {}
updateGroupButton();
redraw();
};
all.setAttribute('aria-pressed', people.every(name => selectedPeople.has(name)));
all.onclick = () => {
selectedPeople.clear();
for (const name of people) selectedPeople.add(name);
saveSelection();
};
box.replaceChildren(all, ...people.map(name => {
const b = document.createElement('button');
b.className = 'chip';
b.dataset.name = name;
b.textContent = name;
b.style.cssText = personStyle(name);
b.setAttribute('aria-pressed', selectedPeople.has(name));
b.onclick = () => {
selectedPeople.has(name) ? selectedPeople.delete(name) : selectedPeople.add(name);
saveSelection();
};
return b;
}));
}
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
const helpTopics = [...$('helpDialog').querySelectorAll('[data-help-topic]')];
let helpStep = -1;
function showHelpStep(index) {
helpStep = index;
const section = index < 0 ? null : $(helpTopics[index].dataset.helpTopic);
for (const item of $('helpDialog').querySelectorAll('.help-sections > section')) item.hidden = !!section && item !== section;
$('helpSteps').hidden = !section;
for (const [i, topic] of helpTopics.entries()) topic.setAttribute('aria-pressed', String(i === index));
if (!section) return;
$('helpPrevious').disabled = index === 0;
$('helpNext').textContent = index === helpTopics.length - 1 ? 'Fertig' : 'Weiter';
$('helpProgress').textContent = `${index + 1} / ${helpTopics.length}`;
section.focus();
}
$('helpDialog').addEventListener('click', event => {
const topic = event.target.closest('[data-help-topic]');
if (topic) showHelpStep(helpTopics.indexOf(topic));
});
$('helpOverview').onclick = () => {
const previous = helpTopics[helpStep];
showHelpStep(-1);
previous?.focus();
};
$('helpPrevious').onclick = () => showHelpStep(helpStep - 1);
$('helpNext').onclick = () => {
if (helpStep === helpTopics.length - 1) $('helpOverview').click();
else showHelpStep(helpStep + 1);
};
$('helpDialog').addEventListener('close', () => {
showHelpStep(-1);
helpReturnFocus?.focus({ preventScroll: true });
});
for (const [id, key, hint] of [
['prev', 'ArrowLeft', 'Vorherige Woche (←)'], ['next', 'ArrowRight', 'Nächste Woche (→)'],
['viewWeek', '1', 'Zeitplan (1)'], ['viewCatchup', '2', 'Catch-up (2)'], ['viewPace', '3', 'Non-seasonal (3)'],
['modeSolo', 'G', 'Solo (G)'], ['modeGroup', 'G', 'Gruppe (G)'],
['searchButton', '/', 'Serien suchen (/)'], ['helpButton', 'Shift+/', 'Hilfe (?)'],
]) {
$(id).setAttribute('aria-keyshortcuts', key);
$(id).title = hint;
}
function keyRows() {
return [...document.querySelectorAll('#list .row:not(.pause):not(.show-head)')].filter(r => !r.closest('.hidden-by-search, details:not([open])'));
}
function selectRow(row) {
row.tabIndex = -1;
row.classList.add('selected-row');
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
const row = at < 0 ? rows.find(r => r.getBoundingClientRect().top >= headerBottom) || rows[0]
: rows[Math.min(rows.length - 1, Math.max(0, at + by))];
if (!row) return;
selectRow(row);
const box = row.getBoundingClientRect();
const clear = headerBottom + (row.closest('.day')?.querySelector('h2')?.offsetHeight || 0) + 8;
if (box.top < clear) scrollTo(0, scrollY + box.top - clear);
else if (box.bottom > innerHeight - 8) scrollTo(0, scrollY + box.bottom - innerHeight + 8);
}
let openedShow = null;
function restoreOpenedShow() {
const opened = openedShow;
openedShow = null;
if (!opened || opened.view !== view || Date.now() - opened.time > 4 * 3600000 || document.querySelector('dialog[open]')) return;
const row = [...document.querySelectorAll('#list .row')].find(r => r.closest('[data-search]')?.dataset.search === opened.key &&
!r.closest('.hidden-by-search, details:not([open])'));
if (!row) return;
row.classList.add('stream-return');
setTimeout(() => row.classList.remove('stream-return'), 3500);
const bounds = row.getBoundingClientRect();
if (bounds.bottom <= document.querySelector('header').getBoundingClientRect().bottom || bounds.top >= innerHeight)
row.scrollIntoView?.({ block: 'center' });
}
try { $('markOnOpen').checked = localStorage.getItem('markOnOpen') === '1'; } catch {}
$('markOnOpen').onchange = () => { try { localStorage.setItem('markOnOpen', $('markOnOpen').checked ? '1' : '0'); } catch {} };
document.addEventListener('click', event => {
const row = event.target.closest?.('#list .row .links a')?.closest('.row');
if (!row) return;
const key = row.closest('[data-search]')?.dataset.search;
if (key) openedShow = { key, view, time: Date.now() };
if (!keyRows().includes(row)) return;
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
const tick = selected.querySelector('.watch:not(.done):not(:disabled):not([data-select])');
if (tick) action = () => tick.click();
}
else if (key === '/') action = () => openSearch(true);
else if (key === '?') action = () => openHelp(true);
else if (key === 't') action = () => { setView('week'); weekOffset = 0; setRange('today'); load(); };
else if (key === 'v' && (movesKey || delaysUrl)) action = async () => {
const todayButton = () => document.querySelector('#list .day.is-today [data-day-delay]');
if (!todayButton()) { setView('week'); weekOffset = 0; await load(); }
todayButton()?.click();
};
else if (['1', '2', '3'].includes(key)) action = () => $({ 1: 'viewWeek', 2: 'viewCatchup', 3: 'viewPace' }[key]).click();
if (!action) return;
event.preventDefault();
action();
});
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
const updateWrappedBanner = () => { $('seasonWrapped').hidden = !isSeasonFinalWeek(); };
updateWrappedBanner();
setInterval(updateWrappedBanner,60000);
document.addEventListener('visibilitychange',updateWrappedBanner);


$('list').addEventListener('click', e => { if (e.target.closest('[data-pick-people]')) { e.stopPropagation(); showPeople(true); $('groupButton').focus({ preventScroll: true }); } });

$('list').addEventListener('click', e => { if (e.target.closest('[data-back-to-week]')) $('viewWeek').click(); });
