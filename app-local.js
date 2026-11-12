// Main page, part 2: the local list (progress kept in this browser, export and restore).
const isLocalList = () => friendList.value.startsWith('local:');
const localListPerson = () => isLocalList() ? friendList.value.slice(6) : '';
const localProgressKey = person => 'localAnimeProgress:v1:' + person;
const MAX_LOCAL_SHOWS = 500;
const localShowsKey = person => 'localAnimeShows:v1:' + person;
const localExportSeen = new Map();
let pendingLocalRestore = null;
function resetLocalRestore() {
  pendingLocalRestore = null;
  $('localImportPreview').hidden = true;
  $('localImportDetails').textContent = '';
  $('localImportFile').value = '';
}
$('localImportOpen').onclick = () => $('localImportFile').click();
$('localImportCancel').onclick = () => { resetLocalRestore(); $('localExportStatus').textContent = ''; };
$('localExportDialog').addEventListener('close', resetLocalRestore);
$('localImportFile').addEventListener('change', async () => {
  resetLocalRestorePending();
  const file = $('localImportFile').files?.[0];
  const person = $('localExportDialog').dataset.person;
  if (!file || !person) return;
  if (file.size > 2 * 1024 * 1024) {
    $('localExportStatus').textContent = 'Die Datei ist zu groß (maximal 2 MB).';
    return;
  }
  try {
    const { parseLocalBackup, mergeLocalBackup } = await import('./local-export.mjs');
    const parsed = parseLocalBackup(await file.text());
    const current = localSnapshot(person);
    const merged = mergeLocalBackup(current, parsed, person);
    pendingLocalRestore = { person, parsed };
    $('localImportDetails').textContent =
      'Backup für ' + person + ': ' + merged.addedShows + ' neue Serien, ' +
      merged.addedProgress + ' neue Episodenstände, ' +
      merged.advancedProgress + ' aktualisierte Episodenstände. ' +
      'Vorhandene höhere Episodenstände bleiben unverändert.';
    $('localImportPreview').hidden = false;
    $('localExportStatus').textContent = 'Vorschau prüfen und Zusammenführen bestätigen.';
  } catch (error) {
    $('localExportStatus').textContent = 'Backup nicht eingelesen: ' + error.message;
  }
});
function resetLocalRestorePending() {
  pendingLocalRestore = null;
  $('localImportPreview').hidden = true;
  $('localImportDetails').textContent = '';
}
$('localImportConfirm').onclick = async () => {
  const pending = pendingLocalRestore;
  if (!pending || $('localExportDialog').dataset.person !== pending.person ||
      !isLocalList() || localListPerson() !== pending.person) {
    $('localExportStatus').textContent = 'Bitte die lokale Liste erneut auswählen.';
    resetLocalRestore();
    return;
  }
  const button = $('localImportConfirm');
  button.disabled = true;
  try {
    const { mergeLocalBackup } = await import('./local-export.mjs');
    // Re-read current values at confirmation to avoid regressing edits made
    // while the preview was open.
    const result = mergeLocalBackup(localSnapshot(pending.person), pending.parsed, pending.person);
    const keyShows = localShowsKey(pending.person), keyProgress = localProgressKey(pending.person);
    const beforeShows = localStorage.getItem(keyShows), beforeProgress = localStorage.getItem(keyProgress);
    try {
      localStorage.setItem(keyShows, JSON.stringify(result.shows));
      localStorage.setItem(keyProgress, JSON.stringify(result.progress));
    } catch (error) {
      try {
        if (beforeShows === null) localStorage.removeItem(keyShows);
        else localStorage.setItem(keyShows, beforeShows);
        if (beforeProgress === null) localStorage.removeItem(keyProgress);
        else localStorage.setItem(keyProgress, beforeProgress);
      } catch {}
      throw error;
    }
    resetLocalRestore();
    $('localExportStatus').textContent = 'Backup für ' + pending.person +
      ' zusammengeführt. Vorhandene Fortschritte bleiben erhalten.';
    if (isLocalList() && localListPerson() === pending.person && listView()) load(true);
  } catch (error) {
    $('localExportStatus').textContent = 'Import fehlgeschlagen: ' + error.message;
  } finally { button.disabled = false; }
};

function localSnapshot(person) {
  let progress = {};
  try {
    const saved = JSON.parse(localStorage.getItem(localProgressKey(person)) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) progress = saved;
  } catch {}
  return { person, progress, showIds: localShows(person), cachedMedia: [...(localExportSeen.get(person)?.values() || [])] };
}
async function localExportCatalog(snapshot) {
  const ids = [...new Set([...snapshot.showIds, ...Object.keys(snapshot.progress).map(Number),
    ...snapshot.cachedMedia.map(m => Number(m.id))].filter(id => Number.isSafeInteger(id) && id > 0))];
  const result = [];
  const query = 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id idMal episodes format title { romaji english } } } }';
  for (let i = 0; i < ids.length; i += 50) {
    const data = await anilist(query, {ids: ids.slice(i, i + 50)});
    result.push(...(data.Page?.media || []));
  }
  return result;
}
function downloadLocalFile(filename, contents, type) {
  const file = new Blob([contents], { type });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function localExportFileName(person, ext) {
  return 'anime-schedule-' + person.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '.' + ext;
}
$('list').addEventListener('click', event => {
  if (!event.target.closest('#localExportOpen') || !isLocalList()) return;
  const person = localListPerson();
  $('localExportDialog').dataset.person = person;
  $('localExportPerson').textContent = person + ' · Nur Daten aus diesem Browser';
  resetLocalRestore();
  $('localExportStatus').textContent = '';
  $('localExportDialog').showModal();
});
$('localExportBackup').onclick = async () => {
  const person = $('localExportDialog').dataset.person;
  if (!person) return;
  const { localBackup, exportRows } = await import('./local-export.mjs');
  const snapshot = localSnapshot(person);
  const rows = exportRows(snapshot.cachedMedia, snapshot.progress);
  const content = JSON.stringify(localBackup(person, snapshot.showIds, snapshot.progress, rows), null, 2);
  downloadLocalFile(localExportFileName(person, 'json'), content, 'application/json;charset=utf-8');
  $('localExportStatus').textContent = 'Backup gespeichert. Bitte die Datei sicher aufbewahren.';
};
$('localExportXml').onclick = async () => {
  const person = $('localExportDialog').dataset.person;
  if (!person) return;
  const button = $('localExportXml');
  button.disabled = true;
  $('localExportStatus').textContent = 'Anime-Daten für den Export werden geladen …';
  try {
    const { exportRows, malImportXml, malImportInfo } = await import('./local-export.mjs');
    const snapshot = localSnapshot(person);
    const metadata = await localExportCatalog(snapshot);
    const rows = exportRows(metadata, snapshot.progress);
    const info = malImportInfo(rows);
    if (!info.exported) {
      $('localExportStatus').textContent = 'Keine Anime mit MyAnimeList-ID gefunden. Das JSON-Backup ist weiterhin möglich.';
      return;
    }
    downloadLocalFile(localExportFileName(person, 'xml'), malImportXml(rows, person), 'application/xml;charset=utf-8');
    $('localExportStatus').textContent = info.exported + ' Anime exportiert.' +
      (info.omitted ? ' ' + info.omitted + ' ohne MAL-ID ausgelassen (im JSON-Backup behalten).' : '') +
      ' Vor dem Import bestehende Einträge prüfen.';
  } catch (error) {
    $('localExportStatus').textContent = 'XML-Export nicht verfügbar: ' + error.message + '. JSON-Backup bleibt möglich.';
  } finally { button.disabled = false; }
};

function localShows(person) {
  try {
    const ids = JSON.parse(localStorage.getItem(localShowsKey(person)) || '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, MAX_LOCAL_SHOWS) : [];
  } catch { return []; }
}
function addLocalShow(person, id) {
  if (!person || !Number.isSafeInteger(id) || id < 1) return false;
  try {
    const ids = localShows(person);
    if (!ids.includes(id)) ids.push(id);
    if (ids.length > MAX_LOCAL_SHOWS) return false;
    localStorage.setItem(localShowsKey(person), JSON.stringify(ids));
    return true;
  } catch { return false; }
}
async function localCatalog(person) {
  const ids = localShows(person);
  if (!ids.length) return [];
  const query = 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id status episodes duration siteUrl synonyms title { romaji english } coverImage { medium } externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day } } } }';
  const media = [];
  // AniList's Page only returns up to 50 entries: load larger local lists in batches.
  for (let i = 0; i < ids.length; i += 50) {
    const data = await anilist(query, { ids: ids.slice(i, i + 50) });
    media.push(...(data.Page?.media || []));
  }
  return media.filter(m => Number.isSafeInteger(Number(m.id)));
}
$('list').addEventListener('submit', async e => {
  const form = e.target.closest('#localAnimeAdd');
  if (!form || !isLocalList()) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const name = input.value.trim();
  if (!name) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const match = name.match(/(?:^|\/anime\/)([0-9]+)(?:\/|$)/);
    const data = await anilist('query ($search: String, $id: Int) { Media(search: $search, id: $id, type: ANIME) { id } }', {
      ...(match ? { id:Number(match[1]) } : {search:name})
    });
    const id = Number(data.Media?.id);
    if (!addLocalShow(localListPerson(), id)) throw new Error('Serie konnte nicht gespeichert werden.');
    load(true);
  } catch (error) { notice('Serie nicht gefunden: ' + error.message); }
  finally { button.disabled = false; }
});
function localProgress(person, id) {
  try {
    const saved = JSON.parse(localStorage.getItem(localProgressKey(person)) || '{}');
    const progress = Number(saved[String(id)]);
    return Number.isSafeInteger(progress) && progress >= 0 ? progress : 0;
  } catch { return 0; }
}
function saveLocalProgress(person, id, progress) {
  if (!person || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(progress) || progress < 0) return false;
  try {
    const key = localProgressKey(person);
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    saved[String(id)] = progress;
    localStorage.setItem(key, JSON.stringify(saved));
    return true;
  } catch { return false; }
}
function localWatchButton(id, episode) {
  return '<button type="button" class="watch" data-local-watch="' + id + '" data-local-episode="' + episode + '" title="Bis Folge ' + episode + ' lokal als gesehen markieren" aria-label="Bis Folge ' + episode + ' lokal als gesehen markieren">✓</button>';
}
$('list').addEventListener('click', e => {
  const button = e.target.closest('[data-local-watch]');
  if (!button || !isLocalList() || !listView()) return;
  e.stopImmediatePropagation();
  const person = localListPerson(), id = Number(button.dataset.localWatch), episode = Number(button.dataset.localEpisode);
  if (!saveLocalProgress(person, id, episode)) { notice('Fortschritt konnte im Browser nicht gespeichert werden.'); return; }
  load(true);
});
function syncListToSolo() {
  const person = soloPerson;
  const accounts = listProfiles.get(person) || [];
  const own = auth && (ownPerson() === person || accounts.some(a => auth?.name && a.name.toLowerCase() === auth.name.toLowerCase()));
  if (own) {
    friendList.value = '';
    $('anilistUser').value = auth.name;
  } else if (accounts.length) {
    const option = [...friendList.options].find(o => o.dataset.person === person && o.value === accounts[0].name);
    friendList.value = option?.value || '';
    if (!option) $('anilistUser').value = accounts[0].name;
  } else {
    const option = [...friendList.options].find(o => o.value === 'local:' + person);
    friendList.value = option?.value || '';
  }
}
function updateLocalListOptions() {
  for (const option of [...friendList.options])
    if (option.value.startsWith('local:') && (listProfiles.has(option.dataset.person) || !localPlanPeople.includes(option.dataset.person))) option.remove();
  for (const person of localPlanPeople) {
    if (listProfiles.has(person) || [...friendList.options].some(o => o.value === 'local:' + person)) continue;
    const option = new Option(person + ' · Lokal', 'local:' + person);
    option.dataset.person = person;
    friendList.add(option);
  }
  syncListToSolo();
}

function updateFriendOptions() {
const ownName = auth?.provider !== 'mal' ? auth?.name?.toLowerCase() : null;
for (const option of friendList.options) {
option.hidden = option.disabled = option.value.toLowerCase() === ownName;
if (option.hidden && option.selected) friendList.value = '';
}
}
fetch('wrapped-profiles.json').then(r => r.ok ? r.json() : {}).then(profiles => {
profileList = profiles && typeof profiles === 'object' ? profiles : {};
if (lastWeekRender && view === 'week') redraw();   // ✓ follows the account's person (accountPerson)
for (const [person, accounts] of Object.entries(profiles)) {
const ani = accounts.filter(account => account.provider === 'anilist');
if (ani.length) listProfiles.set(person, ani);
for (const { name } of ani) {
const option = new Option(ani.length > 1 ? `${person} · ${name}` : person, name);
option.dataset.person = person;
friendList.add(option);
}
}
updateFriendOptions();
updateLocalListOptions();
refreshPaceNav();
if (listView()) load(true);
}).catch(() => {});
