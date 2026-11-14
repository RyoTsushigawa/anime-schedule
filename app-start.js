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
loadLinkFixes().then(() => { if (linkFixes.length && lastWeekRender && view === 'week') redraw(); }),
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
// When the newest feature went live: set it with each new feature (the Patch-Notes show the time since)
const LAST_FEATURE = { at: '2026-11-14T14:50:00Z', name: 'Willkommen für neue Leute' };
const PATCH_NOTES = [
{ id: '2026-11-13', title: 'Awards, a daily quiz, recurring absences and many new tools', items: [
'Seasonal Anime Awards, rebuilt: 22 categories like the Crunchyroll Awards (genres, characters, music, a Ceddl of the Year from candidates collected over the season), 12, 10 and 8 points per category, and after „Auflösen“ a Eurovision-style show, vote by vote. Voting is together: everyone fills in a ballot, it stays secret until „Auflösen“, then everyone sees who won. The new Ruhmeshalle lists the winners of all past seasons.',
'New: the Anime-Börse (Mehr › Anime-Börse). Trade shares of the season\'s anime with play money all season long. Prices move daily with AniList and your own ratings (drops hurt, the earlier the more), with graphs, and Wall Street rules: a fee per order, sale money the next day, short selling and circuit breakers.',
'New game: the daily Anime-Quiz, five questions about the shows in the Guckplan, the same for everyone. The games page now has four games.',
'Titel-Rätsel: any common English word counts as a guess, Hard mode is solvable, and it still works when AniList is unreachable. Inhalts-Rätsel got an archive of past days and stats.',
'Games load more reliably: fewer AniList requests, a clear message when a blocker stops AniList, and a „Neu laden“ button when a game can\'t start.',
'Absences: the calendar has tabs for single days, recurring absences (every Tuesday from 20:00, for example) and a week overview. Click an absence note to see why someone is away.',
'„Startet bald“ in the last weeks of a season: the next season\'s premieres that got „Ja“ votes, with their dates.',
'Wrong stream link? Day menu › „Falschen Link melden“. Reports go to a queue where the plan owner checks and fixes them for everyone.',
'Search box „Nachschlagen“: find any anime (nicknames work too) and see where and when it runs.',
'Settings: Lesbarkeit (larger text, higher contrast), Datenstand, Sync-Verlauf, Listen-Check for your AniList, and an AniList ↔ MAL comparison.',
'Catch-up: pin shows to the top. Season Preview: votes are kept as drafts, sequels of shows you watched are suggested, and your filter is remembered.',
'Watch Planner: „Aus Abwesenheiten“ marks the evenings people are away.',
] },
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
// how long ago, as „3 Tagen, 4 Std.“ / „2 Std. 15 Min.“ / „5 Min.“ (short: only the largest part)
function sinceText(at, short = false, now = Date.now()) {
const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60000));
const d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
const parts = d ? [`${d} ${d === 1 ? 'Tag' : 'Tagen'}`, h && `${h} Std.`] : h ? [`${h} Std.`, m && `${m} Min.`] : [`${m} Min.`];
return 'vor ' + (short ? parts[0] : parts.filter(Boolean).join(d ? ', ' : ' '));
}
function drawFeatureTimer() {
$('notesTimer').textContent = `Letztes neues Feature (${LAST_FEATURE.name}): ${sinceText(LAST_FEATURE.at)}`;
$('notesAge').textContent = sinceText(LAST_FEATURE.at, true);
$('notesButton').title = 'Was sich zuletzt geändert hat · letztes neues Feature ' + sinceText(LAST_FEATURE.at, true);
}
drawFeatureTimer();
setInterval(drawFeatureTimer, 60000);
function showNotes(list) {
drawFeatureTimer();
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
$('list').addEventListener('click', event => {
  const button = event.target.closest('[data-plan-diagnostic]');
  if (!button) return;
  const { week, shows } = JSON.parse(button.dataset.planDiagnostic);
  const picker = $('planDiagnosticShow'), report = $('planDiagnosticText'), status = $('planDiagnosticStatus');
  const dialog = $('planDiagnosticDlg');
  const id = value => Number.isSafeInteger(value) && value > 0 ? value : 'unbekannt';
  let weekTime;
  try { weekTime = JSON.parse(localStorage.getItem('week:' + week))?.time; } catch {}
  picker.replaceChildren(...shows.map((show, i) => new Option(show.title, i)));
  const draw = () => {
    const show = shows[picker.selectedIndex];
    const mal = show.mal || fallbackLinks.byAnilist[show.aniList]?.malId;
    report.value = [
      'Seriendaten · ' + show.title,
      'AniList-ID: ' + id(show.aniList),
      'MyAnimeList-ID: ' + id(mal),
      'Quelle im Plan: ' + show.source,
      'AniList-Wochendaten geladen: ' + ago(weekTime),
      'LiveChart-Datenstand: ' + ago(streamsDe?.statusUpdated || streamsDe?.generated),
      'Guckplan zuletzt geladen: ' + ago(dataStamps.get('sheet')),
    ].join('\n');
    status.textContent = '';
  };
  picker.onchange = draw;
  $('planDiagnosticCopy').onclick = async () => {
    const text = report.value;
    try {
      await navigator.clipboard.writeText(text);
      if (dialog.open && report.value === text) status.textContent = 'Bericht kopiert.';
    } catch {
      if (!dialog.open || report.value !== text) return;
      report.focus();
      report.select();
      status.textContent = 'Bericht markiert. Du kannst ihn manuell kopieren.';
    }
  };
  draw();
  dialog.showModal();
});
let readinessRun = 0;
$('list').addEventListener('click', async event => {
  if (!event.target.closest('#planReadinessButton')) return;
  const run = ++readinessRun;
  const dialog = $('planReadinessDlg'), status = $('planReadinessStatus'), list = $('planReadinessList');
  const current = () => dialog.open && run === readinessRun;
  const first = new Date(), end = new Date(first);
  end.setDate(first.getDate() + 6);
  const from = isoDay(first), to = isoDay(end);
  const offsets = weekStart(1) <= end ? [0, 1] : [0];
  list.replaceChildren();
  status.textContent = 'Guckplan und Sendetermine werden geprüft …';
  dialog.showModal();
  const results = await Promise.allSettled(offsets.map(async offset => {
    const start = weekStart(offset), previous = new Date(start);
    previous.setDate(start.getDate() - 7);
    const needed = new Map();
    for (let d = new Date(previous); d < new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7); d.setDate(d.getDate() + 1))
      for (const tab of activeTabs(tabs, d)) needed.set(tab.gid, tab);
    const [items, plans] = await Promise.all([
      Promise.all([fetchWeek(previous), fetchWeek(start)]),
      Promise.all([...needed.values()].map(async tab => [tab.gid, await sheetFor(tab)])),
    ]);
    if (!current()) return [];
    if (!plans.length || ![...plans].some(([, plan]) => plan.people.length)) throw Error('Missing Guckplan');
    return render(items.flat(), start, new Map(plans), true, false, null, true)
      .filter(issue => !issue.date || (issue.date >= from && issue.date <= to))
      .map(issue => ({ ...issue, offset }));
  }));
  if (!current()) return;
  const issues = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const seen = new Set();
  for (const { show, slot, date, reason, offset } of issues) {
    const title = show.english || show.romaji;
    const key = JSON.stringify([show.romaji || title, date, reason]);
    if (seen.has(key)) continue;
    seen.add(key);
    const row = document.createElement('li');
    const label = document.createElement('b');
    label.textContent = title;
    const detail = document.createElement('span');
    detail.textContent = (date ? shortDate(date) + ' · ' : '') + reason;
    row.append(label, detail);
    if (canMove()) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'pill';
      edit.textContent = 'Slot bearbeiten';
      edit.dataset.moveTitle = show.romaji || title;
      edit.dataset.moveName = title;
      edit.dataset.tag = slot?.tag || '';
      edit.dataset.time = slot?.time || '';
      edit.onclick = async () => {
        dialog.close();
        weekOffset = offset;
        setRange('week');
        await load();
        if (view === 'week' && weekOffset === offset) openMoveDialog(edit);
      };
      row.append(edit);
    }
    list.append(row);
  }
  status.textContent = results.every(result => result.status === 'rejected')
    ? 'Der Zeitraum konnte nicht geprüft werden.'
    : results.some(result => result.status === 'rejected') || !streamsDe
    ? 'Ein Teil der Daten konnte nicht geprüft werden.'
    : seen.size ? seen.size + ' Hinweise' : 'Für diesen Zeitraum sind keine offenen Punkte bekannt.';
});
// One baseline per person and week. Keep it until the user acknowledges the changes.
function scheduleInboxEntries(days) {
  return Object.fromEntries(days.flatMap(day => day.rows.flatMap(row => {
    const title = row.show?.english || row.show?.romaji;
    if (!title || row.extra || row.fallback) return [];
    const key = norm(row.show.romaji || title);
    const at = row.watchAt ?? row.plannedAt;
    const time = !row.pause && Number.isFinite(at)
      ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';
    return [[key, { title, day: isoDay(day.date), time, paused: !!row.pause }]];
  })));
}
let scheduleInboxRun = 0;
$('list').addEventListener('click', async event => {
  if (!event.target.closest('#scheduleInboxButton')) return;
  const run = ++scheduleInboxRun, person = soloPerson, start = weekStart(weekOffset);
  const dialog = $('scheduleInboxDlg'), status = $('scheduleInboxStatus');
  const list = $('scheduleInboxList'), read = $('scheduleInboxRead');
  const current = () => dialog.open && run === scheduleInboxRun;
  list.replaceChildren();
  read.hidden = true;
  status.textContent = 'Aktueller Guckplan wird geprüft …';
  dialog.showModal();
  try {
    await ready;
    const previous = new Date(start);
    previous.setDate(start.getDate() - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const needed = new Map([previous, start, end].flatMap(day =>
      activeTabs(tabs, day).map(tab => [tab.gid, tab])));
    const [airings, plans] = await Promise.all([
      Promise.all([downloadAirings(previous), downloadAirings(start)]),
      Promise.all([...needed.values()].map(async tab => [tab.gid, await loadPlan(tab, true)])),
    ]);
    if (!current()) return;
    if (!plans.some(([, plan]) => plan.people.includes(person))) {
      status.textContent = 'Für ' + person + ' gibt es keinen Plan in dieser Woche.';
      return;
    }
    const entries = scheduleInboxEntries(render(airings.flat(), start, new Map(plans), true, false, null, false, person));
    const key = 'scheduleInbox:v1:' + JSON.stringify([SHEET, person, isoDay(start)]);
    const prior = JSON.parse(localStorage.getItem(key) || 'null');
    const save = () => localStorage.setItem(key, JSON.stringify({ ...prior, ...entries }));
    if (!prior) {
      save();
      status.textContent = person + ' · Erster Vergleichspunkt gespeichert.';
      return;
    }
    for (const [id, row] of Object.entries(entries)) {
      const old = Object.hasOwn(prior, id) ? prior[id] : null;
      const change = !old ? 'Neu im Plan' : row.paused && !old.paused ? 'Pausiert'
        : !row.paused && old.paused ? 'Wieder im Plan'
        : row.day !== old.day || row.time !== old.time ? 'Verschoben' : '';
      if (!change) continue;
      const item = document.createElement('li');
      item.textContent = row.title + ' · ' + change + ' · ' + shortDate(row.day) + (row.time ? ' · ' + row.time : '');
      list.append(item);
    }
    status.textContent = person + ' · ' + (list.children.length ? list.children.length + ' Änderungen' : 'Keine Änderungen');
    read.hidden = !list.children.length;
    read.onclick = () => {
      try {
        save();
        list.replaceChildren();
        read.hidden = true;
        status.textContent = 'Änderungen als gelesen markiert.';
      } catch {
        status.textContent = 'Lesestand konnte nicht gespeichert werden.';
      }
    };
  } catch {
    if (current()) status.textContent = 'Planänderungen konnten gerade nicht geprüft werden. Der letzte Vergleichspunkt bleibt erhalten.';
  }
});
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
const what = e => e.removed ? 'Von der Liste genommen (Listen-Check)' : e.ok
  ? [e.score !== undefined ? `Wertung ${e.score}` : e.status === 'DROPPED' ? 'gedroppt' : e.from !== e.to ? `Folge ${e.from ?? 0} → ${e.to}` : `Folge ${e.to}`, e.note].filter(Boolean).join(' · ')
  : `Nicht gespeichert${e.to != null ? ` (Folge ${e.to})` : ''}: ${e.error}`;
$('syncList').innerHTML = list.length ? list.map(e => `<li class="${e.ok ? 'ok' : 'failed'}"><b>${e.ok ? '✓' : '✕'} ${esc(e.title)}</b><span>${esc(what(e))}</span><small>${esc(ago(e.at))}${e.account ? ' · ' + esc(e.account) : ''}</small></li>`).join('')
  : '<li class="muted">Noch nichts gespeichert.</li>';
}
// N24 Listen-Check: problems in an AniList list, each with a link to fix it there. Only "Nicht in deinem Guckplan"
// changes something, and only on request: a show on the list as watching although the Guckplan says "Nein" for
// you (left over from before 12 Nov, when ✓ in the group view could tick other people's shows into your list)
// can be taken off the connected list.
const HEALTH_QUERY = `query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status_in: [CURRENT, REPEATING, PAUSED, COMPLETED, PLANNING]) {
  lists { entries { id status progress updatedAt media { id status episodes siteUrl synonyms title { romaji english } } } } } }`;
const HEALTH_STALE_DAYS = 90;
function listHealth(entries, planned, now = Date.now(), notMine = []) {
const title = m => m.title.english || m.title.romaji;
const stale = [], beyond = [], incomplete = [], missing = [], stray = [];
// this season's Guckplan shows that aren't yours, but are on your list as watching (or paused)
for (const e of entries) {
  if (!['CURRENT', 'REPEATING', 'PAUSED'].includes(e.status)) continue;
  const titles = [e.media.title.romaji, e.media.title.english, ...(e.media.synonyms || [])].filter(Boolean);
  const show = notMine.find(s => titleMatches([s.romaji, s.english], titles));
  if (show) stray.push({ m: e.media, entry: e.id, text: `Bei Folge ${e.progress || 0} auf „${e.status === 'PAUSED' ? 'Pausiert' : 'Schaue ich'}“, im Guckplan steht bei dir „${show.votes?.[show.person] || 'Nein'}“` });
}
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
  ['Nicht in deinem Guckplan', 'Auf der Liste, obwohl du sie laut Guckplan nicht schaust. Bis zum 12. Nov. konnte ein ✓ in der Gruppenansicht fremde Serien in deine Liste schreiben.', stray],
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
  const mine = sheet && person ? new Set(picks(sheet, person).keys()) : new Set();
  const planned = [...mine].filter(s => !s.hidden);
  // the season's shows this person doesn't watch (an empty or "Default" vote counts as not watching)
  const notMine = sheet && person ? sheet.shows.filter(s => !s.hidden && !mine.has(s) && !watchesAlone(s, person)).map(s => ({ ...s, person })) : [];
  const groups = listHealth(entries, planned, Date.now(), notMine), found = groups.reduce((n, g) => n + g.items.length, 0);
  const canRemove = !!auth && auth.provider !== 'mal' && auth.name.toLowerCase() === anilistName.toLowerCase();
  $('healthIntro').textContent = found ? `${entries.length} Einträge von ${anilistName} geprüft · ${found} ${found === 1 ? 'Hinweis' : 'Hinweise'}. Ändern geht auf AniList.` : `${entries.length} Einträge von ${anilistName} geprüft: alles in Ordnung ✓`;
  $('healthList').innerHTML = groups.filter(g => g.items.length).map(g => `<section><h3>${esc(g.name)} <span>${g.items.length}</span></h3>${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}<ul class="data-list">${g.items.map(i => i.m
    ? `<li${i.entry ? ` data-stray="${i.entry}" data-media="${i.m.id}"` : ''}><a href="${safeUrl(i.m.siteUrl)}" target="_blank" rel="noopener"><b>${esc(i.m.title.english || i.m.title.romaji)}</b></a><span>${esc(i.text)}</span>${i.entry && canRemove ? '<span class="repair-actions"><button type="button" class="pill" data-stray-remove>Von meiner Liste nehmen</button></span>' : ''}</li>`
    : `<li><b>${esc(i.show.english || i.show.romaji)}</b><span>${esc(i.text)}</span></li>`).join('')}</ul></section>`).join('');
} catch (e) { $('healthIntro').textContent = `Die Liste konnte nicht geladen werden: ${e.message}`; }
}
$('healthList').addEventListener('click', async event => {
  const button = event.target.closest('[data-stray-remove]');
  if (!button) return;
  const row = button.closest('[data-stray]'), title = row.querySelector('b').textContent;
  if (!confirm(`„${title}“ von deiner AniList-Liste nehmen? Der Eintrag mit deinem Fortschritt wird gelöscht.`)) return;
  button.disabled = true;
  try {
    await anilistAsMe('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: Number(row.dataset.stray) });
    const mediaId = Number(row.dataset.media);
    knownEntries.delete(mediaId); myProgress.delete(mediaId); notOnList.add(mediaId);
    invalidateAccount(auth);
    logSync({ mediaId, title, account: 'AniList ' + auth.name, ok: true, removed: true });
    row.querySelector('.repair-actions').textContent = '✓ Von der Liste genommen';
    if (view === 'catchup') load(true);
  } catch (e) { button.disabled = false; button.closest('.repair-actions').append(Object.assign(document.createElement('small'), { textContent: ' Nicht gelöscht: ' + e.message })); }
});
$('accountCheckButton').onclick = () => {
  showSettings(false);
  $('accountCheckDlg').showModal();
  checkListConnection();
};
$('accountCheckRetry').onclick = checkListConnection;
// U57 Stream-Links kopieren: the day's links as text, e.g. for Discord
$('list').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy-links]');
  if (!button) return;
  let rows = [];
  try { rows = JSON.parse(button.dataset.copyLinks); } catch {}
  const text = rows.map(([title, url]) => `${title}: ${url}`).join('\n');
  if (!text) return;
  try { await navigator.clipboard.writeText(text); notice(rows.length === 1 ? 'Stream-Link kopiert' : `${rows.length} Stream-Links kopiert`); }
  catch { prompt('Zum Kopieren markieren:', text); }
});
// U45 Falschen Link melden: to the votes helper (workers/season-votes, POST /reports), for the repair queue
$('list').addEventListener('click', event => {
  const button = event.target.closest('[data-link-report]');
  if (!button) return;
  const shows = JSON.parse(button.dataset.linkReport);
  const showPick = $('linkReportShow'), linkPick = $('linkReportLink');
  showPick.replaceChildren(...shows.map((s, i) => new Option(s.title, i)));
  const drawLinks = () => linkPick.replaceChildren(...shows[showPick.selectedIndex].links.map((l, i) => new Option(l.label, i)));
  showPick.onchange = drawLinks;
  drawLinks();
  $('linkReportSuggestion').value = ''; $('linkReportNote').value = ''; $('linkReportStatus').textContent = '';
  $('linkReportSend').disabled = false;
  $('linkReportSend').onclick = async () => {
    const show = shows[showPick.selectedIndex], link = show.links[linkPick.selectedIndex];
    const suggestion = $('linkReportSuggestion').value.trim(), status = $('linkReportStatus');
    if (suggestion && !/^https:\/\/\S+$/.test(suggestion)) { status.textContent = 'Der richtige Link muss mit https:// beginnen.'; return; }
    const api = (await config()).previewVotesUrl;
    if (!/^https:\/\//.test(api || '')) { status.textContent = 'Melden ist hier noch nicht eingerichtet.'; return; }
    $('linkReportSend').disabled = true; status.textContent = 'Wird gesendet …';
    try {
      const res = await fetch(api.replace(/\/$/, '') + '/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilistId: show.aniList, title: show.title, service: link.label, url: link.url, suggestion, note: $('linkReportNote').value.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Fehler ' + res.status);
      status.textContent = data.duplicate ? 'Das wurde schon gemeldet. Danke!' : 'Gemeldet. Danke!';
      setTimeout(() => $('linkReportDlg').close(), 1200);
    } catch (e) { status.textContent = 'Nicht gesendet: ' + e.message; $('linkReportSend').disabled = false; }
  };
  $('linkReportDlg').showModal();
});
// N55 Link-Meldungen: the open reports for the plan owner (the browser with the GitHub key). A proposed link
// is checked against the service's own site; "Übernehmen" saves it to link-fixes.json (applied on top of the
// generated links, so the next link build doesn't undo it) and closes every open report for the same link.
const SERVICE_SITES = [[/crunchyroll/i, /(^|\.)crunchyroll\.com$/], [/netflix/i, /(^|\.)netflix\.com$/], [/prime|amazon/i, /(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/],
  [/youtube/i, /(^|\.)(youtube\.com|youtu\.be)$/], [/disney/i, /(^|\.)disneyplus\.com$/], [/^adn|animation digital/i, /(^|\.)animationdigitalnetwork\.[a-z]+$/],
  [/hidive/i, /(^|\.)hidive\.com$/], [/akiba/i, /(^|\.)akibapass\.de$/], [/aniworld/i, /(^|\.)aniworld\.to$/], [/subsplease/i, /(^|\.)subsplease\.org$/], [/nyaa/i, /(^|\.)nyaa\.si$/]];
function checkSuggestion(report) {
  if (!report.suggestion) return { ok: false, text: 'Kein richtiger Link vorgeschlagen' };
  let host;
  try { host = new URL(report.suggestion).hostname.toLowerCase(); } catch { return { ok: false, text: 'Kein gültiger Link' }; }
  if (report.suggestion === report.url) return { ok: false, text: 'Gleicher Link wie der gemeldete' };
  const site = SERVICE_SITES.find(([name]) => name.test(report.service));
  if (!site) return { ok: true, text: 'Dienst unbekannt, Seite ' + host + ' bitte selbst prüfen' };
  return site[1].test(host) ? { ok: true, text: 'Passt zu ' + report.service + ' (' + host + ')' } : { ok: false, text: 'Andere Seite als ' + report.service + ': ' + host };
}
const reportsApi = async () => { const api = (await config()).previewVotesUrl; return /^https:\/\//.test(api || '') ? api.replace(/\/$/, '') : ''; };
const groupHeaders = () => { const code = savedGroupCode(); return code ? { 'X-Group-Code': code } : {}; };
let repairReports = [];
async function loadRepairQueue() {
  const list = $('repairList');
  list.innerHTML = '<li class="muted">Wird geladen …</li>';
  const api = await reportsApi();
  if (!api) { list.innerHTML = '<li class="muted">Meldungen sind hier nicht eingerichtet.</li>'; return; }
  try {
    const res = await fetch(api + '/reports?status=pending', { headers: groupHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Fehler ' + res.status);
    repairReports = data.reports || [];
    drawRepairQueue();
  } catch (e) { list.innerHTML = `<li class="muted">Nicht geladen: ${esc(e.message)}</li>`; }
}
function drawRepairQueue() {
  $('repairCount').textContent = repairReports.length ? `${repairReports.length} offen` : '';
  $('repairList').innerHTML = repairReports.length ? repairReports.map(r => {
    const check = checkSuggestion(r);
    return `<li data-report="${esc(r.id)}"><b>${esc(r.title)} · ${esc(r.service)}</b>
      <span>Gemeldet: <a href="${safeUrl(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></span>
      ${r.suggestion ? `<span>Vorschlag: <a href="${safeUrl(r.suggestion)}" target="_blank" rel="noopener">${esc(r.suggestion)}</a></span>` : ''}
      ${r.note ? `<span>Notiz: ${esc(r.note)}</span>` : ''}
      <small class="${check.ok ? 'ok' : 'warn'}">${check.ok ? '✓' : '⚠'} ${esc(check.text)} · ${esc(ago(r.at))}</small>
      <span class="repair-actions">${r.suggestion ? `<button type="button" class="pill${check.ok ? ' primary' : ''}" data-repair="take">Übernehmen</button>` : ''}<button type="button" class="pill" data-repair="fixed">Erledigt</button><button type="button" class="pill" data-repair="rejected">Ablehnen</button></span></li>`;
  }).join('') : '<li class="muted">Keine offenen Meldungen.</li>';
}
async function saveLinkFix(report) {
  const api = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/link-fixes.json';
  const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fetch(api + '?ref=main&_=' + Date.now(), { headers, cache: 'no-store' });
    const meta = current.ok ? await current.json() : null;
    let file = { fixes: [] };
    try { if (meta?.content) file = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch {}
    const fixes = (file.fixes || []).filter(f => !(f.anilistId === report.anilistId && (f.from === report.url || f.service === report.service)));
    fixes.push({ anilistId: report.anilistId, title: report.title, service: report.service, from: report.url, to: report.suggestion, report: report.id, at: new Date().toISOString() });
    const content = btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), fixes }, null, 1) + '\n')));
    const res = await fetch(api, { method: 'PUT', headers, body: JSON.stringify({ message: 'Link-Korrektur: ' + report.title, content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
    if (res.ok) { linkFixes = fixes; return; }
    if (res.status !== 409 && res.status !== 422) throw new Error('GitHub antwortet ' + res.status);
  }
  throw new Error('GitHub: die Datei wurde gleichzeitig geändert, bitte erneut versuchen');
}
async function resolveReports(reports, status, resolution) {
  const api = await reportsApi();
  for (const r of reports) {
    const res = await fetch(api + '/reports/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', ...groupHeaders() }, body: JSON.stringify({ id: r.id, status, resolution }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Fehler ' + res.status);
  }
}
$('repairList').addEventListener('click', async event => {
  const button = event.target.closest('[data-repair]');
  if (!button) return;
  const report = repairReports.find(r => r.id === button.closest('[data-report]').dataset.report);
  if (!report) return;
  const action = button.dataset.repair, status = $('repairStatus');
  // every open report about the same link goes with it
  const same = repairReports.filter(r => r.anilistId === report.anilistId && r.url === report.url && (action !== 'take' || !r.suggestion || r.suggestion === report.suggestion));
  button.closest('li').querySelectorAll('button').forEach(b => { b.disabled = true; });
  status.textContent = 'Wird gespeichert …';
  try {
    if (action === 'take') await saveLinkFix(report);
    await resolveReports(action === 'take' ? same : [report], action === 'take' ? 'fixed' : action,
      action === 'take' ? 'Übernommen: ' + report.suggestion : action === 'fixed' ? 'Von Hand behoben' : 'Abgelehnt');
    const done = new Set((action === 'take' ? same : [report]).map(r => r.id));
    repairReports = repairReports.filter(r => !done.has(r.id));
    status.textContent = action === 'take' ? 'Übernommen. Der Link gilt für alle nach dem nächsten Laden.' : action === 'fixed' ? 'Als erledigt markiert.' : 'Abgelehnt.';
    drawRepairQueue();
    if (action === 'take' && lastWeekRender && view === 'week') redraw();
  } catch (e) {
    status.textContent = 'Nicht gespeichert: ' + e.message;
    button.closest('li').querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
});
$('repairButton').onclick = () => { showSettings(false); $('repairStatus').textContent = ''; $('repairDlg').showModal(); loadRepairQueue(); };
$('repairReload').onclick = loadRepairQueue;
$('repairButton').hidden = !movesKey;
// N59 Transfer-Assistent, preview first: AniList and MyAnimeList entries matched by MAL ID; nothing is written
const TRANSFER_QUERY = `query ($user: String) { MediaListCollection(userName: $user, type: ANIME) { lists { entries {
  status progress score media { id idMal episodes siteUrl title { english romaji } } } } } }`;
const STATUS_DE = { CURRENT: 'Schaue ich', REPEATING: 'Wiederholt', COMPLETED: 'Abgeschlossen', PAUSED: 'Pausiert', DROPPED: 'Gedroppt', PLANNING: 'Geplant' };
function transferPreview(aniEntries, malEntries) {
const title = m => m.title?.english || m.title?.romaji || 'MAL ' + m.idMal;
const mal = new Map(malEntries.filter(e => e.media?.idMal).map(e => [e.media.idMal, e]));
const onlyAni = [], noMalId = [], differ = [], seen = new Set();
for (const e of aniEntries) {
  if (!e.media?.idMal) { noMalId.push({ title: title(e.media), url: e.media.siteUrl, text: `${STATUS_DE[e.status] || e.status} · Folge ${e.progress || 0}` }); continue; }
  const other = mal.get(e.media.idMal);
  seen.add(e.media.idMal);
  // copy: what "Auf MyAnimeList übernehmen" writes (AniList's status and episode)
  const copy = { idMal: e.media.idMal, status: e.status, progress: e.progress || 0 };
  if (!other) { onlyAni.push({ title: title(e.media), url: e.media.siteUrl, text: `${STATUS_DE[e.status] || e.status} · Folge ${e.progress || 0}`, copy }); continue; }
  if (other.status !== e.status || (other.progress || 0) !== (e.progress || 0))
    differ.push({ title: title(e.media), url: e.media.siteUrl, text: `AniList: ${STATUS_DE[e.status] || e.status}, Folge ${e.progress || 0} · MAL: ${STATUS_DE[other.status] || other.status}, Folge ${other.progress || 0}`, copy });
}
const onlyMal = malEntries.filter(e => e.media?.idMal && !seen.has(e.media.idMal)).map(e => ({ title: title(e.media), url: 'https://myanimelist.net/anime/' + e.media.idMal, text: `${STATUS_DE[e.status] || e.status} · Folge ${e.progress || 0}` }));
const by = (a, b) => a.title.localeCompare(b.title);
return [['Unterschiedlich', differ], ['Nur auf AniList', onlyAni], ['Nur auf MyAnimeList', onlyMal], ['Auf AniList ohne MyAnimeList-ID', noMalId]].map(([name, items]) => ({ name, items: items.sort(by) }));
}
let transferItems = [], transferMal = null;
async function drawTransfer(note = '') {
const ani = accounts.find(a => (a.provider || 'anilist') === 'anilist'), mal = accounts.find(a => a.provider === 'mal');
$('transferList').innerHTML = ''; transferItems = []; transferMal = mal; drawTransferCopy();
if (!ani || !mal) { $('transferIntro').textContent = 'Dafür braucht dieser Browser ein AniList- und ein MyAnimeList-Konto (Kontomenü).'; return; }
$('transferIntro').textContent = `Vergleiche ${ani.name} (AniList) mit ${mal.name} (MyAnimeList) …`;
try {
  const [aniEntries, malResult] = await Promise.all([
    anilist(TRANSFER_QUERY, { user: ani.name }, ani.token).then(d => d.MediaListCollection.lists.flatMap(l => l.entries)),
    MAL.list(mal, true)]);
  const groups = transferPreview(aniEntries, malResult.entries), found = groups.reduce((n, g) => n + g.items.length, 0);
  $('transferIntro').textContent = (note ? note + ' ' : '') + (found ? `${aniEntries.length} Einträge auf AniList, ${malResult.entries.length} auf MyAnimeList. Angehakte Einträge kannst du unten auf MyAnimeList übernehmen; sonst wird nichts geändert.` : 'Beide Listen stimmen überein ✓');
  // N59: a tick per entry that can be copied (AniList's status and episode go to MyAnimeList), and one per section for all
  const row = i => { const n = i.copy ? transferItems.push(i) - 1 : -1;
    return `<li>${n >= 0 ? `<input type="checkbox" class="transfer-pick" data-copy="${n}" aria-label="${esc(i.title)} übernehmen">` : ''}<a href="${safeUrl(i.url)}" target="_blank" rel="noopener"><b>${esc(i.title)}</b></a><span>${esc(i.text)}</span></li>`; };
  $('transferList').innerHTML = groups.filter(g => g.items.length).map(g => { const rows = g.items.slice(0, 60).map(row).join(''), copyable = g.items.some(i => i.copy);
    return `<section><h3>${copyable ? '<input type="checkbox" class="transfer-all" aria-label="Alle in diesem Abschnitt auswählen">' : ''}${esc(g.name)} <span>${g.items.length}</span></h3><ul class="data-list">${rows}${g.items.length > 60 ? `<li class="muted">… und ${g.items.length - 60} weitere</li>` : ''}</ul></section>`; }).join('');
  drawTransferCopy();
} catch (e) { $('transferIntro').textContent = `Die Listen konnten nicht verglichen werden: ${e.message}`; }
}
function drawTransferCopy() {
  const n = $('transferList').querySelectorAll('.transfer-pick:checked').length;
  $('transferCopy').hidden = !transferItems.length;
  $('transferCopy').disabled = !n;
  $('transferCopy').textContent = n ? `${n} auf MyAnimeList übernehmen` : 'Auf MyAnimeList übernehmen';
}
$('transferList').addEventListener('change', e => {
  if (e.target.classList.contains('transfer-all')) e.target.closest('section').querySelectorAll('.transfer-pick').forEach(c => { c.checked = e.target.checked; });
  drawTransferCopy();
});
// writes AniList's status and episode to MyAnimeList, one entry at a time; the result goes to the Sync-Verlauf too
$('transferCopy').onclick = async () => {
  const picks = [...$('transferList').querySelectorAll('.transfer-pick:checked')].map(c => transferItems[+c.dataset.copy]).filter(Boolean);
  if (!picks.length || !transferMal) return;
  if (!confirm(`${picks.length} ${picks.length === 1 ? 'Eintrag' : 'Einträge'} auf MyAnimeList (${transferMal.name}) mit Status und Folge von AniList überschreiben?`)) return;
  const button = $('transferCopy'); button.disabled = true;
  let done = 0; const failed = [];
  for (const item of picks) {
    $('transferIntro').textContent = `Übernehme ${done + failed.length + 1} von ${picks.length}: ${item.title} …`;
    try {
      await MAL.save(transferMal, -item.copy.idMal, { status: item.copy.status, progress: item.copy.progress });
      done++;
      logSync({ title: item.title, account: 'MyAnimeList ' + transferMal.name, ok: true, to: item.copy.progress, status: item.copy.status, note: 'Von AniList übernommen' });
    } catch (e) {
      failed.push(item.title + ' (' + e.message + ')');
      logSync({ title: item.title, account: 'MyAnimeList ' + transferMal.name, ok: false, error: e.message, note: 'Von AniList übernehmen' });
    }
  }
  await drawTransfer(`${done} übernommen${failed.length ? ', nicht geklappt: ' + failed.join(', ') : ''}.`);
};
$('transferButton').onclick = () => { showSettings(false); $('transferDlg').showModal(); drawTransfer(); };
$('healthButton').onclick = () => { showSettings(false); $('healthDlg').showModal(); drawHealth(); };
$('syncButton').onclick = () => { showSettings(false); drawSyncHistory(); $('syncDlg').showModal(); };
$('syncClear').onclick = () => { try { localStorage.removeItem(SYNC_LOG); } catch {} drawSyncHistory(); };
function drawEpisodeCrosswalk() {
  const show = $('episodeCrosswalkShow').value;
  const input = $('episodeCrosswalkNumber');
  const result = $('episodeCrosswalkResults');
  const episode = input.valueAsNumber;
  const fromPlan = $('episodeCrosswalkFrom').value === 'plan';
  const aniList = fromPlan ? episode + lagOf(show) : episode;
  const plan = fromPlan ? episode : episode - lagOf(show);
  const rows = !show ? ['Keine bestätigte Nummernabweichung geladen.']
    : !Number.isSafeInteger(episode) || !input.validity.valid ? ['Gib eine ganze Folgennummer ab 1 ein.']
    : [
      aniList > 0 ? 'AniList: Folge ' + aniList : 'AniList: Keine Zuordnung für diese Folge',
      plan > 0 ? 'Guckplan: Folge ' + plan : 'Guckplan: Keine Zuordnung für diese Folge',
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
  select.disabled = input.disabled = $('episodeCrosswalkFrom').disabled = !options.length;
  drawEpisodeCrosswalk();
  $('episodeCrosswalkDlg').showModal();
};
$('episodeCrosswalkShow').onchange = drawEpisodeCrosswalk;
$('episodeCrosswalkNumber').oninput = drawEpisodeCrosswalk;
$('episodeCrosswalkFrom').onchange = drawEpisodeCrosswalk;
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
$('headerHelp').onclick = () => openHelp();
// First visit: three short steps instead of everything at once. Not for people who used the site before,
// and not for the automatic runs (the daily Discord post, the site check). The help can show it again.
function fillWelcomeNames() {
  const names = [...$('soloPerson').options].map(o => o.value).filter(Boolean);
  $('welcomePerson').replaceChildren(...names.map(n => new Option(n, n)));
  $('welcomePerson').value = soloPerson;
  $('welcomePerson').closest('li').hidden = !names.length;
}
// the names come with the Guckplan, which can arrive after the welcome opened
new MutationObserver(() => { if ($('welcomeDlg').open) fillWelcomeNames(); }).observe($('soloPerson'), { childList: true });
function openWelcome() {
  fillWelcomeNames();
  $('welcomeDlg').showModal();
}
$('welcomePerson').onchange = () => { $('soloPerson').value = $('welcomePerson').value; $('soloPerson').onchange(); if (mode !== 'solo') setMode('solo'); };
$('welcomeDlg').addEventListener('close', () => { try { localStorage.setItem('welcomeSeen', '1'); } catch {} });
$('helpWelcome').onclick = () => { $('helpDialog').close(); openWelcome(); };
$('welcomeDone').onclick = e => { e.preventDefault(); $('welcomeDlg').close(); };
ready.then(() => {
  let seen = true;
  try { seen = !!localStorage.getItem('welcomeSeen'); } catch {}
  if (!seen && !returningVisitor && !navigator.webdriver && !document.querySelector('dialog[open]')) openWelcome();
  else try { localStorage.setItem('welcomeSeen', '1'); } catch {}
});
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
