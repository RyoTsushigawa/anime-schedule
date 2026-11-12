// Main page, part 4: watched episodes and scores (✓, undo, sync between lists).
async function loadMe() {
if (!auth) return;
const loadedFor = auth;
if (auth.provider === 'mal') {
const account = auth;
const me = await MAL.profile(account);
if (auth !== account) return;
account.name = me.name; account.scoreFormat = 'POINT_10';
account.avatar = typeof me.picture === 'string' ? me.picture : me.picture?.medium || me.picture?.large || '';
saveAccounts(); $('anilistUser').value = account.name; updateConnect();
const { entries } = await MAL.list(account);
if (auth !== account) return;
for (const e of entries) { myProgress.set(e.media.id, e.progress); knownEntries.set(e.media.id, { progress:e.progress, status:e.status, score:e.score }); }
await loadToScore();
return;
}
if (auth.name && auth.avatar === undefined) {
auth.avatar = (await anilistAsMe('{ Viewer { avatar { medium } } }')).Viewer.avatar?.medium || '';
if (auth !== loadedFor) return;
saveAccounts();
updateConnect();
}
if (!auth.name) {
const { Viewer } = await anilistAsMe('{ Viewer { name avatar { medium } } }');
if (auth !== loadedFor) return;
auth.name = Viewer.name;
auth.avatar = Viewer.avatar?.medium || '';
accounts = accounts.filter(a => a === auth || a.provider === 'mal' || a.name !== auth.name);
saveAccounts();
$('anilistUser').value = auth.name;
try { localStorage.setItem('anilistUser', auth.name); } catch {}
updateConnect();
}
const ownEntries = await anilistList(auth.name);
if (auth !== loadedFor) return;
for (const { progress, status, media } of ownEntries) {
myProgress.set(media.id, progress);
knownEntries.set(media.id, { progress, status });
}
try {
const dropped = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: DROPPED) {
      lists { entries { progress status media { id } } } } }`, { user: auth.name });
if (auth !== loadedFor) return;
for (const { progress, status, media } of dropped.MediaListCollection.lists.flatMap(l => l.entries))
if (!knownEntries.has(media.id)) knownEntries.set(media.id, { progress, status });
} catch {}
if (!auth.scoreFormat) {
try {
auth.scoreFormat = (await anilistAsMe('{ Viewer { mediaListOptions { scoreFormat } } }')).Viewer.mediaListOptions.scoreFormat;
saveAccounts();
} catch {}
}
await loadToScore();
}
const TO_SCORE_DAYS = 60;
let toScore = [];
async function loadToScore() {
if (!auth?.name) return;
const loadedFor = auth;
try {
if (auth.provider === 'mal') {
const { entries } = await MAL.list(auth);
if (auth !== loadedFor) return;
for (const e of entries.filter(e => e.status === 'COMPLETED')) knownEntries.set(e.media.id, { progress:e.progress, status:e.status, score:e.score });
const since = Date.now() - TO_SCORE_DAYS * 86400000;
toScore = entries.filter(e => e.status === 'COMPLETED' && !e.score && e.completedAt?.year)
.map(e => ({ media:e.media, completed:new Date(e.completedAt.year,e.completedAt.month-1,e.completedAt.day) }))
.filter(e => e.completed >= since).sort((a,b)=>b.completed-a.completed);
return;
}
const done = await anilist(`query ($user: String) { MediaListCollection(userName: $user, type: ANIME, status: COMPLETED) {
      lists { entries { progress status score completedAt { year month day }
        media { id siteUrl synonyms title { romaji english } coverImage { medium } } } } } }`, { user: auth.name });
const entries = done.MediaListCollection.lists.flatMap(l => l.entries);
if (auth !== loadedFor) return;
for (const { progress, status, score, media } of entries)
if (!knownEntries.has(media.id) || knownEntries.get(media.id).status === 'COMPLETED') knownEntries.set(media.id, { progress, status, score });
const since = Date.now() - TO_SCORE_DAYS * 86400000;
toScore = entries.filter(e => !e.score && e.completedAt?.year
&& new Date(e.completedAt.year, (e.completedAt.month || 1) - 1, e.completedAt.day || 1) >= since)
.map(e => ({ media: e.media, completed: new Date(e.completedAt.year, (e.completedAt.month || 1) - 1, e.completedAt.day || 1) }))
.sort((a, b) => b.completed - a.completed);
} catch {}
}
const SAVE_PROGRESS = `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, score: $score) { id progress status score }
}`;
const knownEntries = new Map();
const notOnList = new Set();
async function entryNow(mediaId) {
return entryForAccount(auth, mediaId);
}
async function entryForAccount(account, mediaId) {
const entry = account.provider === 'mal' ? await MAL.entry(account, mediaId)
: (await anilist('query ($id: Int) { Media(id: $id) { mediaListEntry { progress status score } } }', { id: mediaId }, account.token)).Media.mediaListEntry;
return entry ? { onList: true, progress: entry.progress, status: entry.status, score: entry.score } : { onList: false };
}
const saveForAccount = async (account, mediaId, vars, autoComplete = false) => account.provider === 'mal'
? MAL.save(account, mediaId, vars, autoComplete)
: (await anilist(SAVE_PROGRESS, { mediaId, ...vars }, account.token, { retries:0 })).SaveMediaListEntry;
function invalidateAccount(account) {
if (account.provider === 'mal') MAL.invalidate(account);
else try { localStorage.removeItem('list:' + account.name.toLowerCase()); } catch {}
}
async function convertSyncScore(score, source, target) {
if (!score) return 0;
if (!target.scoreFormat && target.provider !== 'mal') {
target.scoreFormat = (await anilist('{ Viewer { mediaListOptions { scoreFormat } } }', {}, target.token)).Viewer.mediaListOptions.scoreFormat;
saveAccounts();
}
const max = a => a.provider === 'mal' ? 10 : ({POINT_100:100,POINT_10_DECIMAL:10,POINT_10:10,POINT_5:5,POINT_3:3}[a.scoreFormat] || 10);
const value = score / max(source) * max(target);
return target.provider !== 'mal' && target.scoreFormat === 'POINT_10_DECIMAL' ? Math.max(.1,Math.round(value*10)/10) : Math.max(1,Math.round(value));
}
const entryBefore = entryNow;
const ON_WATCHING_LIST = ['CURRENT', 'REPEATING'];
const pendingChanges = new Set();
let bulkSaving = false;
function syncSavingButtons() {
for (const b of document.querySelectorAll('#list button[data-media]')) {
const saving = pendingChanges.has(Number(b.dataset.media));
b.disabled = saving || bulkSaving || accountLoading;
if (saving || accountLoading || bulkSaving) {
if (!b.hasAttribute('data-idle-title')) b.dataset.idleTitle = b.title;
b.title = accountLoading ? 'Konto wird geladen. Bitte kurz warten.' : bulkSaving ? 'Mehrere Folgen werden gespeichert. Bitte kurz warten.' : `Speichert auf ${listService()}…`;
} else if (b.hasAttribute('data-idle-title')) {
b.title = b.dataset.idleTitle;
delete b.dataset.idleTitle;
}
if (saving) { b.setAttribute('aria-busy', 'true'); b.setAttribute('aria-label', b.title); }
else { b.removeAttribute('aria-busy'); b.setAttribute('aria-label', b.title); }
}
for (const id of ['markAll', 'markAllStart', 'cancelMark', 'noticeUndo']) {
const button = $(id);
if (button) button.disabled = accountLoading || bulkSaving || pendingChanges.size > 0;
}
$('syncTarget').disabled = bulkSaving || pendingChanges.size > 0;
$('syncBoth').disabled = bulkSaving || pendingChanges.size > 0 || !$('syncTarget').value;
}
async function change(mediaId, vars) {
if (pendingChanges.has(mediaId)) throw new Error('Diese Serie wird noch gespeichert.');
pendingChanges.add(mediaId);
syncSavingButtons();
try {
const sourceAccount = auth, targetAccount = syncTargetFor(auth);
const before = await entryBefore(mediaId);
const status = vars.status || (vars.progress !== undefined && !ON_WATCHING_LIST.includes(before.status) ? 'CURRENT' : undefined);
const saved = auth?.provider === 'mal' ? await MAL.save(auth, mediaId, { ...vars, status }, true)
: (await anilistAsMe(SAVE_PROGRESS, { mediaId, ...vars, status })).SaveMediaListEntry;
knownEntries.set(mediaId, { progress: saved.progress, status: saved.status, score: saved.score });
notOnList.delete(mediaId);
myProgress.set(mediaId, saved.progress);
listChanged(mediaId, saved.progress, !!status);
const record = { mediaId, before, after: { progress: saved.progress, status: saved.status, score: saved.score }, entryId: saved.id, account:sourceAccount };
if (targetAccount) {
let attemptedBefore;
const sync = async () => {
const targetId = targetAccount.provider === 'mal' ? mediaId : await MAL.anilistId(mediaId);
const targetBefore = await entryForAccount(targetAccount, targetId);
if (attemptedBefore && ['onList', 'progress', 'status', 'score'].some(key => attemptedBefore[key] !== targetBefore[key]))
throw new Error('Die Zielliste wurde inzwischen geändert.');
const synced = { ...vars };
if (vars.score !== undefined) synced.score = await convertSyncScore(vars.score, sourceAccount, targetAccount);
if (vars.progress !== undefined && !vars.status && !ON_WATCHING_LIST.includes(targetBefore.status)) synced.status = 'CURRENT';
if (vars.progress !== undefined && vars.progress > (before.progress || 0) && targetBefore.progress > vars.progress) {
record.syncMessage = `${targetAccount.name} ist schon weiter; der Fortschritt dort bleibt.`;
} else {
attemptedBefore = targetBefore;
const second = await saveForAccount(targetAccount, targetId, synced, true);
invalidateAccount(targetAccount);
record.linked = [{mediaId:targetId,before:targetBefore,after:{progress:second.progress,status:second.status,score:second.score},entryId:second.id,account:targetAccount}];
}
};
try { await sync(); }
catch (error) {
record.syncMessage = `Abgleich unvollständig für ${targetAccount.name}: ${error.message}`;
record.retrySync = async () => {
const current = await entryForAccount(sourceAccount, mediaId);
if (!current.onList || ['progress', 'status', 'score'].some(key => current[key] !== record.after[key]))
throw new Error('Die ursprüngliche Liste wurde inzwischen geändert.');
await sync();
delete record.retrySync;
};
}
}
return record;
} finally {
pendingChanges.delete(mediaId);
syncSavingButtons();
}
}
function listChanged(mediaId, progress, statusChanged) {
if (auth?.provider === 'mal') { MAL.invalidate(auth); planShowsCache.time = 0; return; }
try {
const key = 'list:' + auth.name.toLowerCase();
const list = JSON.parse(localStorage.getItem(key));
const entry = list?.entries.find(x => x.media.id === mediaId);
if (entry && !statusChanged) { entry.progress = progress; localStorage.setItem(key, JSON.stringify(list)); }
else localStorage.removeItem(key);
} catch {}
if (statusChanged) planShowsCache.time = 0;
}
const UNDO_MS = 10 * 60 * 1000;
const undoSteps = [];
// In a long Catch-up cleanup (e.g. Belly's backlog), a failed request does not
// prove the server rejected that particular write. Never count it as saved or
// automatically retry it: only earlier confirmed responses belong to Undo.
function bulkSaveSummary(saved, total, unit, error = '') {
  if (!error) return `${saved} von ${total} ${unit} bestätigt gespeichert.`;
  const untouched = Math.max(0, total - saved - 1);
  return `${saved} von ${total} ${unit} bestätigt gespeichert. ` +
    `1 Änderung nicht bestätigt${untouched ? `, ${untouched} noch nicht versucht` : ''}. ` +
    `Fehler: ${error}`;
}
function finishBulkSave(records, total, unit, error = '') {
  const message = bulkSaveSummary(records.length, total, unit, error);
  if (records.length) remember(records, message);
  else notice(message);
}
function remember(records, text) {
if (!records.length || !auth) return;
const messages = [...new Set(records.map(r => r.syncMessage).filter(Boolean))];
const flattened = records.flatMap(r => [r, ...(r.linked || [])]);
const step = { records:flattened, time: Date.now(), token: auth.token, name: auth.name || 'dem anderen Konto' };
undoSteps.push(step);
if (messages.length) text += ' · ' + messages.join(' · ');
notice(text, true);
offerSyncRetry(step, records.filter(r => r.retrySync));
}
function offerSyncRetry(step, records) {
if (!records.length) return;
const button = $('noticeRetry');
button.hidden = false;
button.onclick = async () => {
if (undoSteps.at(-1) !== step || auth?.token !== step.token || Date.now() - step.time > UNDO_MS || pendingChanges.size || bulkSaving || undoing) return;
button.disabled = true;
records.forEach(r => pendingChanges.add(r.mediaId));
syncSavingButtons();
try {
for (const record of records) {
await record.retrySync();
if (record.linked) step.records.push(...record.linked);
}
notice('Listen-Abgleich abgeschlossen.', true);
} catch (error) {
notice('Abgleich weiterhin unvollständig: ' + error.message, true);
offerSyncRetry(step, records.filter(r => r.retrySync));
} finally {
records.forEach(r => pendingChanges.delete(r.mediaId));
button.disabled = false;
syncSavingButtons();
}
};
}
let undoing = false;
async function undo() {
if (!auth || undoing || bulkSaving || pendingChanges.size) return;
const last = undoSteps.at(-1);
if (!last) return;
if (Date.now() - last.time > UNDO_MS) { undoSteps.length = 0; notice('Zu spät zum Rückgängigmachen; ändere es stattdessen auf AniList.'); return; }
if (last.token !== auth.token) { notice(`Gemacht mit ${last.name}: wechsle zu diesem Konto, um es rückgängig zu machen.`); return; }
undoSteps.pop();
undoing = true;
notice('Wird rückgängig gemacht…');
const left = [...last.records];
let done = 0, elsewhere = 0, failed = null;
while (left.length) {
const { mediaId, before, after, entryId, account:originalAccount } = left.at(-1);
try {
const account = originalAccount ? accounts.find(a => accountKey(a) === accountKey(originalAccount)) : auth;
if (!account) throw new Error(`Verbinde ${originalAccount.name}, um die Änderung rückgängig zu machen.`);
const now = await entryForAccount(account, mediaId);
if (!now.onList || now.progress !== after.progress || now.status !== after.status || now.score !== after.score) elsewhere++;
else {
if (before.onList) {
await saveForAccount(account, mediaId, {progress:before.progress,status:before.status,score:before.score});
if (account === auth) { knownEntries.set(mediaId, { progress: before.progress, status: before.status, score: before.score }); myProgress.set(mediaId, before.progress); }
} else {
if (account.provider === 'mal') await MAL.remove(account, entryId);
else await anilist('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: entryId }, account.token);
if (account === auth) { knownEntries.delete(mediaId); notOnList.add(mediaId); myProgress.delete(mediaId); }
}
invalidateAccount(account);
if (account === auth) listChanged(mediaId, before.progress || 0, true);
done++;
}
} catch (err) { failed = err; break; }
left.pop();
if (left.length) await new Promise(r => setTimeout(r, 700));
}
const parts = [];
if (done) parts.push(last.records.length > 1 ? `Rückgängig für ${done}` : 'Rückgängig gemacht');
if (elsewhere) parts.push(`${elsewhere === 1 ? (done || failed ? 'eine Serie wurde' : 'Diese Serie wurde') : `${elsewhere} Serien wurden`} inzwischen woanders geändert und so gelassen`);
if (failed) {
undoSteps.push({ ...last, records: left });
parts.push(`${left.length === 1 ? 'eine Serie ist' : `${left.length} Serien sind`} noch rückgängig zu machen (${failed.message})`);
}
const text = parts.join('; ');
notice(text.charAt(0).toUpperCase() + text.slice(1) + '.', !!failed);
undoing = false;
load(true);
}
document.addEventListener('keydown', e => {
if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
if (e.isComposing || e.altKey || document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
e.preventDefault();
undo();
});
let noticeTimer = null;
let pauseTimer = null;
onAniListPause = until => {
if (!pendingChanges.size && !bulkSaving && !undoing) return;
clearInterval(pauseTimer);
const show = () => {
const s = Math.ceil((until - Date.now()) / 1000);
if (s <= 0) { clearInterval(pauseTimer); return; }
notice(`AniList-Pause: ✓ geht wieder in ${s} s`);
};
show();
pauseTimer = setInterval(show, 1000);
};
let requestsPerTick = 2;
function ticksLeft() {
if (auth?.provider === 'mal' || !aniLimit.limit || !Number.isFinite(aniLimit.remaining)) return '';
const n = Math.floor(aniLimit.remaining / requestsPerTick);
return n > 5 ? '' : n > 0 ? ` · noch ${n} bis zur Pause` : ' · der nächste ✓ wartet kurz auf AniList';
}
function notice(text, withUndo = false) {
movesUndo = null;
delayUndo = null;
$('noticeText').textContent = text;
$('noticeUndo').hidden = !withUndo;
$('noticeRetry').hidden = true;
$('notice').hidden = false;
clearTimeout(noticeTimer);
noticeTimer = setTimeout(() => { $('notice').hidden = true; }, withUndo ? 20000 : 5000);
}
$('noticeUndo').onclick = () => delayUndo ? undoDelay() : movesUndo ? undoMove() : undo();
const rowTitle = el => el.closest('.shared, .row')?.querySelector('.title')?.textContent.trim() || 'Serie';
const failedTicks = new Map();
const tickKey = (mediaId, episode) => JSON.stringify([accountKey(auth), mediaId, episode]);
const watchButton = (mediaId, episode, add = false) => !auth ? '' :
`<button class="watch${failedTicks.has(tickKey(mediaId, episode)) ? ' save-failed' : (myProgress.get(mediaId) || 0) >= episode ? ' done' : ''}" data-media="${mediaId}" data-ep="${episode}"${add ? ' data-add="1"' : ''}
    title="${failedTicks.has(tickKey(mediaId, episode)) ? 'Nicht gespeichert · Nochmal versuchen' : `Folge ${episode} gesehen (${listService()})`}">${failedTicks.has(tickKey(mediaId, episode)) ? '↻' : '✓'}</button>`;
const before = new Map();
$('list').addEventListener('click', e => {
const step = e.target.closest('[data-step]');
if (!step) return;
const box = step.closest('.ep-stepper'), first = Number(box.dataset.first), out = Number(box.dataset.out);
const count = Math.min(out - first + 1, Math.max(1, Number(box.querySelector('.ep-count').textContent) + Number(step.dataset.step)));
box.querySelector('.ep-count').textContent = count;
box.querySelector('[data-step="-1"]').disabled = count <= 1;
box.querySelector('[data-step="1"]').disabled = count >= out - first + 1;
// the ✓ next to it saves up to this episode
const watch = box.nextElementSibling;
if (watch?.classList.contains('watch')) { watch.dataset.ep = first + count - 1; watch.title = `Bis Folge ${first + count - 1} gesehen (${listService()})`; watch.setAttribute('aria-label', watch.title); }
});
$('list').addEventListener('click', async e => {
const b = e.target.closest('.watch');
if (!b || b.dataset.localWatch || !auth || b.disabled || bulkSaving || pendingChanges.has(Number(b.dataset.media)) || b.dataset.select) return;
const mediaId = Number(b.dataset.media), episode = Number(b.dataset.ep);
const key = tickKey(mediaId, episode);
const current = myProgress.get(mediaId) || 0;
const retry = failedTicks.get(key);
if (retry && retry.current !== current) {
failedTicks.delete(key);
notice('Fortschritt hat sich geändert. Bitte prüfe die Folge erneut.');
load(true);
return;
}
let progress;
if (retry) progress = retry.progress;
else if (current >= episode) progress = before.has(mediaId) ? before.get(mediaId) : episode - 1;
else { before.set(mediaId, current); progress = episode; }
b.disabled = true;
const title = rowTitle(b);
try {
const sent = aniLimit.count;
const record = await change(mediaId, { progress, status: b.dataset.add ? 'CURRENT' : undefined });
failedTicks.delete(key);
if (aniLimit.count > sent) requestsPerTick = aniLimit.count - sent;
clearInterval(pauseTimer);
const first = (record.before.progress || 0) + 1;
const result = progress > first ? `Folgen ${first}–${progress} als gesehen markiert`
: progress >= first ? `Folge ${progress} gesehen` : `Fortschritt auf ${progress} gesetzt`;
remember([record], `${title}: ${result}${ticksLeft()}`);
if (record.after.status === 'COMPLETED' && record.before.status !== 'COMPLETED' && !record.after.score) {
openScore(mediaId, title);
loadToScore().then(() => load(true));
}
} catch (err) {
failedTicks.set(key, { current, progress });
b.title = `Nicht gespeichert: ${err.message}`;
notice(`${title} nicht gespeichert: ${err.message}. Du kannst es nochmal versuchen.`);
}
load(true);
});
const SMILEYS = ['🙁', '😐', '🙂'];
const scoreFormat = () => auth?.scoreFormat || 'POINT_10_DECIMAL';
const showScore = score => scoreFormat() === 'POINT_5' ? '★'.repeat(score)
: scoreFormat() === 'POINT_3' ? SMILEYS[score - 1] || score : String(score);
const scoreButton = mediaId => {
const score = knownEntries.get(mediaId)?.score;
return `<button class="score${score ? ' scored' : ''}" data-score-media="${mediaId}" title="${score ? 'Bewertung ändern' : 'Bewerten'} auf ${listService()}">${score ? esc(showScore(score)) : '★ Bewerten'}</button>`;
};
let scoring = null;
function openScore(mediaId, title) {
scoring = { mediaId, title };
showSettings(false);
showMenu('accountMenu', 'accountButton', false);
const format = scoreFormat();
const current = knownEntries.get(mediaId)?.score || 0;
$('scoreName').textContent = title;
$('scoreService').textContent = 'Bewertung';
$('scoreService').title = `Abgeschlossen. Deine Bewertung auf ${listService()}`;
$('scoreMsg').textContent = '';
$('scoreClear').hidden = !current;
$('scoreSave').hidden = !['POINT_100', 'POINT_10_DECIMAL'].includes(format);
const box = $('scoreInput');
if (format === 'POINT_100' || format === 'POINT_10_DECIMAL') {
const max = format === 'POINT_100' ? 100 : 10;
box.innerHTML = `<input id="scoreValue" type="number" min="${max === 100 ? 1 : 0.5}" max="${max}" step="${max === 100 ? 1 : 0.5}"
      inputmode="decimal" value="${current || ''}" placeholder="${max === 100 ? 1 : 0.5}–${max}" aria-label="Bewertung von ${max}"><span class="muted">/ ${max}</span>`;
} else {
const values = { POINT_10: 10, POINT_5: 5, POINT_3: 3 }[format] || 10;
box.innerHTML = Array.from({ length: values }, (_, i) => i + 1).map(v =>
`<button type="button" class="pill${v === current ? ' primary' : ''}" data-score="${v}">${esc(format === 'POINT_5' ? v + '★' : showScore(v))}</button>`).join('');
}
$('scoreDlg').showModal();
$('scoreValue')?.focus();
}
async function saveScore(score) {
const { mediaId, title } = scoring;
$('scoreMsg').textContent = 'Speichert…';
try {
const record = await change(mediaId, { score });
$('scoreDlg').close();
toScore = toScore.filter(t => t.media.id !== mediaId || !score);
remember([record], score ? `${title}: mit ${showScore(record.after.score)} bewertet` : `${title}: Bewertung entfernt`);
load(true);
} catch (e) { $('scoreMsg').textContent = `Nicht gespeichert: ${e.message}`; }
}
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-score-media]');
if (b && auth) openScore(Number(b.dataset.scoreMedia), rowTitle(b));
});
$('scoreInput').addEventListener('click', e => {
const b = e.target.closest('[data-score]');
if (b) saveScore(Number(b.dataset.score));
});
$('scoreSave').onclick = () => {
const input = $('scoreValue');
if (!input) return;
const v = Math.round(Number(input.value.replace(',', '.')) * (input.step === '1' ? 1 : 10)) / (input.step === '1' ? 1 : 10);
if (!input.value || !(v >= Number(input.min) && v <= Number(input.max))) { $('scoreMsg').textContent = `Eine Bewertung von ${input.min} bis ${input.max}.`; return; }
saveScore(v);
};
$('scoreDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'scoreValue') { e.preventDefault(); $('scoreSave').click(); } });
$('scoreClear').onclick = () => saveScore(0);
const dropButton = mediaId => knownEntries.get(mediaId)?.status === 'DROPPED'
? '<span class="drop dropped" title="Auf AniList gedroppt">Gedroppt</span>'
: knownEntries.get(mediaId)?.status === 'COMPLETED' ? scoreButton(mediaId)
: `<button class="drop" data-media="${mediaId}" title="Auf ${listService()} droppen">Droppen</button>`;
$('list').addEventListener('click', async e => {
const b = e.target.closest('.drop');
if (!b || !auth || b.disabled) return;
if (!b.dataset.sure) {
b.dataset.sure = '1';
b.textContent = 'Sicher?';
setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.sure; b.textContent = 'Droppen'; } }, 4000);
return;
}
b.disabled = true;
const title = rowTitle(b);
try {
remember([await change(Number(b.dataset.media), { status: 'DROPPED' })], `${title} gedroppt`);
} catch (err) {
delete b.dataset.sure;
b.textContent = 'Droppen';
b.disabled = false;
notice(`${title} nicht gedroppt: ${err.message}. Du kannst es nochmal versuchen.`);
return;
}
load(true);
});
let catchupTargets = [];
let catchupSeasonTargets = new Map();
let selecting = false;
let revealMarkBar = false;
const skipped = new Set();
const markAllLabel = () => `${catchupTargets.filter(t => !skipped.has(t.mediaId)).length} ✓`;
$('list').addEventListener('click', e => {
const b = e.target.closest('[data-select]');
if (!b) return;
const id = Number(b.dataset.select);
skipped.has(id) ? skipped.delete(id) : skipped.add(id);
// A single show can have episodes split across different season groups.
for (const button of $('list').querySelectorAll('[data-select]'))
 if (Number(button.dataset.select) === id) button.classList.toggle('done', !skipped.has(id));
$('markAll').textContent = markAllLabel();
});
$('list').addEventListener('click', e => {
if (!e.target.closest('#cancelMark')) return;
selecting = false;
load(true);
});
$('markAllStart').onclick = () => {
if (!auth || $('markAllStart').disabled) return;
selecting = true;
revealMarkBar = true;
skipped.clear();
load(true);
};
$('list').addEventListener('click', async e => {
const b = e.target.closest('#markAll');
if (!b || !auth || b.disabled || bulkSaving || pendingChanges.size) return;
b.disabled = true;
const targets = catchupTargets.filter(t => !skipped.has(t.mediaId));
bulkSaving = true;
syncSavingButtons();
selecting = false;
const records = [];
let stopped = '';
for (const [i, { mediaId, progress, add }] of targets.entries()) {
b.textContent = `Speichert ${i + 1}/${targets.length}…`;
try {
records.push(await change(mediaId, { progress, status: add ? 'CURRENT' : undefined }));
} catch (err) { stopped = err.message; break; }
await new Promise(r => setTimeout(r, 700));
}
bulkSaving = false;
syncSavingButtons();
finishBulkSave(records, targets.length, 'Serien', stopped);
load(true);
});
// "Alle gesehen" for one catch-up season. Keep the global bulk action unchanged.
$('list').addEventListener('click', async e => {
 const b = e.target.closest('[data-mark-season]');
 if (!b || !auth || b.disabled || bulkSaving || pendingChanges.size ||
     view !== 'catchup' || friendList.value || !listUser() ||
     auth.name?.toLowerCase() !== listUser().toLowerCase()) return;
 const season = b.dataset.markSeason;
 const targets = catchupSeasonTargets.get(season) || [];
 if (!targets.length) return;
 b.disabled = true;
 bulkSaving = true;
 syncSavingButtons();
 const records = [];
 let stopped = '';
 for (const [i, {mediaId, progress, add}] of targets.entries()) {
  b.textContent = `Speichert ${i + 1}/${targets.length} …`;
  try {
   records.push(await change(mediaId, {progress, status: add ? 'CURRENT' : undefined}));
  } catch (err) { stopped = err.message; break; }
  await new Promise(r => setTimeout(r, 700));
 }
 bulkSaving = false;
 syncSavingButtons();
 finishBulkSave(records, targets.length, 'Serien in ' + catchupSeasonLabel(season), stopped);
 load(true);
});
// "Alle gesehen" on today's heading: every open tick of the day, one after the other (Rückgängig takes them all back)
$('list').addEventListener('click', async e => {
const b = e.target.closest('[data-day-watched]');
if (!b || !auth || b.disabled || bulkSaving || pendingChanges.size) return;
const targets = new Map();
for (const w of b.closest('.day').querySelectorAll('.watch:not(.done):not([data-select])')) {
const mediaId = Number(w.dataset.media), progress = Number(w.dataset.ep);
if (mediaId && progress > (targets.get(mediaId)?.progress || 0)) targets.set(mediaId, { mediaId, progress, add: !!w.dataset.add });
}
if (!targets.size) return;
b.disabled = true;
bulkSaving = true;
syncSavingButtons();
const records = [], all = [...targets.values()];
let stopped = '';
for (const [i, { mediaId, progress, add }] of all.entries()) {
notice(`Speichert ${i + 1}/${all.length}…`);
try { records.push(await change(mediaId, { progress, status: add ? 'CURRENT' : undefined })); }
catch (err) { stopped = err.message; break; }
await new Promise(r => setTimeout(r, 700));
}
bulkSaving = false;
syncSavingButtons();
finishBulkSave(records, all.length, 'heutigen Serien', stopped);
load(true);
});
