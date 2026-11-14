// Main page, part 3: AniList/MAL lists and accounts, the menus, theme, accent and settings.
async function anilistList(user, fresh = false, publicOnly = false) {
if (!publicOnly && auth?.provider === 'mal' && user.toLowerCase() === auth.name.toLowerCase()) {
const result = await MAL.list(auth, fresh);
if (fresh && result.stale) throw new Error('MyAnimeList ist gerade nicht erreichbar; die gespeicherte Liste bleibt erhalten.');
setNote('list:' + user.toLowerCase(), result.stale ? `MyAnimeList antwortet nicht: Liste vom ${savedAt(result.stale)}.` : null);
return result.entries.filter(e => ['CURRENT', 'REPEATING'].includes(e.status));
}
const key = 'list:' + user.toLowerCase();
let saved = null;
try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
if (!fresh && Array.isArray(saved?.entries) && Number.isFinite(saved.time) && Date.now() - saved.time >= 0 && Date.now() - saved.time < LIST_CACHE_MS) {
  setNote(key, null);
  return fixTitles(saved.entries);
}
try {
const entries = (await anilist(LIST_QUERY, { user })).MediaListCollection.lists.flatMap(l => l.entries);
try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), entries })); } catch {}
setNote(key, null);
return entries;
} catch (e) {
if (fresh || !Array.isArray(saved?.entries)) throw e;
setNote(key, `${unreachable('AniList')}: Liste von ${user} vom ${savedAt(saved.time)}.`);
return fixTitles(saved.entries);
}
}
$('refreshCatchup').onclick = async () => {
const button = $('refreshCatchup');
if (button.disabled || !listView()) return;
const user = listUser(), friend = friendList.value, account = auth, selectedView = view;
if (!user) return;
if (isLocalList()) { await loadCatchup(true); return; }
const stillSelected = () => auth === account && view === selectedView &&
  listView() && listUser() === user && friendList.value === friend;
button.disabled = true;
button.setAttribute('aria-busy', 'true');
button.textContent = 'Lädt…';
try {
await anilistList(user, true, !!friend);
if (!stillSelected()) return;
planShowsCache.time = 0;
if (!friend && account && account.name.toLowerCase() === user.toLowerCase()) {
  await loadMe();
  if (!stillSelected()) return;
}
await loadCatchup(true);
if (stillSelected()) notice('Liste aktualisiert.');
} catch (error) {
if (stillSelected()) notice('Liste konnte nicht aktualisiert werden: ' + error.message);
} finally {
button.disabled = false;
button.removeAttribute('aria-busy');
button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
};
async function anilistAsMe(query, variables = {}, account = auth) {
if (!account || account.provider === 'mal') throw new Error('Dafür brauchst du ein AniList-Konto.');
try {
return await anilist(query, variables, account.token);
} catch (e) {
if (e.status === 401 && auth === account) disconnect();
throw e;
}
}
let accountCheckRun = 0;
async function checkListConnection() {
  const run = ++accountCheckRun, account = auth;
  const results = $('accountCheckResults'), retry = $('accountCheckRetry');
  const current = () => run === accountCheckRun && $('accountCheckDlg').open && auth === account;
  const add = message => {
    const row = document.createElement('li');
    row.textContent = message;
    results.append(row);
    return row;
  };
  results.replaceChildren();
  retry.disabled = false;
  if (!account?.token || !account.name) {
    add('Kein Listen-Konto verbunden. Verbinde AniList oder MyAnimeList im Kontomenü.');
    return;
  }
  retry.disabled = true;
  const service = listService();
  const login = add(service + ': Anmeldung wird geprüft …');
  try {
    const profile = account.provider === 'mal'
      ? await MAL.profile(account)
      : (await anilist('query { Viewer { id name } }', {}, account.token, { retries: 0 })).Viewer;
    if (!current()) return;
    if (profile?.name?.toLowerCase() !== account.name.toLowerCase()) {
      login.textContent = service + ': Konto stimmt nicht überein. Bitte neu verbinden.';
      return;
    }
    login.textContent = service + ': Anmeldung gültig (' + profile.name + ').';
    await accountProfilesReady;
    if (!current()) return;
    const person = accountPerson();
    add(person ? 'Guckplan: Zuordnung zu ' + person + '.' :
      'Guckplan: Keine feste Personenzuordnung. Prüfe „Wer ist wer“ in Anime Wrapped.');
    const list = add('Listenzugriff wird geprüft …');
    try {
      if (account.provider === 'mal') {
        if (!await MAL.probeList(account)) throw Error('Missing list');
      } else {
        const data = await anilist(
          'query ($id: Int) { Page(perPage: 1) { mediaList(userId: $id, type: ANIME) { id } } }',
          { id: profile.id }, account.token, { retries: 0 });
        if (!Array.isArray(data?.Page?.mediaList)) throw Error('Missing list');
      }
      if (current()) list.textContent = 'Listenzugriff: Lesen funktioniert.';
    } catch {
      if (current()) list.textContent = 'Listenzugriff: Die aktuelle Liste konnte nicht gelesen werden. Versuche es erneut.';
    }
  } catch (error) {
    if (current()) login.textContent = error.status === 401 || error.status === 403
      ? service + ': Anmeldung ungültig. Bitte neu verbinden.'
      : service + ': Anmeldung konnte gerade nicht geprüft werden. Versuche es erneut.';
  } finally {
    if (run === accountCheckRun) retry.disabled = false;
  }
}
function disconnect() {
if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
if (auth?.provider === 'mal') MAL.logout(auth).catch(() => {});
accounts = accounts.filter(a => a !== auth);
useAccount(accounts[0] || null);
}
function useAccount(account) {
if (pendingChanges.size || bulkSaving || undoing) { notice('Bitte warte, bis die aktuelle Listenänderung fertig ist.'); return; }
auth = account;
myProgress.clear();
$('catchupCount').hidden = true; $('catchupCount').textContent = ''; catchupMinutes = 0;
knownEntries.clear(); notOnList.clear(); toScore = []; planShowsCache.time = 0; selecting = false; $('markAllStart').hidden = true;
saveAccounts();
if (auth?.name) {
$('anilistUser').value = auth.name;
try { localStorage.setItem('anilistUser', auth.name); } catch {}
}
updateConnect();
if (auth) {
const loadingFor = auth;
accountLoading = true; syncSavingButtons();
loadMe().catch(e => { if (auth === loadingFor) notice(e.message); }).finally(() => { if (auth !== loadingFor) return; accountLoading = false; syncSavingButtons(); load(true); });
}
else { accountLoading = false; syncSavingButtons(); load(true); }
}
addEventListener('mal-session-renewed', () => { saveAccounts(); updateConnect(); });
const connect = () => {
location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
};
function avatarOf(account, className) {
const span = document.createElement('span');
if (className) span.className = className;
span.textContent = (account?.name || '?').trim().charAt(0).toUpperCase();
if (!account?.avatar) return span;
const img = document.createElement('img');
img.src = safeUrl(account.avatar).replace(/&amp;/g, '&');
img.alt = '';
if (className) img.className = className;
img.onerror = () => img.replaceWith(span);
return img;
}
const LOGIN_SOON_MS = 7 * 86400000;
const loginEnds = account => account?.expires ? new Date(account.expires) : null;
const loginEndingSoon = account => !!account?.expires && account.expires - Date.now() < LOGIN_SOON_MS;
const loginDate = date => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) }).format(date);
const PERSON_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
function updateConnect() {
updateFriendOptions();
const button = $('accountButton');
button.classList.toggle('empty', !auth);
if (auth) button.replaceChildren(avatarOf(auth));
else button.innerHTML = PERSON_ICON;
button.classList.toggle('expiring', loginEndingSoon(auth));
button.title = auth?.name ? `${listService()}: ${auth.name}${loginEndingSoon(auth) ? ' · Login läuft bald ab' : ''}` : 'Listen-Konten';
button.setAttribute('aria-label', 'Listen-Konten');
$('anilistUser').readOnly = auth?.provider === 'mal';
$('anilistUser').placeholder = auth?.provider === 'mal' ? 'MyAnimeList-Konto' : 'AniList-Name';
const item = (text, onclick, { account = null, muted = false, current = false, label = null } = {}) => {
const b = document.createElement('button');
b.className = (muted ? 'muted' : '') + (current ? ' current' : '');
if (account) {
b.classList.add('account-choice');
b.setAttribute('aria-pressed', String(current));
const provider = account.provider === 'mal' ? 'MAL' : 'AniList';
const name = document.createElement('span'); name.className = 'account-name'; name.textContent = account.name || 'Konto';
const badge = document.createElement('span'); badge.className = 'provider-badge'; badge.textContent = provider;
b.append(avatarOf(account, 'avatar'), name, badge);
b.title = `${provider}: ${account.name || 'Konto'}${loginEnds(account) ? ` · Login bis ${loginDate(loginEnds(account))}` : ''}`;
b.setAttribute('aria-label', b.title);
} else b.append(text);
if (label) { b.setAttribute('aria-label', label); b.title = label; }
b.onclick = onclick;
return b;
};
const row = (...pills) => {
const div = document.createElement('div');
div.className = 'pill-row';
div.append(...pills);
return div;
};
$('accountSection').replaceChildren(
...accounts.map(a => item(`${a.provider === 'mal' ? 'MAL' : 'AniList'} · ${a.name || 'Konto'}`, () => a !== auth && useAccount(a), { account: a, current: a === auth })),
row(item('+ AniList', connect, { muted: true, label:'AniList verbinden' }), item('+ MAL', MAL.connect, { muted: true, label:'MyAnimeList verbinden' })),
...(auth ? [row(item('Abmelden', disconnect, { muted: true }))] : []),
...accounts.filter(loginEndingSoon).map(a => {
const line = document.createElement('div');
line.className = 'login-ending';
const text = document.createElement('span');
text.textContent = `${accounts.length > 1 ? `${a.name || 'Konto'}: ` : ''}Login bis ${loginDate(loginEnds(a))}`;
line.append(text, item('Erneuern', a.provider === 'mal' ? MAL.connect : connect, { muted: true, label: `${a.provider === 'mal' ? 'MyAnimeList' : 'AniList'}-Login von ${a.name || 'Konto'} erneuern` }));
return line;
}),
);
updateSyncControls();
}
function showMenu(menu, button, open) {
if (open) {
for (const [other, trigger] of [['miscMenu', 'miscButton'], ['settingsMenu', 'settingsButton'], ['accountMenu', 'accountButton'], ['people', 'groupButton']]) {
if (other === menu) continue;
$(other).hidden = true;
$(trigger).setAttribute('aria-expanded', 'false');
}
}
$(menu).hidden = !open;
$(button).setAttribute('aria-expanded', open);
}
const showSettings = open => showMenu('settingsMenu', 'settingsButton', open);
// "N Funktionen" in the "Mehr" menu: counted from site-features.js, a click shows the whole list
const featureCount = $('siteFeatureCount');
const featureTotal = SITE_FEATURES.reduce((n, [, items]) => n + items.length, 0);
featureCount.textContent = featureTotal + ' Funktionen · alle ansehen';
featureCount.hidden = false;
const plannedTotal = SITE_PLANNED.reduce((n, [, items]) => n + items.length, 0);
$('featuresTabNow').textContent = `Vorhanden · ${featureTotal}`;
$('featuresTabPlanned').textContent = `Geplant · ${plannedTotal}`;
// "Vorhanden": everything live; "Geplant": approved features and updates still to come
function drawFeatures(planned) {
  const list = planned ? SITE_PLANNED : SITE_FEATURES;
  $('featuresTabNow').setAttribute('aria-selected', !planned);
  $('featuresTabPlanned').setAttribute('aria-selected', planned);
  $('featuresIntro').textContent = planned ? `${plannedTotal} Funktionen und Updates sind beschlossen und kommen als Nächstes.`
    : `${featureTotal} Funktionen in ${SITE_FEATURES.length} Bereichen.`;
  $('featuresList').innerHTML = list.map(([area, items]) => `<section><h3>${esc(area)} <span>${items.length}</span></h3><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('');
  $('featuresDlg').scrollTop = 0;
}
$('featuresTabNow').onclick = () => drawFeatures(false);
$('featuresTabPlanned').onclick = () => drawFeatures(true);
featureCount.onclick = () => { drawFeatures(false); $('featuresDlg').showModal(); $('featuresDlg').scrollTop = 0; };

$('miscButton').onclick = () => showMenu('miscMenu','miscButton',$('miscMenu').hidden);
$('miscMenu').addEventListener('click',e=>{ if(e.target.closest('a,button')) showMenu('miscMenu','miscButton',false); });
$('settingsButton').onclick = () => showSettings($('settingsMenu').hidden);
$('accountButton').onclick = () => showMenu('accountMenu', 'accountButton', $('accountMenu').hidden);
$('list').addEventListener('click', e => {
if (!e.target.closest('[data-connect]')) return;
e.stopPropagation();
scrollTo({ top: 0 });
showMenu('accountMenu', 'accountButton', true);
});
document.addEventListener('click', e => {
if (!e.target.closest('#miscMenu, #miscButton')) showMenu('miscMenu','miscButton',false);
if (!e.target.closest('#settingsMenu, #settingsButton')) showSettings(false);
if (!e.target.closest('#accountMenu, #accountButton')) showMenu('accountMenu', 'accountButton', false);
});
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let theme = 'auto';
function setTheme(choice) {
theme = choice === 'light' || choice === 'dark' ? choice : 'auto';
if (theme === 'auto') delete document.documentElement.dataset.theme;
else document.documentElement.dataset.theme = theme;
const dark = theme === 'dark' || (theme === 'auto' && systemDark.matches);
document.documentElement.toggleAttribute('data-dark', dark);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121216' : '#f6f6f8');
try { localStorage.setItem('theme', theme); } catch {}
for (const b of document.querySelectorAll('[data-theme-choice]')) b.setAttribute('aria-pressed', b.dataset.themeChoice === theme);
}
try { theme = localStorage.getItem('theme') || 'auto'; } catch {}
setTheme(theme);
systemDark.addEventListener('change', () => setTheme(theme));
for (const b of document.querySelectorAll('[data-theme-choice]')) b.onclick = () => setTheme(b.dataset.themeChoice);
const choices = { time: 'release', sort: 'oldest', accent: 'person', density: 'comfortable', textsize: 'normal', contrast: 'normal' };
const CHOICE_OK = {
time: v => ['release', 'watch', 'both'].includes(v),
sort: v => ['oldest', 'behind', 'quick', 'next', 'az'].includes(v),
accent: v => v === 'person' || /^#[0-9a-f]{6}$/i.test(v),
density: v => ['comfortable', 'compact', 'text'].includes(v),
textsize: v => ['normal', 'large', 'xl'].includes(v),
contrast: v => ['normal', 'high'].includes(v),
};
for (const name of Object.keys(choices))
try { const v = localStorage.getItem(name); if (CHOICE_OK[name](v)) choices[name] = v; } catch {}
function setChoice(name, value) {
choices[name] = value;
for (const b of document.querySelectorAll(`[data-set="${name}"]`))
b.setAttribute('aria-pressed', b.dataset.value === value);
try { localStorage.setItem(name, value); } catch {}
if (name === 'accent') applyAccent();
// N85 Lesbarkeit: text size and contrast, also read by tool-theme.js on the other pages
if (name === 'textsize') value === 'normal' ? delete document.documentElement.dataset.textsize : document.documentElement.dataset.textsize = value;
if (name === 'contrast') value === 'high' ? document.documentElement.dataset.contrast = 'high' : delete document.documentElement.dataset.contrast;
if (name === 'density') { document.body.classList.toggle('dense', value === 'compact' || value === 'text'); document.body.classList.toggle('text-only', value === 'text'); }
}
function applyAccent() {
const root = document.documentElement.style;
const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
const known = choices.accent === 'person' ? hex(personColor.get(soloPerson)) : hex(choices.accent);
let last = null;
try { if (known) localStorage.setItem('accentNow', known); else last = hex(localStorage.getItem('accentNow')); } catch {}
const c = known || last || '#f47521';
const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
root.setProperty('--accent', c);
root.setProperty('--accent-text', accentText(r, g, b));
root.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
}
for (const name of Object.keys(choices)) setChoice(name, choices[name]);
for (const b of document.querySelectorAll('[data-set]'))
b.onclick = () => {
setChoice(b.dataset.set, b.dataset.value);
if (b.dataset.set === 'time') redraw();
else if (!['accent', 'density', 'textsize', 'contrast'].includes(b.dataset.set)) load(true);
};
for (const [id, cls] of [['dropButtons', 'no-drop'], ['moveButtons', 'no-move']]) {
try { $(id).checked = id === 'moveButtons' ? localStorage.getItem(id) === '1' : localStorage.getItem(id) !== '0'; } catch { $(id).checked = id !== 'moveButtons'; }
document.body.classList.toggle(cls, !$(id).checked);
$(id).onchange = () => {
try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch {}
document.body.classList.toggle(cls, !$(id).checked);
if (id === 'moveButtons') syncMoveEditor();
};
}
// Settings export/import: only display choices travel, never logins, the GitHub key or cached data.
const EXPORTED_SETTINGS = ['theme', 'accent', 'accentNow', 'time', 'sort', 'density', 'textsize', 'contrast', 'servicePriority', 'view', 'mode', 'soloPerson', 'ownPerson', 'people',
  'who', 'behind', 'hideWatched', 'hideEmptyDays', 'markOnOpen', 'dropButtons', 'moveButtons', 'singleEpisodes', 'primeChoices', 'fallbackSources', 'covers',
  'notListedOpen', 'listProvider', 'anilistUser', 'recentSearches'];
{
  const select = $('servicePriority');
  select.replaceChildren(...SERVICES.filter(sv => sv.main).map(sv => new Option(sv.label, sv.label)));
  select.value = preferredService();
  select.onchange = () => { try { localStorage.setItem('servicePriority', select.value); } catch {} load(true); };
}
$('settingsExport').onclick = () => {
  const settings = {};
  for (const key of EXPORTED_SETTINGS) { try { const v = localStorage.getItem(key); if (v != null) settings[key] = v; } catch {} }
  const blob = new Blob([JSON.stringify({ app: 'anime-schedule', version: 1, exported: new Date().toISOString(), settings }, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'anime-schedule-einstellungen.json' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  notice('Einstellungen exportiert.');
};
$('settingsImport').onclick = () => $('settingsFile').click();
$('settingsFile').onchange = async () => {
  const file = $('settingsFile').files[0];
  $('settingsFile').value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'anime-schedule' || typeof data.settings !== 'object') throw new Error('keine Einstellungsdatei');
    const take = Object.entries(data.settings).filter(([k, v]) => EXPORTED_SETTINGS.includes(k) && typeof v === 'string' && v.length < 4000);
    if (!take.length) throw new Error('nichts zu übernehmen');
    for (const [k, v] of take) localStorage.setItem(k, v);
    notice(`${take.length} Einstellungen übernommen. Die Seite lädt neu …`);
    setTimeout(() => location.reload(), 900);
  } catch (e) { notice(`Import fehlgeschlagen: ${e.message}.`); }
};
$('list').addEventListener('click', e => {
  const button = e.target.closest('[data-pause-shift]');
  if (!button) return;
  const date = button.dataset.pauseShift;
  try { localStorage.setItem('pauseShift:' + date, pauseShiftEnabled(date) ? '0' : '1'); } catch {}
  load(true);
});
let editScope = 'week';
for (const b of document.querySelectorAll('[data-edit-scope]')) b.onclick = () => {
editScope = b.dataset.editScope;
for (const x of document.querySelectorAll('[data-edit-scope]')) x.setAttribute('aria-pressed', String(x === b));
};
function syncMoveEditor() {
$('editSchedule').hidden = $('moveToggle').hidden;
const on = $('moveButtons').checked;
$('editScope').hidden = $('editSchedule').hidden || !on;
$('editSchedule').textContent = 'Edit';
$('editSchedule').setAttribute('aria-pressed', String(on));
}
$('editSchedule').onclick = () => {
$('moveButtons').checked = !$('moveButtons').checked;
$('moveButtons').dispatchEvent(new Event('change'));
};
// U43 Gesehene ausblenden (own Solo view) and U53 Leere Tage ausblenden: body classes, the CSS hides the rows / days
for (const [id, cls] of [['hideWatched', 'hide-watched'], ['hideEmptyDays', 'hide-empty-days']]) {
  try { $(id).checked = localStorage.getItem(id) === '1'; } catch {}
  document.body.classList.toggle(cls, $(id).checked);
  $(id).onchange = () => { try { localStorage.setItem(id, $(id).checked ? '1' : '0'); } catch {} document.body.classList.toggle(cls, $(id).checked); };
}
try { $('behind').checked = localStorage.getItem('behind') === '1'; } catch {}
$('behind').onchange = () => {
try { localStorage.setItem('behind', $('behind').checked ? '1' : '0'); } catch {}
redraw();
};
function behindTag(m, episode) {
if (!auth || !$('behind').checked || !myProgress.has(m.id)) return '';
const n = episode - 1 - myProgress.get(m.id);
return n > 0 ? `<button class="behind" data-behind="${esc(m.title.english || m.title.romaji)}" title="${n === 1 ? 'Eine frühere Folge' : `${n} frühere Folgen`} noch nicht gesehen: im Catch-up zeigen">${n} behind</button>` : '';
}
$('list').addEventListener('click', e => {
const b = e.target.closest('.behind[data-behind]');
if (!b) return;
$('search').value = jumpSearch = b.dataset.behind;
openSearch(true);
$('viewCatchup').click();
});
try { $('who').checked = localStorage.getItem('who') !== '0'; } catch { $('who').checked = true; }
$('who').onchange = () => {
try { localStorage.setItem('who', $('who').checked ? '1' : '0'); } catch {}
redraw();
};
const hiddenAnchorSelector = '.hidden-by-search, [hidden], details:not([open])';
function scrollAnchor() {
const below = document.querySelector('header').getBoundingClientRect().bottom;
const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest(hiddenAnchorSelector) && r.getBoundingClientRect().bottom > below);
return { y: scrollY, candidates: rows.map(row => ({
key: row.closest('[data-search]')?.dataset.search,
day: row.closest('.day')?.dataset.date,
episode: row.querySelector('.time')?.textContent,
top: row.getBoundingClientRect().top,
})).filter(r => r.key) };
}
function restoreAnchor(a) {
const rows = [...document.querySelectorAll('#list .row')].filter(r => !r.closest(hiddenAnchorSelector));
for (const saved of a.candidates || []) {
const row = rows.find(r => r.closest('[data-search]')?.dataset.search === saved.key
&& r.closest('.day')?.dataset.date === saved.day
&& (saved.day || r.querySelector('.time')?.textContent === saved.episode));
if (row) { scrollBy(0, row.getBoundingClientRect().top - saved.top); return; }
}
scrollTo(0, a.y);
}
function preserveListPosition() {
const anchor = scrollAnchor();
const focused = document.activeElement;
const streamRow = focused?.matches('#list a.cr') ? focused.closest('.row[data-search]') : null;
const focusStream = streamRow && { show: streamRow.dataset.search, href: focused.href };
const focusMedia = focused?.closest('#list button[data-media]') ? { media: focused.dataset.media, ep: focused.dataset.ep,
kind: ['watch', 'drop', 'score', 'move'].find(c => focused.classList.contains(c)) } : null;
const focusedRow = focused?.matches?.('#list .row') ? keyRows().indexOf(focused) : -1;
// Counts in the summary change after ticking an episode. Use stable keys so
// expanded Catch-up sections do not collapse when their totals change.
const detailsKey = d => d.dataset.catchupSeason ? 'season:' + d.dataset.catchupSeason
  : d.dataset.catchupOverflow ? 'overflow:' + d.dataset.catchupOverflow
  : d.id || d.querySelector('summary')?.textContent;
const expanded = new Set([...document.querySelectorAll('#list details[open]')].map(detailsKey));
return () => {
for (const d of document.querySelectorAll('#list details')) d.open = expanded.has(detailsKey(d));
if (focusStream && !focused.isConnected && !document.querySelector('dialog[open]')) {
const next = [...document.querySelectorAll('#list .row[data-search] a.cr')].find(link =>
link.href === focusStream.href && link.closest('.row').dataset.search === focusStream.show &&
!link.closest('.hidden-by-search, details:not([open])'));
next?.focus({ preventScroll: true });
}
if (focusMedia && !focused.isConnected && !document.querySelector('dialog[open]')) {
const next = [...document.querySelectorAll('#list button[data-media]')].find(b => !b.disabled && b.dataset.media === focusMedia.media
&& b.dataset.ep === focusMedia.ep && b.classList.contains(focusMedia.kind));
next?.focus({ preventScroll: true });
}
if (focusedRow >= 0 && !focused.isConnected && !document.querySelector('dialog[open]')) {
const rows = keyRows();
if (rows.length) selectRow(rows[Math.min(focusedRow, rows.length - 1)]);
}
restoreAnchor(anchor);
};
}
