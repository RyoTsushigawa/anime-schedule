// Main page, part 5: Catch-up and Non-seasonal (open episodes, seasons, the − N + counter).
function dueAt(released, slot, show) {
const monday = new Date(released * 1000);
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
const mv = show && moveFor(show, monday);
// Skipped episodes enter Catch-up once aired; their cancelled viewing slot
// must not delay them. Already-watched episodes are filtered by progress.
if (mv?.skip) return released;
if (mv) slot = { tag: mv.tag, time: mv.time };
const day = watchDay(new Date(released * 1000), slot?.tag, slot?.time);
const hm = parseTime(slot?.time);
if (hm) day.setHours(hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0], hm[1], 0, 0);
else day.setDate(day.getDate() + 1);
return Math.max(released, day.getTime() / 1000);
}
// Shows the group sets out this week because too few watchers are there (Abwesend): like a manual skip,
// their episode belongs in Catch-up as soon as it airs. Read from the shown week's group schedule.
function absenceSkips() {
const out = new Set();
if (!lastWeekRender) return out;
try { for (const d of render(...lastWeekRender, true)) for (const r of d.rows) if (r.pause && r.skipped && r.missing?.length && r.alId) out.add(r.alId + ':' + r.episode); } catch {}
return out;
}
function catchupRows(entries, planShows, plan, person = soloPerson) {
const now = Date.now() / 1000;
const away = absenceSkips();
const week = 7 * 86400;
const mySlots = plan && person ? [...picks(plan, person)] : [];
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
const lag = lagOf(m.id);
const released = ep => next.airingAt - (next.episode - lag - ep) * week + offset;
let out = next ? next.episode - lag - 1 : m.status === 'FINISHED' ? m.episodes : 0;
while (next && out > progress && (away.has(m.id + ':' + out) ? released(out) : dueAt(released(out), slot, mine?.[0] || show)) > now) out--;
if (!out || out <= progress) continue;
const first = progress + 1;
const since = next ? released(first) : 0;
const nextAt = next ? released(out + 1) : 0;
const row = { m, first, out, since, nextAt, missing, progress, links: streamLinks(m, show?.wo, m.title.english || m.title.romaji) };
(missing || show || recent(m) ? rows : ownPace).push(row);
}
return { rows, ownPace };
}
// Group outstanding episodes by their original airing season in Berlin time.
// Finished series may not expose historical episode dates: use their start season.
function catchupSeasonKey(at, startDate) {
 let year, month;
 if (Number.isFinite(at) && at > 0) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Berlin', year: 'numeric', month: 'numeric'}).formatToParts(new Date(at * 1000));
  year = Number(parts.find(p => p.type === 'year')?.value);
  month = Number(parts.find(p => p.type === 'month')?.value);
 } else if (startDate?.year && startDate?.month) {
  year = Number(startDate.year);
  month = Number(startDate.month);
 }
 return year && month >= 1 && month <= 12 ? year + '-' + Math.floor((month - 1) / 3) : 'unknown';
}
function catchupSeasonLabel(key) {
 if (key === 'unknown') return 'Season unbekannt';
 const [year, quarter] = key.split('-').map(Number);
 return ['Winter', 'Frühling', 'Sommer', 'Herbst'][quarter] + ' ' + year;
}
function catchupSeasonGroups(rows) {
 const groups = new Map();
 for (const row of rows) {
  const next = row.m.nextAiringEpisode;
  const offset = streamsDe?.release?.[row.m.id]?.offset || 0;
  const lag = next ? lagOf(row.m.id) : 0;
  const at = ep => next ? next.airingAt - (next.episode - lag - ep) * 7 * 86400 + offset : 0;
  let part = null;
  for (let ep = row.first; ep <= row.out; ep++) {
   const key = catchupSeasonKey(at(ep), row.m.startDate);
   if (!part || part.key !== key) {
    part = {...row, key, first: ep, out: ep, since: at(ep) || row.since};
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
   } else part.out = ep;
  }
 }
 return [...groups].sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a))
  .map(([key, entries]) => ({key, label: catchupSeasonLabel(key), rows: entries}));
}
// Mark only the episodes belonging to this season, never later episodes from
// the same series. AniList/MAL progress is sequential, so older episodes below
// a later progress value are implicitly watched as well.
function showCatchupSeasonHeaders(groups, now = Date.now() / 1000) {
 return !(groups.length === 1 && groups[0].key === catchupSeasonKey(now));
}
function seasonWatchTargets(rows) {
 const byMedia = new Map();
 for (const r of rows) {
  const id = Number(r.m.id);
  if (!Number.isSafeInteger(id) || id <= 0 || r.out <= r.progress) continue;
  const prior = byMedia.get(id);
  if (!prior || r.out > prior.progress)
   byMedia.set(id, {mediaId: id, progress: r.out, add: !!r.missing});
 }
 return [...byMedia.values()];
}
function showCatchupCount(rows) {
const count = rows.filter(r => !r.missing).reduce((sum, r) => sum + r.out - r.first + 1, 0);
catchupMinutes = rows.filter(r => !r.missing).reduce((sum, r) => sum + (r.out - r.first + 1) * (r.m.duration || 24), 0);
$('catchupCount').textContent = count || '';
$('catchupCount').hidden = !count;
$('catchupCount').title = count ? `${count} ${count === 1 ? 'Folge' : 'Folgen'} für Catch-up` : '';
return count;
}
let catchupMinutes = 0;
function catchupTime() {
const m = Math.round(catchupMinutes / 5) * 5;
if (!m) return '';
return ' · ≈ ' + (m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std.${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`);
}
let countingCatchup = null;
async function updateCatchupCount() {
const user = $('anilistUser').value.trim();
if (!user || (countingCatchup?.user === user && countingCatchup.account === auth)) return;
const job = {user, account:auth}; countingCatchup = job;
try {
const entries = await anilistList(user);
if (countingCatchup !== job || auth !== job.account || $('anilistUser').value.trim() !== user) return;
const plan = await sheetFor(tabFor(tabs, new Date()));
if (countingCatchup !== job || auth !== job.account || $('anilistUser').value.trim() !== user) return;
const { rows } = catchupRows(entries, await missingPlanShows(plan, entries), plan);
if (countingCatchup === job && auth === job.account && $('anilistUser').value.trim() === user) showCatchupCount(rows);
} catch {} finally { if (countingCatchup === job) countingCatchup = null; }
}
let catchupGeneration = 0;
async function loadCatchupContent(refresh = false) {
const generation = ++catchupGeneration, account = auth;
updateFallbackControls();
const user = listUser(), friend = friendList.value;
const local = isLocalList(), person = local ? localListPerson() : soloPerson;
const provider = local ? 'Lokal' : friend ? 'AniList' : listService();
const shown = view;
const current = () => generation === catchupGeneration && auth === account && view === shown && listUser() === user && friendList.value === friend;
const name = shown === 'pace' ? 'Non-seasonal' : 'Catch-up';
$('tabName').textContent = user ? name + ' · ' + (local ? person : user) + ' · ' + provider + (friend && !local ? ' · Nur lesen' : '') : name;
if (!user) { $('list').innerHTML = '<div class="status">Kein AniList-Name eingetragen.</div>'; return; }
if (!document.querySelector('#list .row')) $('list').innerHTML = LOADING_HTML;
await ready;
if (!current()) return;
let entries;
try {
entries = local ? [] : await anilistList(user, false, !!friend);
} catch (e) {
if (refresh && current() && document.querySelector('#list .row')) {
notice(`${name} konnte nicht aktualisiert werden: ${e.message}. Es werden weiter die bisherigen Daten angezeigt.`);
return;
}
if (current() && friend && [403, 404].includes(e.status)) {
$('list').innerHTML = '<div class="status">Diese AniList-Liste ist privat oder wurde nicht gefunden.</div>';
return;
}
if (current()) $('list').innerHTML = failed(navigator.onLine === false
? `Du bist offline, und die AniList-Liste von ${user} ist in diesem Browser noch nicht gespeichert.` : `Die AniList-Liste von ${user} konnte nicht geladen werden (${e.message}).`);
return;
}
if (!current()) return;
let plan = null;
try {
plan = await sheetFor(tabFor(tabs, new Date()));
if (!current()) return;
setNote('catchup:plan', null);
} catch (e) {
if (!current()) return;
setNote('catchup:plan', `${unreachable('Google Sheets')}: ohne den Guckplan fehlen Guck-Slots und geplante Serien, die nicht auf der Liste sind.`);
}
let planShows = friend && !local ? [] : await missingPlanShows(plan, entries, local);
if (!current()) return;
if (local) {
  let extra = [];
  try {
    extra = await localCatalog(person);
    setNote('catchup:local', null);
  } catch { setNote('catchup:local', 'Zusätzliche lokale Serien konnten gerade nicht geladen werden.'); }
  if (!current()) return;
  const byId = new Map([...planShows.map(x => x.media), ...extra].map(m => [Number(m.id), m]));
  localExportSeen.set(person, byId);
  entries = [...byId.values()].map(m => ({media:m, progress:localProgress(person, Number(m.id)), missing:false}));
  planShows = [];
}
const { rows, ownPace } = catchupRows(entries, planShows, plan, local ? person : friend ? friendList.selectedOptions[0]?.dataset.person : soloPerson);
const openEpisodes = showCatchupCount(rows);
const byTitle = (a, b) => (a.m.title.english || a.m.title.romaji).localeCompare(b.m.title.english || b.m.title.romaji);
rows.sort(choices.sort === 'az' ? byTitle
: choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first) || a.since - b.since
: choices.sort === 'quick' ? (a, b) => (a.out - a.first) - (b.out - b.first) || a.since - b.since
: choices.sort === 'next' ? (a, b) => (a.nextAt || Infinity) - (b.nextAt || Infinity) || a.since - b.since
: (a, b) => a.since - b.since);
const nextHint = (nextAt, out) => choices.sort !== 'next' || !nextAt ? ''
: `<span class="next-hint"> · ${nextAt * 1000 <= Date.now() ? `Folge ${out + 1} schon da` : 'neu ' + (new Date(nextAt * 1000).toDateString() === new Date().toDateString() ? 'heute' + savedAt(nextAt * 1000).slice(2) : savedAt(nextAt * 1000))}</span>`;
const mine = local || (!friend && auth?.name && user.toLowerCase() === auth.name.toLowerCase());
const canBulk = mine && !local;
catchupTargets = canBulk && shown === 'catchup' ? rows.map(r => ({ mediaId: r.m.id, progress: r.out, add: !!r.missing })) : [];
catchupById = new Map(rows.map(r => [r.m.id, r]));
const planIn = m => movesKey && !selecting ? `<button class="plan-in" data-plan="${m.id}" title="Einplanen: diese Woche in den Plan" aria-label="Einplanen"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : '';
const selector = m => `<button class="watch${skipped.has(m.id) ? '' : ' done'}" data-select="${m.id}"
    title="Bei „Alle ✓“ mitnehmen">✓</button>`;
const check = (m, ep, missing) => selecting ? selector(m) : local ? localWatchButton(m.id, ep) : watchButton(m.id, ep, missing);
const single = singleEpisodes;
const title = m => `<div class="title"><a href="${safeUrl(m.siteUrl)}" target="_blank" rel="noopener">${esc(m.title.english || m.title.romaji)}</a></div>`;
const seen = (progress, m) => m.episodes ? `${progress} von ${m.episodes} gesehen` : `${progress} gesehen`;
const grouped = ({ m, first, out, nextAt, missing, links, progress }) => `
    <div class="row catchup-single" ${artStyle(m)} ${searchKey(...mediaTitles(m))}>
      <div class="time"><span class="time-day">Folge</span> ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep"><span class="catchup-count">${out - first + 1} offen</span> ${seen(progress, m)}${nextHint(nextAt, out)}</div>
      </div>
      <div class="links">${linkButtons(links, m.id)}</div>
      ${mine ? (local ? '' : dropButton(m.id)) + (selecting || out <= first || (!auth && !local) ? check(m, out, missing) : stepper(m, first, out, missing)) : ''}${planIn(m)}
    </div>`;
// Several open episodes: − / + choose how many to mark (Catch-up starts with all, Non-seasonal with one);
// only the ✓ saves
const stepper = (m, first, out, missing, count = out - first + 1) => `<span class="ep-stepper" data-first="${first}" data-out="${out}">`
  + `<button type="button" data-step="-1" aria-label="Eine Folge weniger" title="Eine Folge weniger"${count <= 1 ? ' disabled' : ''}>−</button>`
  + `<span class="ep-count" title="So viele Folgen markiert ✓ als gesehen">${count}</span>`
  + `<button type="button" data-step="1" aria-label="Eine Folge mehr" title="Eine Folge mehr"${count >= out - first + 1 ? ' disabled' : ''}>+</button></span>${check(m, first + count - 1, missing)}`;
const perEpisode = ({ m, first, out, nextAt, missing, links, progress }) => {
const eps = Array.from({ length: out - first + 1 }, (_, i) => first + i);
if (eps.length === 1) return grouped({ m, first, out, nextAt, missing, links, progress });
return `<div class="shared catchup-show" ${searchKey(...mediaTitles(m))}>
      <div class="row show-head" ${artStyle(m)}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}<div class="ep"><span class="catchup-count">${eps.length} offen</span> Folgen ${first}–${out}${nextHint(nextAt, out)}</div></div>
        <div class="links">${linkButtons(links, m.id)}</div>
        ${mine ? (local ? '' : dropButton(m.id)) + (selecting ? selector(m) : '') : ''}${planIn(m)}
      </div>${eps.map(ep => `
      <div class="row compact">
        <div class="time">Folge ${ep}</div>
        <div class="info"></div>
        ${mine ? (selecting ? '<div class="watch-space"></div>' : check(m, ep, missing)) : ''}
      </div>`).join('')}</div>`;
};
const paced = ({ m, first, out, progress, links }) => `
    <div class="row" ${artStyle(m)} ${searchKey(...mediaTitles(m))}>
      <div class="time"><span class="time-day">Folge</span> ${first}</div>
      <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
      <div class="info">${title(m)}
        <div class="ep">${progress} von ${m.episodes || out} gesehen</div>
      </div>
      <div class="links">${linkButtons(links, m.id)}</div>
      ${mine ? (local ? '' : dropButton(m.id)) + (selecting ? '<div class="watch-space"></div>' : out > first && (auth || local) ? stepper(m, first, out, false, 1) : check(m, first, false)) : ''}
    </div>`;
if (!canBulk || shown === 'pace') selecting = false;
const restore = preserveListPosition();
if (shown === 'pace') {
ownPace.sort(choices.sort === 'behind' ? (a, b) => (b.out - b.first) - (a.out - a.first)
: choices.sort === 'quick' ? (a, b) => (a.out - a.first) - (b.out - b.first) || byTitle(a, b)
: byTitle);
$('list').innerHTML = ownPace.length ? ownPace.map(paced).join('')
: '<div class="status">Keine älteren Serien offen auf der Watching-Liste.</div>';
} else {
$('markAllStart').hidden = !canBulk || !rows.length || selecting;
const top = !mine || !rows.length || !selecting ? ''
: `<div class="catchup-bar"><button id="cancelMark" class="pill">Abbrechen</button><button id="markAll" class="pill sure" title="Als gesehen markieren">${markAllLabel()}</button></div>`;
const show = single ? perEpisode : grouped;
const seasonGroups = catchupSeasonGroups(rows);
catchupSeasonTargets = new Map(seasonGroups.map(g => [g.key, seasonWatchTargets(g.rows)]));
const hideSeasonHeader = !showCatchupSeasonHeaders(seasonGroups);
const seasonBulkButton = group => seasonGroups.length > 1 && canBulk && !selecting && catchupSeasonTargets.get(group.key)?.length
 ? `<button type="button" class="pill catchup-season-mark" data-mark-season="${group.key}" title="Alle offenen Folgen dieser Season als gesehen markieren">Alle gesehen ✓</button>` : '';
const newestSeason = seasonGroups.find(g => g.key !== 'unknown')?.key || seasonGroups[0]?.key;
const seasonSection = group => {
 const entries = group.rows;
 const episodeCount = entries.reduce((sum, r) => sum + r.out - r.first + 1, 0);
 const seriesCount = new Set(entries.map(r => r.m.id)).size;
 const listed = entries.filter(r => !r.missing), notListed = entries.filter(r => r.missing);
 let unfolded = false, savedOpen = null;
 try {
  unfolded = localStorage.getItem('notListedOpen') === '1';
  savedOpen = localStorage.getItem('catchupSeasonOpen:' + group.key);
 } catch {}
 const open = selecting || searching() || (savedOpen === null ? group.key === newestSeason : savedOpen === '1');
 // Keep busy seasons immediately scannable: display eight shows first.
 // The remaining cards, their watch buttons and bulk targets stay in the DOM.
 const visible = listed.slice(0, 8), remaining = listed.slice(8);
 const listedHtml = visible.map(show).join('') +
  (remaining.length && !selecting ? `<details class="catchup-overflow" data-catchup-overflow="${group.key}"><summary>Weitere ${remaining.length} ${remaining.length === 1 ? 'Serie' : 'Serien'} anzeigen<i class="fold" aria-hidden="true"></i></summary>${remaining.map(show).join('')}</details>` : remaining.map(show).join(''));
 const content = listedHtml +
  (notListed.length ? `<details class="day not-listed"${unfolded || selecting || searching() ? ' open' : ''}><summary><h2 title="Noch nicht auf deiner ${listService()}-Liste">Nicht gelistet · ${notListed.length}<i class="fold" aria-hidden="true"></i></h2></summary>${notListed.map(show).join('')}</details>` : '');
 if (hideSeasonHeader) return `<section class="catchup-season-plain" aria-label="Aktuelle Season">${seasonBulkButton(group) ? `<div class="catchup-season-tools">${seasonBulkButton(group)}</div>` : ''}${content}</section>`;
 return `<details class="day catchup-season" data-catchup-season="${group.key}"${open ? ' open' : ''}>
   <summary><h2>${group.label}<i class="fold" aria-hidden="true"></i></h2><span class="catchup-season-count">${seriesCount} ${seriesCount === 1 ? 'Serie' : 'Serien'} · ${episodeCount} ${episodeCount === 1 ? 'Folge' : 'Folgen'}</span></summary>
   ${seasonBulkButton(group) ? `<div class="catchup-season-tools">${seasonBulkButton(group)}</div>` : ''}
   ${content}
  </details>`;
};
$('list').innerHTML = rows.length ? top + seasonGroups.map(seasonSection).join('')
: '<div class="status happy"><img src="icon-192.png" alt="">Alles aufgeholt.<button class="pill" data-back-to-week>Zum Zeitplan</button></div>';
$('list').querySelectorAll('.catchup-season').forEach(section => {
 section.addEventListener('toggle', () => {
  try { localStorage.setItem('catchupSeasonOpen:' + section.dataset.catchupSeason, section.open ? '1' : '0'); } catch {}
 });
});
$('list').querySelectorAll('.not-listed > summary').forEach(summary => summary.addEventListener('click', e => {
 try { localStorage.setItem('notListedOpen', e.currentTarget.parentElement.open ? '0' : '1'); } catch {}
}));
const unscored = mine ? toScore.filter(t => !knownEntries.get(t.media.id)?.score) : [];
if (unscored.length) $('list').insertAdjacentHTML('beforeend', `<section class="day toscore"><h2 title="Beendet, noch nicht bewertet">Bewerten</h2>${unscored.map(({ media: m, completed }) => `
      <div class="row" ${searchKey(...mediaTitles(m))}>
        <img src="${safeUrl(m.coverImage.medium)}" alt="" loading="lazy">
        <div class="info">${title(m)}
          <div class="ep">Abgeschlossen am ${completed.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </div>
        ${scoreButton(m.id)}
      </div>`).join('')}</section>`);
}
$('list').insertAdjacentHTML('afterbegin', notesHtml(['list:' + user.toLowerCase(), 'catchup:plan', 'catchup:missing', 'catchup:local']));
const listName = local ? person : friend ? friendList.selectedOptions[0].textContent : user;
const readOnly = friend && !local ? '<span class="catchup-count">Nur lesen</span>' : '';
if (shown === 'catchup') {
const fromPlan = rows.filter(row => row.missing).length;
const onList = rows.length - fromPlan;
$('list').insertAdjacentHTML('afterbegin', `<div class="catchup-summary${friend ? ' friend-summary' : ''}">
      <div class="friend-view"><strong>${esc(listName)}</strong>${readOnly}</div>
      <span>${openEpisodes} ${openEpisodes === 1 ? 'Folge' : 'Folgen'} offen${catchupTime()}${onList ? ` · ${onList} ${onList === 1 ? 'Serie' : 'Serien'}` : ''}${fromPlan ? ` · ${fromPlan} aus dem Guckplan` : ''}</span>
      ${friend ? '<button type="button" class="pill" data-own-list>Eigene Liste</button>' : movesKey && !local && rows.some(r => !r.missing) ? '<button type="button" class="pill" id="autoPlanOpen" title="Offene Folgen auf die restlichen Abende dieser Woche verteilen">Automatisch einplanen</button>' : ''}
    </div>`);
} else if (friend) {
$('list').insertAdjacentHTML('afterbegin', `<div class="friend-view"><strong>${esc(listName)}</strong>${readOnly}</div>`);
}
if (local) {
  $('list').insertAdjacentHTML('afterbegin', '<div class="notice">Lokaler Fortschritt für ' + esc(person) + ': nur auf diesem Gerät, nicht synchronisiert.</div>');
  $('list').insertAdjacentHTML('afterbegin', '<form id="localAnimeAdd" class="local-anime-add"><input type="search" name="anime" required maxlength="160" placeholder="Anime-Titel oder AniList-Link" aria-label="Anime zum lokalen Tracker hinzufügen"><button type="submit" class="pill">Hinzufügen</button></form>');
  $('list').insertAdjacentHTML('afterbegin', '<div class="local-export-entry"><button id="localExportOpen" type="button" class="pill" title="Lokale Liste als XML oder JSON exportieren">Exportieren</button></div>');
}
if (!friend && !mine && !auth && document.querySelector('#list .row')) $('list').insertAdjacentHTML('afterbegin', '<div class="notice">Zum Abhaken und Droppen: <button type="button" class="pill" data-connect>Konto verbinden</button></div>');
const times = [...document.querySelectorAll('.time')];
document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
applySearch();
syncSavingButtons();
restore();
resumeScroll();
if (revealMarkBar) { revealMarkBar = false; window.scrollTo({ top: 0 }); }
playEnter();
}
let planShowsCache = { key: '', time: 0, media: [] };
async function missingPlanShows(plan, entries, localMode = false) {
if (!plan || !soloPerson) return [];
const account = localMode ? null : auth, person = soloPerson;
const current = () => (!localMode ? auth === account : true) && soloPerson === person;
const listed = new Set(entries.map(e => e.media.id));
const ids = [];
for (const show of picks(plan, soloPerson).keys()) {
const id = Object.entries(streamsDe?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles))?.[0];
if (id && !listed.has(Number(id))) ids.push(Number(id));
}
if (!ids.length) return [];
const key = ids.join() + (account ? ':' + (account.provider || 'anilist') + ':' + account.name : ':local');
if (planShowsCache.key !== key || Date.now() - planShowsCache.time > LIST_CACHE_MS) {
const query = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
      id status episodes duration siteUrl synonyms title { romaji english } coverImage { medium }
      externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day } ${account ? 'mediaListEntry { progress status }' : ''}
    } } }`;
try {
let data;
if (account?.provider === 'mal') {
data = await anilist(query.replace('mediaListEntry { progress status }', 'idMal'), { ids });
for (const m of data.Page.media) { if (!current()) return []; MAL.rememberMedia(m); m.mediaListEntry = await MAL.entry(account, m.id); }
} else data = account ? await anilistAsMe(query, { ids }, account) : await anilist(query, { ids });
if (!current()) return [];
planShowsCache = { key, time: Date.now(), media: data.Page.media };
setNote('catchup:missing', null);
} catch {
if (!current()) return [];
setNote('catchup:missing', `${unreachable('AniList')}: geplante Serien, die nicht auf der AniList-Liste sind, konnten nicht geprüft werden.`);
return [];
}
}
if (!current()) return [];
if (account) for (const m of planShowsCache.media) {
if (m.mediaListEntry) knownEntries.set(m.id, { progress: m.mediaListEntry.progress, status: m.mediaListEntry.status });
else notOnList.add(m.id);
}
return planShowsCache.media
.filter(m => !account || !['COMPLETED', 'DROPPED'].includes(m.mediaListEntry?.status))
.map(m => ({ progress: m.mediaListEntry?.progress || 0, media: m, missing: true }));
}
