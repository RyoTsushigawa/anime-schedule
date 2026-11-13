// Main page, part 7: the Discord message, nicknames and emotes.
// Nicknames for the Discord message (nicknames.json, written with the GitHub key from the Discord dialog).
// Keyed by AniList ID, or "t:" + lower-case title (the ID wins when both exist).
const NICKNAMES_API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/nicknames.json';
let nicknames = {};
const nickKey = r => (r.m?.id || r.alId) ? String(r.m?.id || r.alId) : 't:' + String(r.show.english || r.show.romaji).trim().toLowerCase();
const titleKey = r => 't:' + String(r.show.english || r.show.romaji).trim().toLowerCase();
const savedNick = r => nicknames[nickKey(r)] || nicknames[titleKey(r)] || '';
const nickOf = r => savedNick(r) || r.show.english || r.show.romaji;
const cleanNicknames = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
.filter(([k, v]) => typeof v === 'string' && v.trim() && !LINKISH.test(v)).map(([k, v]) => [k, v.trim().slice(0, 80)]));
const nicknamesReady = fetch('nicknames.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {})
.then(j => applyNickFile(j)).catch(() => {});
// nicknames.json as a whole: names and emotes (also used by tools/discord-daily.mjs)
function applyNickFile(j) {
nicknames = cleanNicknames(j?.names);
emotes = { ...DEFAULT_EMOTES, ...cleanEmotes(j?.emotes) };
}
const planPeople = () => lastWeekRender ? [...new Set([...lastWeekRender[2].values()].flatMap(s => s.people))] : [];
// Discord emotes: a webhook can't turn ":name:" into a server emote, so the message carries the full
// <:name:id> code. Every code typed into a nickname is remembered, after that ":name:" is enough.
// always known, so the message for an empty day can use it
const DEFAULT_EMOTES = { kek: '<:kek:1074622036648939550>' };
let emotes = { ...DEFAULT_EMOTES };
const EMOTE_CODE = /<(a?):(\w{2,32}):(\d{15,21})>/g;
const cleanEmotes = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
.filter(([k, v]) => /^\w{2,32}$/.test(k) && typeof v === 'string' && /^<a?:\w{2,32}:\d{15,21}>$/.test(v)));
const learnEmotes = text => Object.fromEntries([...String(text).matchAll(EMOTE_CODE)].map(([code, , name]) => [name, code]));
const withEmotes = text => text.replace(/(^|[^<a\w]):(\w{2,32}):(?!\d)/g, (all, before, name) => emotes[name] ? before + emotes[name] : all);
// The dialog shows the message the way Discord will: "@Sophie" for a ping code, ":name:" for an emote
// code. Copying puts the codes back, so Discord still pings and shows the emote.
const pingNames = () => Object.entries(DISCORD_PINGS).map(([name, code]) =>
['@' + (planPeople().find(p => p.toLowerCase() === name) || name[0].toUpperCase() + name.slice(1)), code]);
const readable = text => {
for (const [label, code] of pingNames()) text = text.split(code).join(label);
for (const [name, code] of Object.entries(emotes)) text = text.split(code).join(`:${name}:`);
return text;
};
const forDiscord = text => {
for (const [label, code] of pingNames()) text = text.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\wäöüß])', 'g'), code);
return withEmotes(text);
};
// why a planned show isn't on the list, so nobody wonders where it went
const skipReason = r => r.skipped ? 'Skip' : r.recap ? 'Recap' : 'Pause';
function discordMessage({ date, groups, skipped = [] }) {
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
const when = date.toDateString() === new Date().toDateString() ? 'Heute'
: date.toDateString() === tomorrow.toDateString() ? 'Morgen' : `Am ${dayName(date)}`;
const lines = groups.map(g => {
const finale = r => r.m?.episodes > 1 && r.episodes?.length && Math.max(...r.episodes) === r.m.episodes;
const names = [...new Set(g.map(r => nickOf(r) + (r.slot?.double && r.episodes?.length > 1 ? ' (x2)' : '') + (finale(r) ? ' (Finale)' : '')))];
const tags = [...new Set(g.flatMap(r => r.who || []).map(p => DISCORD_PINGS[p.toLowerCase()]).filter(Boolean))];
const time = new Date(g[0].watchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
return `${time} ${names.join(' / ')}${tags.length ? ' ' + tags.join(' ') : ''}`;
});
const out = [...new Map(skipped.map(r => [nickKey(r), r])).values()].map(r => `${nickOf(r)} – ${skipReason(r)}`);
// who is away that day ("Rei, Terra (ab 20:00)"); only when something is planned, an empty day needs no list
const away = lines.length ? awayText(isoDay(date)) : [];
return withEmotes((lines.length ? `${when} stehen an:\n\n${lines.join('\n')}\n\nPasst?` : `${when} steht nichts an. ${DEFAULT_EMOTES.kek}`)
+ (away.length ? `\n\nAbwesend: ${away.join(', ')}` : '')
+ (out.length ? `\n\nFällt aus:\n${out.join('\n')}` : ''));
}
// U34: a short format to copy: date, then one line per show with start time, title and episode(s)
let discordFormat = 'full';
try { if (localStorage.getItem('discordFormat') === 'short') discordFormat = 'short'; } catch {}
function discordShort({ date, groups }) {
const lines = groups.flat().map(r => {
const time = new Date(r.watchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const eps = r.episodes?.length ? (r.episodes.length > 1 ? ` · Folge ${r.episodes[0]}–${r.episodes.at(-1)}` : ` · Folge ${r.episodes[0]}`) : '';
return `${time} ${r.show.english || r.show.romaji}${eps}`;
});
return `${shortDayName(date)} ${germanDate(date)}\n` + (lines.length ? lines.join('\n') : 'Nichts geplant.');
}
const currentMessage = () => discordFormat === 'short' ? discordShort(discordOpen) : discordMessage(discordOpen);
const drawDiscordFormat = () => { for (const b of $('discordFormat').querySelectorAll('[data-format]')) b.setAttribute('aria-pressed', String(b.dataset.format === discordFormat)); };
function discordDay(iso) {
const found = lastWeekRender && render(...lastWeekRender, true).find(d => isoDay(d.date) === iso);
if (!found) return null;
const groups = [];
for (const r of found.rows.filter(r => !r.pause)) {
if (groups.at(-1)?.[0].watchAt === r.watchAt) groups.at(-1).push(r);
else groups.push([r]);
}
const skipped = found.rows.filter(r => r.pause).sort((a, b) => (a.watchAt ?? 0) - (b.watchAt ?? 0));
return { date: found.date, groups, skipped };
}
let discordOpen = null;
// Conservative, local suggestions: never written to nicknames.json without a save.
function nicknameSuggestions(title) {
  const original = String(title || '').trim();
  const out = [];
  const add = value => {
    const name = String(value || '').replace(/\s+/g, ' ').trim().replace(/[\s:–—-]+$/, '');
    if (name.length >= 3 && name.length < original.length && name.length <= 40
      && !out.some(x => x.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  const main = original.split(/\s+[–—|]\s+|:\s+/)[0];
  if (main !== original) add(main);
  const withoutExtra = original.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (withoutExtra !== original) add(withoutExtra);
  const afterAs = original.match(/\b(?:as|als)\s+(?:an?\s+|the\s+|ein(?:e[smnr]?)?\s+)?([^?!:,.]{3,35})[?!]?$/i);
  if (afterAs) add(afterAs[1]);
  const words = main.replace(/[^\p{L}\p{N}' -]/gu, '').split(/\s+/);
  if (words.length > 4) {
    const meaningful = words.filter(x => !/^(the|a|an|of|in|on|to|is|are|and|with|my|your|what|how|that|this|i|was|at|for|der|die|das|ein|eine|und|im|in|von)$/i.test(x));
    if (meaningful.length >= 2) add(meaningful.slice(0, 3).join(' '));
  }
  return out.slice(0, 3);
}
function seasonNicknameRows(date) {
  const rows = new Map();
  const add = (r, weekday) => {
    if (!r.show) return;
    const title = r.show.english || r.show.romaji;
    const key = norm(r.show.romaji || title);
    if (!key) return;
    let entry = rows.get(key);
    if (!entry) rows.set(key, entry = { ...r, nickDays: new Set() });
    if (r.m?.id && !entry.m?.id) entry.m = r.m;
    if (weekday >= 0) entry.nickDays.add(weekday);
  };
  // Include every day of this schedule week, including broadcasts on break.
  const days = render(...lastWeekRender, true) || [];
  for (const day of days)
    for (const r of day.rows) if (!r.extra) add(r, (day.date.getDay() + 6) % 7);
  // The complete season plan includes shows without an episode this week.
  // Respect week-specific moves when determining which weekday to list.
  const statuses = Object.entries(streamsDe?.status || {}).filter(([id]) => /^[0-9]+$/.test(id));
  const planIds = new Set(days.map(d => tabFor(tabs, d.date).gid));
  for (const gid of planIds) {
    const plan = lastWeekRender[2].get(gid);
    if (!plan) continue;
    for (const person of plan.people)
      for (const [show, slot] of picks(plan, person)) {
        if (show.hidden) continue;
        const move = moveFor(show, lastWeekRender[1]);
        const weekday = WEEKDAYS.indexOf(norm(move?.tag || slot.tag).slice(0, 2));
        const match = statuses.find(([, status]) => titleMatches([show.romaji, show.english], status.titles || []));
        add({ show, ...(match && { m: { id: Number(match[0]) } }) }, weekday);
      }
  }
  return [...rows.values()].sort((a, b) => (a.show.english || a.show.romaji).localeCompare(b.show.english || b.show.romaji, 'de'));
}
let nickDayFilter = 'all';
function filterNickFields() {
  const term = norm($('discordNickSearch').value.trim());
  let visible = 0;
  const items = $('discordNickList').querySelectorAll('.nick-item');
  for (const item of items) {
    item.hidden = (nickDayFilter !== 'all' && !item.dataset.days.split(',').includes(nickDayFilter))
      || (!!term && !norm(item.dataset.title).includes(term));
    if (!item.hidden) visible++;
  }
  $('discordNickCount').textContent = visible + ' / ' + items.length;
  for (const button of $('discordNickDays').querySelectorAll('[data-nick-day]'))
    button.setAttribute('aria-pressed', String(button.dataset.nickDay === nickDayFilter));
}
function showNickFields() {
const rows = seasonNicknameRows(discordOpen.date);
$('discordNicks').hidden = !rows.length;
$('discordNickToggle').hidden = !rows.length;
$('discordNickSearch').value = '';
$('discordNickList').innerHTML = rows.map(r => {
const title = r.show.english || r.show.romaji;
const chips = nicknameSuggestions(title).map(name => `<button type="button" class="nick-suggestion" data-nick-suggest="${esc(name)}" title="Vorschlag übernehmen (noch nicht speichern)">${esc(name)}</button>`).join('');
return `<div class="nick-item" data-days="${[...r.nickDays].join(',')}" data-title="${esc([title, r.show.romaji].filter(Boolean).join(' '))}"><label class="nick-row"><span title="${esc(title)}">${esc(title)}</span><input data-nick="${esc(nickKey(r))}" data-nick-title="${esc(titleKey(r))}" value="${esc(savedNick(r))}" placeholder="Eigener Kurzname" maxlength="80" autocomplete="off" aria-label="Spitzname für ${esc(title)}"></label>${chips ? `<div class="nick-suggestions"><span>Vorschläge</span>${chips}</div>` : ''}</div>`;
}).join('');
filterNickFields();
}
// a name saved by title moves to the show's ID when saved here, so clearing the field really clears it
const typedNicks = () => Object.fromEntries([...$('discordNickList').querySelectorAll('[data-nick]')]
.flatMap(i => [[i.dataset.nickTitle, ''], [i.dataset.nick, i.value.trim()]]));
const previewNicks = () => {
const saved = nicknames;
nicknames = cleanNicknames({ ...saved, ...typedNicks() });
$('discordText').value = readable(currentMessage());
nicknames = saved;
};
async function openNickEditor(date, day = null, setup = false) {
  if (!lastWeekRender) await load();
  if (!lastWeekRender) { notice('Der Guckplan muss zuerst geladen werden.'); return; }
  await nicknamesReady;
  discordOpen = day || discordDay(isoDay(date));
  if (!discordOpen) { notice('Für diesen Tag ist kein Guckplan verfügbar.'); return; }
  nickDayFilter = setup ? 'all' : String((date.getDay() + 6) % 7);
  $('discordDlg').classList.toggle('nickname-setup', setup);
  $('discordName').textContent = setup ? 'Spitznamen einrichten' : `${dayName(date)}, ${germanDate(date)}`;
  $('discordText').value = readable(currentMessage());
  $('discordMsg').textContent = '';
  drawDiscordFormat();
  showNickFields();
  $('discordNicks').hidden = false;
  $('discordNickToggle').setAttribute('aria-expanded', 'true');
  $('discordDlg').showModal();
  (setup ? $('discordNickSearch') : $('discordCopy')).focus();
}
$('settingsNicknames').onclick = async () => {
  showSettings(false);
  await openNickEditor(weekStart(weekOffset), null, true);
};
$('discordNickDays').addEventListener('click', e => {
  const button = e.target.closest('[data-nick-day]');
  if (!button) return;
  nickDayFilter = button.dataset.nickDay;
  filterNickFields();
});
$('list').addEventListener('click', async e => {
const b = e.target.closest('[data-day-discord]');
if (!b || !lastWeekRender) return;
const date = new Date(b.closest('.day').dataset.date + 'T12:00:00');
await openNickEditor(date);
});
$('discordNickSearch').addEventListener('input', filterNickFields);
$('discordNickList').addEventListener('input', previewNicks);
$('discordNickList').addEventListener('click', e => {
  const chip = e.target.closest('[data-nick-suggest]');
  if (!chip) return;
  const input = chip.closest('.nick-item')?.querySelector('[data-nick]');
  if (!input) return;
  input.value = chip.dataset.nickSuggest;
  input.focus();
  previewNicks();
  $('discordMsg').textContent = 'Vorschlag übernommen, noch nicht gespeichert.';
});
$('discordNickToggle').onclick = () => {
  const panel = $('discordNicks');
  panel.hidden = !panel.hidden;
  $('discordNickToggle').setAttribute('aria-expanded', String(!panel.hidden));
};
$('discordNickSave').onclick = async () => {
const typed = typedNicks();
if (Object.values(typed).some(v => LINKISH.test(v))) { $('discordMsg').textContent = 'Keine Links in Spitznamen.'; return; }
$('discordNickSave').disabled = true;
$('discordMsg').textContent = 'Speichere …';
try {
nicknames = await saveNicknames(typed);
$('discordText').value = readable(currentMessage());
$('discordMsg').textContent = 'Spitznamen gespeichert, auch für den täglichen Post.';
} catch (err) {
$('discordMsg').textContent = `Nicht gespeichert: ${err.message}.`;
} finally {
$('discordNickSave').disabled = false;
}
};
async function saveNicknames(changes) {
const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
for (let attempt = 0; attempt < 4; attempt++) {
if (attempt) await new Promise(r => setTimeout(r, 800 * attempt));
const current = await fetch(NICKNAMES_API + '?ref=main&_=' + Date.now(), { headers, cache: 'no-store' });
const meta = current.ok ? await current.json() : null;
let remote = {};
try { if (meta?.content) remote = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))); } catch {}
const names = cleanNicknames(remote.names);
for (const [k, v] of Object.entries(changes)) { if (v) names[k] = v.slice(0, 80); else delete names[k]; }
const known = { ...cleanEmotes(remote.emotes), ...learnEmotes(Object.values(changes).join(' ')) };
emotes = { ...DEFAULT_EMOTES, ...known };
const file = { updated: new Date().toISOString(), names, ...(Object.keys(known).length && { emotes: known }) };
const content = btoa(unescape(encodeURIComponent(JSON.stringify(file, null, 1) + '\n')));
const res = await fetch(NICKNAMES_API, { method: 'PUT', headers,
body: JSON.stringify({ message: 'Spitznamen', content, branch: 'main', ...(meta?.sha && { sha: meta.sha }) }) });
if (res.ok) return names;
if (res.status !== 409 && res.status !== 422) throw new Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : `GitHub antwortet ${res.status}`);
}
throw new Error('gerade gleichzeitig gespeichert, bitte nochmal versuchen');
}
$('discordFormat').addEventListener('click', e => {
const b = e.target.closest('[data-format]');
if (!b || !discordOpen) return;
discordFormat = b.dataset.format;
try { localStorage.setItem('discordFormat', discordFormat); } catch {}
drawDiscordFormat();
$('discordText').value = readable(currentMessage());
});
$('discordCopy').onclick = async () => {
const text = forDiscord($('discordText').value);
try { await navigator.clipboard.writeText(text); }
catch { $('discordText').select(); if (!document.execCommand?.('copy')) { $('discordMsg').textContent = 'Kopieren ging nicht: Text markieren und Strg+C.'; return; } }
$('discordDlg').close();
notice('Für Discord kopiert.');
};

// N63 Discord-Zustellung (plan owner only): the daily posts and post updates of the last days from the
// workflow's runs, failed ones marked. A failed run from today can be started again once (GitHub's re-run;
// run_attempt > 1 means it was already retried). If today's post never went out at all, "Jetzt senden"
// starts the workflow once. Either way the script itself refuses a second post for the same day
// (daily-post.json), so a retry can't post twice.
const REPO_API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule';
const DELIVERY_KINDS = ['Tagespost', 'Tagespost (erneut)', 'Aktualisierung'];
const berlinIso = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
// runs from before the workflow named them: an edit is a push, the daily post the helper's start between 08:30 and 09:59
function deliveryKind(r) {
if (DELIVERY_KINDS.includes(r.display_title) || r.display_title === 'Probe') return r.display_title;
if (r.event === 'push') return 'Aktualisierung';
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r.created_at));
return r.event === 'repository_dispatch' && hm >= '08:30' && hm < '10:00' ? 'Tagespost' : 'Probe';
}
function deliveryState(runs, post, now = new Date()) {
const today = berlinIso(now);
const list = runs.map(r => ({ ...r, display_title: deliveryKind(r) })).filter(r => DELIVERY_KINDS.includes(r.display_title)).slice(0, 14);
const busy = list.some(r => r.status !== 'completed');
const postedToday = post?.date === today && !!post.id;
const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(now));
const rows = list.map(r => {
const failed = r.status === 'completed' && r.conclusion !== 'success' && r.conclusion !== 'skipped';
// one retry: today's, failed, not retried yet, and no other run still going; a failed post that later went out needs none
const retry = failed && !busy && berlinIso(new Date(r.created_at)) === today && (r.run_attempt || 1) < 2 && !(r.display_title !== 'Aktualisierung' && postedToday);
return { id: r.id, kind: r.display_title, at: r.created_at, url: r.html_url, state: r.status !== 'completed' ? 'busy' : failed ? 'failed' : 'ok', attempt: r.run_attempt || 1, retry };
});
const sentToday = list.some(r => r.display_title.startsWith('Tagespost') && berlinIso(new Date(r.created_at)) === today);
const sendNow = !postedToday && !busy && hour >= 9 && !rows.some(r => r.retry) && !sentToday;
return { rows, postedToday, sendNow, attention: sendNow || rows.some(r => r.retry) };
}
async function loadDeliveries() {
const headers = { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' };
const [runs, post] = await Promise.all([
fetch(REPO_API + '/actions/workflows/discord-daily.yml/runs?per_page=40&_=' + Date.now(), { headers, cache: 'no-store' })
.then(r => r.ok ? r.json() : Promise.reject(new Error('GitHub antwortet ' + r.status))),
fetch(REPO_API + '/contents/daily-post.json?ref=main&_=' + Date.now(), { headers, cache: 'no-store' })
.then(r => r.ok ? r.json() : null).then(meta => meta?.content ? JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\s/g, ''))))) : null).catch(() => null),
]);
return deliveryState(runs.workflow_runs || [], post);
}
let deliveries = null;
function drawDeliveries() {
const d = deliveries;
const when = at => new Date(at).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
$('deliveryToday').textContent = d.postedToday ? 'Der heutige Tagespost ist raus.' : 'Der heutige Tagespost ist noch nicht raus.';
$('deliverySend').hidden = !d.sendNow;
$('deliveryList').innerHTML = d.rows.length ? d.rows.map(r => `<li class="${r.state === 'failed' ? 'failed' : ''}"><b>${r.state === 'ok' ? '✓' : r.state === 'busy' ? '…' : '✕'} ${esc(r.kind)}</b>
<span>${r.state === 'busy' ? 'läuft gerade' : r.state === 'failed' ? 'fehlgeschlagen' : 'zugestellt'}${r.attempt > 1 ? ` · ${r.attempt}. Versuch` : ''} · <a href="${safeUrl(r.url)}" target="_blank" rel="noopener">Protokoll</a></span>
<small>${esc(when(r.at))}</small>${r.retry ? `<span class="repair-actions"><button type="button" class="pill primary" data-delivery-retry="${r.id}">Erneut versuchen</button></span>` : ''}</li>`).join('')
: '<li class="muted">Noch keine Zustellungen.</li>';
$('deliveryAlert').textContent = d.attention ? '⚠' : '';
}
async function refreshDeliveries(showErrors = true) {
if (!movesKey) return;
try { deliveries = await loadDeliveries(); drawDeliveries(); }
catch (e) { if (showErrors) $('deliveryList').innerHTML = `<li class="muted">Nicht geladen: ${esc(e.message)}</li>`; }
}
const actionsError = status => status === 403 || status === 404 ? 'der GitHub-Schlüssel darf Workflows nicht starten (Recht „Actions: Lesen und Schreiben“ fehlt)' : 'GitHub antwortet ' + status;
async function retryDelivery(run) {
const res = await fetch(`${REPO_API}/actions/runs/${run}/rerun`, { method: 'POST', headers: { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json' } });
if (!res.ok) throw new Error(actionsError(res.status));
}
async function sendDeliveryNow() {
const res = await fetch(REPO_API + '/dispatches', { method: 'POST', headers: { Authorization: `Bearer ${movesKey}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
body: JSON.stringify({ event_type: 'discord-daily', client_payload: { retry: true } }) });
if (!res.ok) throw new Error(actionsError(res.status));
}
async function deliveryAction(action, button) {
button.disabled = true;
$('deliveryStatus').textContent = 'Wird gestartet …';
try {
// look again right before: another browser may have retried already
deliveries = await loadDeliveries();
const run = button.dataset.deliveryRetry;
if (run ? !deliveries.rows.some(r => String(r.id) === run && r.retry) : !deliveries.sendNow) { drawDeliveries(); $('deliveryStatus').textContent = 'Schon erledigt oder schon neu gestartet.'; return; }
await action();
$('deliveryStatus').textContent = 'Gestartet. Der Post kommt in ein paar Minuten; hier steht es dann.';
setTimeout(() => refreshDeliveries(false), 5000);
} catch (e) { $('deliveryStatus').textContent = 'Nicht gestartet: ' + e.message; button.disabled = false; }
}
$('deliveryList').addEventListener('click', e => { const b = e.target.closest('[data-delivery-retry]'); if (b) deliveryAction(() => retryDelivery(b.dataset.deliveryRetry), b); });
$('deliverySend').onclick = () => deliveryAction(sendDeliveryNow, $('deliverySend'));
$('deliveryButton').onclick = () => { showSettings(false); $('deliveryStatus').textContent = ''; $('deliveryList').innerHTML = '<li class="muted">Wird geladen …</li>'; $('deliveryDlg').showModal(); refreshDeliveries(); };
$('deliveryReload').onclick = () => refreshDeliveries();
$('deliveryButton').hidden = !movesKey;
// a failed delivery today shows as ⚠ on the menu entry
refreshDeliveries(false);
