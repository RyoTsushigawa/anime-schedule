// Troddl (troddl.html): the group's reviews, Metacritic style. Everyone writes under a pen name they choose;
// the page shows pen names only. Storage: the votes helper (workers/season-votes, /troddl). Rules: troddl-core.mjs.
import { MIN_TEXT, MAX_TEXT, scoreClass, seasonLabel, seasonKey, summarize, reviewCount } from './troddl-core.mjs';

const SHARED = { MaRyo: ['Marvin', 'Ryo'] };
let api = '', data = { reviews: [] }, people = [], editing = null, turn = 0;
const person = () => $('troddlPerson').value;
const date = v => new Date(v).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const badge = (n, big) => `<span class="troddl-score ${scoreClass(n)}${big ? ' big' : ''}" title="${n == null ? 'Troddlrating ab 2 Reviews' : 'Troddlrating ' + n}">${n == null ? 'tbd' : n}</span>`;

async function call(path, body, as = '') {
  const code = savedGroupCode();
  const res = await fetch(api + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(as && Identity.headers(as)), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && /Gruppencode/.test(out.error || '')) { Identity.askGroupCode($('troddlIdentity'), load); throw new Error('Gruppencode fehlt: oben einmal eingeben.'); }
  if (!res.ok) throw new Error(out.error || 'Fehler ' + res.status);
  try { sessionStorage.removeItem('troddlCache'); } catch {}
  return out;
}

function drawPen() {
  const box = $('troddlPen'), me = data.me, can = Identity.canAct(person());
  box.replaceChildren();
  if (!can || !me) return;
  const field = Object.assign(document.createElement('input'), { className: 'pill', maxLength: 32, placeholder: 'Dein Kritiker-Name', value: me.pen || '' });
  field.setAttribute('aria-label', 'Kritiker-Name');
  const save = Object.assign(document.createElement('button'), { type: 'button', className: 'pill primary', textContent: 'Festlegen' });
  const show = () => {
    box.replaceChildren();
    const change = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: 'Ändern' });
    change.onclick = () => { box.replaceChildren(field, save); field.focus(); };
    box.append(Object.assign(document.createElement('span'), { textContent: 'Du schreibst als ' }), Object.assign(document.createElement('b'), { textContent: me.pen }), change);
  };
  save.onclick = async () => {
    save.disabled = true;
    try { const r = await call('/troddl/pen', { person: person(), pen: field.value }, person()); me.pen = r.pen; await load(); }
    catch (e) { $('troddlStatus').textContent = 'Nicht gespeichert: ' + e.message; save.disabled = false; }
  };
  field.onkeydown = e => { if (e.key === 'Enter') save.click(); };
  if (me.pen) show();
  else box.append(Object.assign(document.createElement('span'), { textContent: 'Wähle deinen Kritiker-Namen (die anderen sehen nur ihn):' }), field, save);
}

// reactions under a review: counts for everyone; your own are highlighted; not on your own review
const REACTIONS = ['👍', '😂', '🤔'];
const reactBar = r => !r.id ? '' : `<div class="troddl-react">${REACTIONS.map(e => {
  const n = r.reactions?.[e] || 0, on = !!r.myReactions?.includes(e);
  return `<button type="button" class="troddl-react-btn${on ? ' on' : ''}" data-react="${e}" data-review="${r.id}" aria-pressed="${on}"${r.mine ? ' disabled title="Deine eigene Review"' : ''} aria-label="${e}: ${n}">${e}${n ? `<span>${n}</span>` : ''}</button>`;
}).join('')}</div>`;
function drawList() {
  const season = $('troddlSeason').value, sort = $('troddlSort').value;
  const shows = [...summarize(data.reviews).values()];
  const seasons = [...new Set(shows.map(s => s.season).filter(Boolean))].sort((a, b) => seasonKey(b) - seasonKey(a));
  $('troddlSeason').replaceChildren(new Option('Alle', ''), ...seasons.map(s => new Option(s, s)));
  $('troddlSeason').value = seasons.includes(season) ? season : '';
  const list = shows.filter(s => !$('troddlSeason').value || s.season === $('troddlSeason').value);
  list.sort(sort === 'new' ? (a, b) => String(b.latest.editedAt || b.latest.at).localeCompare(String(a.latest.editedAt || a.latest.at))
    : sort === 'count' ? (a, b) => b.count - a.count || (b.rating ?? -1) - (a.rating ?? -1)
    : (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.count - a.count);
  const open = new Set([...document.querySelectorAll('.troddl-show[open]')].map(d => d.dataset.media));
  const wanted = location.hash.match(/^#m=(\d+)$/)?.[1];
  $('troddlList').innerHTML = list.map(s => `
    <details class="troddl-show" data-media="${s.mediaId}" id="m${s.mediaId}"${open.has(String(s.mediaId)) || wanted === String(s.mediaId) ? ' open' : ''}>
      <summary>${s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy">` : '<span class="troddl-nocover"></span>'}
        <span class="troddl-show-text"><b>${esc(s.title)}</b><small>${esc(s.season || '')}${s.season ? ' · ' : ''}${reviewCount(s.count)}</small></span>${badge(s.rating, true)}</summary>
      ${s.reviews.map(r => `<article class="troddl-review${r.mine ? ' mine' : ''}">
        <div class="troddl-review-head">${badge(r.score)}<b>${esc(r.pen)}</b><small>${date(r.at)}${r.editedAt ? ' · bearbeitet' : ''}</small>
        ${r.mine ? `<span class="troddl-own"><button type="button" class="pill" data-edit="${s.mediaId}">Bearbeiten</button><button type="button" class="pill" data-delete="${s.mediaId}">Löschen</button></span>` : ''}</div>
        <p>${esc(r.text)}</p>${reactBar(r)}</article>`).join('')}
      ${data.me?.pen && !s.reviews.some(r => r.mine) ? `<button type="button" class="pill troddl-add" data-add="${s.mediaId}">Eigene Review schreiben</button>` : ''}
    </details>`).join('') || '<p class="troddl-hint">Noch keine Reviews. Die erste schreibst vielleicht du?</p>';
  if (wanted) { document.getElementById('m' + wanted)?.scrollIntoView({ block: 'start' }); history.replaceState(null, '', location.pathname); }
}

async function load() {
  const mine = turn = turn + 1, who = person(), can = !!who && Identity.canAct(who);
  if (who) Identity.draw($('troddlIdentity'), who, load);
  try {
    const r = await call('/troddl' + (can ? '?person=' + encodeURIComponent(who) : ''), null, can ? who : '');
    if (mine !== turn) return;
    data = r;
    $('troddlStatus').textContent = can ? (r.me ? '' : 'Nicht bestätigt: lade die Seite neu oder prüf die PIN.') : who ? `Bestätige oben, dass du ${who} bist, um Reviews zu schreiben.` : '';
  } catch (e) { if (mine === turn) $('troddlStatus').textContent = 'Troddl ist gerade nicht erreichbar: ' + e.message; }
  drawPen(); drawList(); drawTodo();
}

// "Noch zu bewerten": what you finished on AniList lately (four months) and haven't reviewed, only for you
let todo = { who: '', shows: [] };
async function drawTodo() {
  const box = $('troddlTodo'), who = person(), account = who && Identity.accountsOf(who)[0];
  if (!account || !data.me?.pen) { box.hidden = true; return; }
  if (todo.who !== who) {
    try {
      const d = await anilist('query($u:String){Page(perPage:30){mediaList(userName:$u,type:ANIME,status:COMPLETED,sort:FINISHED_ON_DESC){completedAt{year month day} media{id title{romaji english} coverImage{medium} season seasonYear}}}}', { u: account });
      const since = Date.now() - 120 * 864e5;
      todo = { who, shows: (d?.Page?.mediaList || []).filter(e => e.completedAt?.year && Date.UTC(e.completedAt.year, (e.completedAt.month || 1) - 1, e.completedAt.day || 1) >= since).map(e => showFrom(e.media)) };
    } catch { todo = { who, shows: [] }; }
  }
  if (person() !== who) return;
  const open = todo.shows.filter(s => !data.reviews.some(r => r.mine && r.mediaId === s.mediaId)).slice(0, 8);
  box.hidden = !open.length;
  $('troddlTodoList').replaceChildren(...open.map(s => {
    const b = tile(s, 'troddl-tile');
    b.onclick = () => openWriter(s);
    return b;
  }));
}

// writing, in three steps: which anime (your recent list or a search), how good, and the text.
// A draft stays in this browser until it is published.
const draftKey = () => `troddl-draft:${person()}:${editing?.mediaId || ''}`;
const WORDS = [[90, 'Meisterwerk'], [75, 'Sehr gut'], [60, 'Gut'], [50, 'Durchwachsen'], [30, 'Schwach'], [0, 'Zeitverschwendung']];
const scoreWord = n => WORDS.find(([min]) => n >= min)[1];
function scoreTo(v) {
  const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  $('troddlScore').value = $('troddlScoreRange').value = n;
  const b = $('troddlScoreBadge'); b.textContent = n; b.className = 'troddl-score ' + scoreClass(n);
  $('troddlScoreWord').textContent = scoreWord(n);
  $('troddlScoreWord').className = 'troddl-score-word ' + scoreClass(n);
}
function check(save = true) {
  const n = $('troddlText').value.trim().length, left = Math.max(0, MIN_TEXT - n);
  $('troddlMeter').style.width = Math.min(100, n / MIN_TEXT * 100) + '%';
  $('troddlMeter').parentElement.classList.toggle('done', !left);
  $('troddlCount').textContent = left ? `Noch ${left} Zeichen bis zur Mindestlänge (${MIN_TEXT})` : `${n} Zeichen · lang genug ✓`;
  $('troddlCount').className = 'troddl-hint' + (left ? '' : ' ok');
  $('troddlWhy').textContent = !editing ? 'Erst einen Anime wählen' : left ? `Noch ${left} Zeichen` : n > MAX_TEXT ? 'Zu lang' : '';
  $('troddlSave').disabled = !editing || !!left || n > MAX_TEXT;
  for (const id of ['troddlStepScore', 'troddlStepText']) $(id).classList.toggle('waiting', !editing);
  try { if (save && editing) localStorage.setItem(draftKey(), JSON.stringify({ text: $('troddlText').value, score: $('troddlScore').value, at: Date.now() })); } catch {}
}
function pick(show) {
  editing = show;
  $('troddlSearchBox').hidden = true;
  const box = $('troddlPicked'); box.hidden = false;
  box.innerHTML = `${show.cover ? `<img src="${esc(show.cover)}" alt="">` : ''}<span><b>${esc(show.title)}</b><small>${esc(show.season || '')}</small></span><button type="button" class="pill" data-repick>Ändern</button>`;
  box.querySelector('[data-repick]').onclick = () => { editing = null; $('troddlSearchBox').hidden = false; box.hidden = true; $('troddlDraft').hidden = true; $('troddlDlgTitle').textContent = 'Review schreiben'; check(false); $('troddlSearch').focus(); };
  const own = data.reviews.find(r => r.mine && r.mediaId === show.mediaId);
  let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch {}
  $('troddlText').value = draft?.text ?? own?.text ?? '';
  scoreTo(draft?.score ?? own?.score ?? 70);
  const note = $('troddlDraft');
  note.hidden = !draft?.text;
  if (draft?.text) {
    note.innerHTML = `Dein Entwurf${draft.at ? ' vom ' + new Date(draft.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : ''} ist wieder da. <button type="button" class="troddl-link" data-drop-draft>Verwerfen</button>`;
    note.querySelector('[data-drop-draft]').onclick = () => { try { localStorage.removeItem(draftKey()); } catch {} $('troddlText').value = own?.text || ''; scoreTo(own?.score ?? 70); note.hidden = true; check(false); };
  }
  $('troddlDlgTitle').textContent = own ? 'Review bearbeiten' : 'Review schreiben';
  check(false); $('troddlScoreRange').focus();
}
const showFrom = m => ({ mediaId: m.id, title: m.title.english || m.title.romaji, cover: m.coverImage?.medium || '', season: seasonLabel(m) });
const reviewed = id => data.reviews.some(r => r.mine && r.mediaId === id);
function tile(s, cls) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: cls });
  b.innerHTML = `${s.cover ? `<img src="${esc(s.cover)}" alt="">` : '<span class="troddl-nocover"></span>'}<span><b>${esc(s.title)}</b><small>${reviewed(s.mediaId) ? '✓ schon bewertet · bearbeiten' : esc(s.season)}</small></span>`;
  if (reviewed(s.mediaId)) b.classList.add('done');
  b.onclick = () => pick(s);
  return b;
}
// your AniList list, newest first: finished and watching shows are the likely ones to review
let recent = { who: '', shows: [] };
async function loadRecent() {
  const who = person(), account = Identity.accountsOf(who)[0];
  $('troddlRecentBox').hidden = true;
  if (!account) return;
  if (recent.who !== who) {
    try {
      const d = await anilist('query($u:String){Page(perPage:12){mediaList(userName:$u,type:ANIME,status_in:[COMPLETED,CURRENT,PAUSED],sort:UPDATED_TIME_DESC){media{id title{romaji english} coverImage{medium} season seasonYear}}}}', { u: account });
      recent = { who, shows: (d?.Page?.mediaList || []).map(e => showFrom(e.media)) };
    } catch { recent = { who: '', shows: [] }; }
  }
  if (person() !== who || !recent.shows.length || editing) return;
  $('troddlRecent').replaceChildren(...recent.shows.map(s => tile(s, 'troddl-tile')));
  $('troddlRecentBox').hidden = false;
}
// what is still missing before you can write: who you are, then your pen name
function ready() {
  const who = person();
  if (!who) { $('troddlStatus').textContent = 'Wähl oben zuerst aus, wer du bist.'; $('troddlPerson').focus(); return false; }
  if (!Identity.canAct(who) || !data.me) { $('troddlStatus').textContent = `Bestätige zuerst, dass du ${who} bist (oben).`; $('troddlIdentity').querySelector('input, a, button')?.focus(); return false; }
  if (!data.me.pen) { $('troddlStatus').textContent = 'Leg zuerst deinen Kritiker-Namen fest (oben).'; $('troddlPen').querySelector('input')?.focus(); return false; }
  return true;
}
function openWriter(show = null) {
  if (!ready()) return;
  editing = null; $('troddlFormMsg').textContent = ''; $('troddlText').value = ''; scoreTo(70); $('troddlDraft').hidden = true;
  $('troddlSearchBox').hidden = false; $('troddlPicked').hidden = true; $('troddlResults').replaceChildren(); $('troddlSearch').value = '';
  $('troddlDlgTitle').textContent = 'Review schreiben';
  $('troddlDlg').showModal();
  if (show) pick(show); else { check(false); loadRecent(); $('troddlSearch').focus(); }
}
let searchTimer = 0;
$('troddlSearch').oninput = () => {
  clearTimeout(searchTimer);
  const q = $('troddlSearch').value.trim();
  if (q.length < 2) { $('troddlResults').replaceChildren(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const d = await anilist('query($s:String){Page(perPage:8){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english} coverImage{medium} season seasonYear}}}', { s: q });
      if ($('troddlSearch').value.trim() !== q) return;
      const found = (d?.Page?.media || []).map(showFrom);
      $('troddlResults').replaceChildren(...found.map(s => tile(s, 'troddl-result')));
      if (!found.length) $('troddlResults').textContent = 'Nichts gefunden.';
    } catch (e) { $('troddlResults').textContent = 'AniList-Suche fehlgeschlagen: ' + e.message; }
  }, 350);
};
$('troddlScore').oninput = () => { scoreTo($('troddlScore').value); check(); };
$('troddlScoreRange').oninput = () => { scoreTo($('troddlScoreRange').value); check(); };
$('troddlText').oninput = () => check();
// a topic button starts a new paragraph "Story: " at the end, ready to type
for (const b of document.querySelectorAll('[data-prompt]')) b.onclick = () => {
  const t = $('troddlText'), text = t.value.replace(/\s+$/, '');
  t.value = (text ? text + '\n\n' : '') + b.dataset.prompt + ': ';
  t.focus(); t.setSelectionRange(t.value.length, t.value.length); check();
};
$('troddlForm').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  $('troddlSave').disabled = true; $('troddlFormMsg').textContent = 'Wird veröffentlicht …';
  try {
    await call('/troddl/review', { person: person(), ...editing, score: Number($('troddlScore').value), text: $('troddlText').value }, person());
    try { localStorage.removeItem(draftKey()); } catch {}
    location.hash = 'm=' + editing.mediaId;
    $('troddlDlg').close(); await load();
  } catch (err) { $('troddlFormMsg').textContent = 'Nicht veröffentlicht: ' + err.message; check(false); }
};
$('troddlWrite').onclick = () => openWriter();
$('troddlList').onclick = async e => {
  const react = e.target.closest('[data-react]');
  if (react) {
    const who = person();
    if (!who || !Identity.canAct(who) || !data.me) { $('troddlStatus').textContent = who ? `Bestätige oben, dass du ${who} bist, um zu reagieren.` : 'Wähl oben aus, wer du bist, um zu reagieren.'; return; }
    react.disabled = true;
    try {
      const r = await call('/troddl/react', { person: who, id: react.dataset.review, emoji: react.dataset.react }, who);
      const review = data.reviews.find(x => x.id === r.id);
      if (review) { review.reactions = r.reactions; review.myReactions = r.myReactions; }
      drawList();
    } catch (err) { $('troddlStatus').textContent = 'Nicht gespeichert: ' + err.message; react.disabled = false; }
    return;
  }
  const id = Number(e.target.closest('[data-edit],[data-add],[data-delete]')?.dataset.edit || e.target.closest('[data-add]')?.dataset.add || e.target.closest('[data-delete]')?.dataset.delete);
  if (!id) return;
  const show = summarize(data.reviews).get(id);
  if (e.target.closest('[data-delete]')) {
    if (!confirm(`Deine Review zu „${show.title}“ löschen?`)) return;
    try { await call('/troddl/review/delete', { person: person(), mediaId: id }, person()); await load(); }
    catch (err) { $('troddlStatus').textContent = 'Nicht gelöscht: ' + err.message; }
    return;
  }
  openWriter({ mediaId: id, title: show.title, cover: show.cover, season: show.season });
};
$('troddlSeason').onchange = drawList;
$('troddlSort').onchange = drawList;
$('troddlPerson').onchange = () => load();

// who you are: the person picked in Solo on the plan, like the other pages (MaRyo: whichever of Ryo and Marvin
// is logged in here); without one, the AniList login on this device
function defaultPerson() {
  let solo = ''; try { solo = localStorage.getItem('soloPerson') || ''; } catch {}
  const mine = Identity.myPeople();
  if (SHARED[solo]) return SHARED[solo].find(p => mine.includes(p)) || SHARED[solo].find(p => people.includes(p)) || '';
  if (people.includes(solo)) return solo;
  return mine.find(p => people.includes(p)) || '';
}
(async () => {
  const [url, profiles] = await Promise.all([votesApi(),
    fetch('wrapped-profiles.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})), Identity.ready]);
  api = url;
  if (!api) { $('troddlStatus').textContent = 'Troddl ist hier nicht eingerichtet.'; return; }
  people = Object.keys(profiles).flatMap(p => SHARED[p] || [p]).sort((a, b) => a.localeCompare(b, 'de'));
  $('troddlPerson').replaceChildren(new Option('Nur lesen', ''), ...people.map(p => new Option(p, p)));
  $('troddlPerson').value = defaultPerson();
  $('troddlPerson').disabled = false;
  await load();
  // from the plan's score dialog ("Auch eine Troddl-Review schreiben"): the writer opens with that show picked
  const write = Number(location.hash.match(/^#write=(\d+)$/)?.[1]);
  if (write) {
    history.replaceState(null, '', location.pathname);
    try {
      const d = await anilist('query($id:Int){Media(id:$id,type:ANIME){id title{romaji english} coverImage{medium} season seasonYear}}', { id: write });
      if (d?.Media) openWriter(showFrom(d.Media));
    } catch {}
  }
})();
