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
  $('troddlWrite').disabled = !(me?.pen);
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
        <p>${esc(r.text)}</p></article>`).join('')}
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
  drawPen(); drawList();
}

// writing: search AniList for the show, then score and text; a draft stays in this browser until it is published
const draftKey = () => `troddl-draft:${person()}:${editing?.mediaId || ''}`;
function scoreTo(v) {
  const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  $('troddlScore').value = $('troddlScoreRange').value = n;
  const b = $('troddlScoreBadge'); b.textContent = n; b.className = 'troddl-score ' + scoreClass(n);
}
function check() {
  const n = $('troddlText').value.trim().length;
  $('troddlCount').textContent = n < MIN_TEXT ? `${n} / ${MIN_TEXT} Zeichen: noch ${MIN_TEXT - n}` : `${n} Zeichen ✓`;
  $('troddlCount').className = 'troddl-hint' + (n < MIN_TEXT ? '' : ' ok');
  $('troddlSave').disabled = !editing || n < MIN_TEXT || n > MAX_TEXT;
  try { if (editing) localStorage.setItem(draftKey(), JSON.stringify({ text: $('troddlText').value, score: $('troddlScore').value })); } catch {}
}
function pick(show) {
  editing = show;
  $('troddlSearchBox').hidden = true;
  const box = $('troddlPicked'); box.hidden = false;
  box.innerHTML = `${show.cover ? `<img src="${esc(show.cover)}" alt="">` : ''}<span><b>${esc(show.title)}</b><small>${esc(show.season || '')}</small></span>`;
  const own = data.reviews.find(r => r.mine && r.mediaId === show.mediaId);
  let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch {}
  $('troddlText').value = draft?.text ?? own?.text ?? '';
  scoreTo(draft?.score ?? own?.score ?? 70);
  $('troddlDlgTitle').textContent = own ? 'Review bearbeiten' : 'Review schreiben';
  check(); $('troddlText').focus();
}
function openWriter(show = null) {
  editing = null; $('troddlFormMsg').textContent = ''; $('troddlText').value = ''; scoreTo(70);
  $('troddlSearchBox').hidden = false; $('troddlPicked').hidden = true; $('troddlResults').replaceChildren(); $('troddlSearch').value = '';
  $('troddlDlgTitle').textContent = 'Review schreiben';
  $('troddlDlg').showModal();
  if (show) pick(show); else { check(); $('troddlSearch').focus(); }
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
      const found = (d?.Page?.media || []).map(m => ({ mediaId: m.id, title: m.title.english || m.title.romaji, cover: m.coverImage?.medium || '', season: seasonLabel(m) }));
      $('troddlResults').replaceChildren(...found.map(s => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'troddl-result' });
        b.innerHTML = `${s.cover ? `<img src="${esc(s.cover)}" alt="">` : ''}<span><b>${esc(s.title)}</b><small>${esc(s.season)}</small></span>`;
        b.onclick = () => pick(s);
        return b;
      }));
      if (!found.length) $('troddlResults').textContent = 'Nichts gefunden.';
    } catch (e) { $('troddlResults').textContent = 'AniList-Suche fehlgeschlagen: ' + e.message; }
  }, 350);
};
$('troddlScore').oninput = () => { scoreTo($('troddlScore').value); check(); };
$('troddlScoreRange').oninput = () => { scoreTo($('troddlScoreRange').value); check(); };
$('troddlText').oninput = check;
$('troddlForm').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  $('troddlSave').disabled = true; $('troddlFormMsg').textContent = 'Wird veröffentlicht …';
  try {
    await call('/troddl/review', { person: person(), ...editing, score: Number($('troddlScore').value), text: $('troddlText').value }, person());
    try { localStorage.removeItem(draftKey()); } catch {}
    location.hash = 'm=' + editing.mediaId;
    $('troddlDlg').close(); await load();
  } catch (err) { $('troddlFormMsg').textContent = 'Nicht veröffentlicht: ' + err.message; check(); }
};
$('troddlWrite').onclick = () => openWriter();
$('troddlList').onclick = async e => {
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
$('troddlPerson').onchange = () => { try { localStorage.setItem('troddlPerson', person()); } catch {} load(); };

(async () => {
  const settings = await config().catch(() => ({}));
  if (typeof settings.previewVotesUrl === 'string' && /^https:\/\//.test(settings.previewVotesUrl)) api = settings.previewVotesUrl.replace(/\/$/, '');
  if (!api) { $('troddlStatus').textContent = 'Troddl ist hier nicht eingerichtet.'; return; }
  const profiles = await fetch('wrapped-profiles.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  people = Object.keys(profiles).flatMap(p => SHARED[p] || [p]).sort((a, b) => a.localeCompare(b, 'de'));
  await Identity.ready;
  let saved = ''; try { saved = localStorage.getItem('troddlPerson') || ''; } catch {}
  const me = people.includes(saved) ? saved : Identity.myPeople().find(p => people.includes(p)) || '';
  $('troddlPerson').replaceChildren(new Option('Nur lesen', ''), ...people.map(p => new Option(p, p)));
  $('troddlPerson').value = me;
  $('troddlPerson').disabled = false;
  load();
})();
