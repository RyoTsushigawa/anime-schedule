// Tier-Liste: sort a season's shows from the Guckplan into S–D. Personal and kept in this browser
// (localStorage "tierlist:<tab>:<person>"); "Für Discord kopieren" shares it as text.
'use strict';
const TIERS = ['S', 'A', 'B', 'C', 'D'];
const POOL = 'pool';
let tabs = [], sheet = null, covers = new Map(), state = null, picked = null, dragged = null;
let streams = null;
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
let noticeTimer = null;
function notice(text) {
  $('noticeText').textContent = text;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 3000);
}
const keyOf = show => show.romaji || show.english;
const titleOf = show => show.english || show.romaji;
const storeKey = () => `tierlist:${$('tierSeason').selectedOptions[0]?.textContent}:${$('tierPerson').value}`;

async function start() {
  try { streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json(); } catch {}
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  const now = Date.now();
  const current = tabFor(tabs, now);
  $('tierSeason').innerHTML = tabs.map(t => `<option value="${esc(t.gid)}"${t === current ? ' selected' : ''}>${esc(t.name.replace(/^Guckplan\s+/i, ''))}</option>`).join('');
  $('tierSeason').onchange = loadSeason;
  $('tierPerson').onchange = () => { try { localStorage.setItem('tierPerson', $('tierPerson').value); } catch {} draw(); };
  $('tierOwn').onchange = draw;
  await loadSeason();
}
async function loadSeason() {
  const tab = tabs.find(t => t.gid === $('tierSeason').value) || tabs[0];
  $('tiers').innerHTML = `<div class="status">Lese ${esc(tab.name)}…</div>`;
  try { sheet = await loadPlan(tab); }
  catch (e) { $('tiers').innerHTML = `<div class="status">Der Guckplan konnte nicht gelesen werden (${esc(e.message)}).</div>`; return; }
  rememberColors([sheet]);
  const wanted = $('tierPerson').value || (() => { try { return localStorage.getItem('tierPerson') || localStorage.getItem('soloPerson'); } catch { return ''; } })() || DEFAULT_PERSON;
  $('tierPerson').innerHTML = sheet.people.map(p => `<option${p === wanted ? ' selected' : ''}>${esc(p)}</option>`).join('');
  draw();
  loadCovers(sheet.shows.filter(s => !s.hidden)).then(draw, () => {});
}
// covers from AniList: known IDs from streams-de.json first, the rest by title search
async function loadCovers(shows) {
  const idOf = show => Object.entries(streams?.status || {}).find(([, s]) => titleMatches([show.romaji, show.english], s.titles))?.[0];
  const want = shows.filter(s => !covers.has(keyOf(s)));
  const ids = want.map(idOf).map(Number);
  const known = [...new Set(ids.filter(Boolean))];
  if (known.length) {
    const data = await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id coverImage { medium } } } }', { ids: known });
    for (const m of data.Page.media) want.forEach((s, i) => { if (ids[i] === m.id) covers.set(keyOf(s), m.coverImage?.medium || ''); });
  }
  const missing = want.filter((s, i) => !ids[i]);
  for (let at = 0; at < missing.length; at += 15) {
    const batch = missing.slice(at, at + 15);
    const query = `query (${batch.map((_, i) => `$t${i}: String`).join(', ')}) {${batch.map((_, i) =>
      ` s${i}: Page(perPage: 1) { media(search: $t${i}, type: ANIME, sort: SEARCH_MATCH) { coverImage { medium } } }`).join('')} }`;
    const data = await anilist(query, Object.fromEntries(batch.map((s, i) => [`t${i}`, s.romaji || s.english])));
    batch.forEach((s, i) => covers.set(keyOf(s), data[`s${i}`]?.media?.[0]?.coverImage?.medium || ''));
  }
}
function shownShows() {
  const visible = sheet.shows.filter(s => !s.hidden);
  if (!$('tierOwn').checked) return visible;
  const own = picks(sheet, $('tierPerson').value);
  return visible.filter(s => own.has(s));
}
function draw() {
  if (!sheet) return;
  const shows = shownShows();
  const byKey = new Map(shows.map(s => [keyOf(s), s]));
  const saved = load(storeKey(), {});
  // keep the saved order, drop shows no longer shown, everything new goes to the pool
  state = Object.fromEntries([...TIERS, POOL].map(t => [t, (saved[t] || []).filter(k => byKey.has(k))]));
  const placed = new Set(Object.values(state).flat());
  for (const s of shows) if (!placed.has(keyOf(s))) state[POOL].push(keyOf(s));
  const tile = key => {
    const s = byKey.get(key), cover = covers.get(key);
    return `<button type="button" class="tier-item${picked === key ? ' picked' : ''}" draggable="true" data-key="${esc(key)}" title="${esc(titleOf(s))}">
      ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" draggable="false">` : `<span class="tier-noimg">${esc(titleOf(s).slice(0, 2))}</span>`}
      <span class="tier-title">${esc(titleOf(s))}</span></button>`;
  };
  const row = t => `<section class="tier-row tier-${t === POOL ? 'pool' : t.toLowerCase()}" data-tier="${t}">
    <div class="tier-label">${t === POOL ? 'Noch offen' : t}</div>
    <div class="tier-items" data-tier="${t}">${state[t].map(tile).join('') || (t === POOL ? '<span class="tier-empty">Alles eingeordnet.</span>' : '')}</div></section>`;
  $('tiers').innerHTML = shows.length ? TIERS.map(row).join('') + row(POOL)
    : `<div class="status">${esc($('tierPerson').value)} hat in dieser Season noch keine Serie gewählt.</div>`;
}
function place(key, tier, beforeKey) {
  for (const t of Object.keys(state)) state[t] = state[t].filter(k => k !== key);
  const list = state[tier];
  const at = beforeKey ? list.indexOf(beforeKey) : -1;
  list.splice(at < 0 ? list.length : at, 0, key);
  save(storeKey(), state);
  picked = null;
  draw();
}
// tap to pick a cover, tap a row to put it there
$('tiers').addEventListener('click', e => {
  const item = e.target.closest('.tier-item'), row = e.target.closest('.tier-row');
  if (item && !picked) { picked = item.dataset.key; draw(); return; }
  if (item && picked === item.dataset.key) { picked = null; draw(); return; }
  if (row && picked) place(picked, row.dataset.tier, item?.dataset.key);
});
$('tiers').addEventListener('dragstart', e => {
  const item = e.target.closest('.tier-item');
  if (!item) return;
  dragged = item.dataset.key;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', item.title);
  requestAnimationFrame(() => item.classList.add('dragging'));
});
$('tiers').addEventListener('dragover', e => {
  const row = e.target.closest('.tier-row');
  if (!dragged || !row) return;
  e.preventDefault();
  document.querySelectorAll('.tier-row.over').forEach(r => r !== row && r.classList.remove('over'));
  row.classList.add('over');
});
$('tiers').addEventListener('drop', e => {
  const row = e.target.closest('.tier-row');
  if (!dragged || !row) return;
  e.preventDefault();
  const before = e.target.closest('.tier-item');
  place(dragged, row.dataset.tier, before && before.dataset.key !== dragged ? before.dataset.key : undefined);
});
$('tiers').addEventListener('dragend', () => { dragged = null; document.querySelectorAll('.tier-row.over, .tier-item.dragging').forEach(el => el.classList.remove('over', 'dragging')); });
addEventListener('keydown', e => { if (e.key === 'Escape' && picked) { picked = null; draw(); } });

$('tierCopy').onclick = async () => {
  if (!state) return;
  const byKey = new Map(sheet.shows.map(s => [keyOf(s), s]));
  const season = $('tierSeason').selectedOptions[0]?.textContent || '';
  const lines = TIERS.filter(t => state[t].length).map(t => `**${t}:** ${state[t].map(k => titleOf(byKey.get(k))).join(', ')}`);
  if (!lines.length) { notice('Noch nichts eingeordnet.'); return; }
  const text = `Tier-Liste ${season} · ${$('tierPerson').value}\n${lines.join('\n')}`;
  try { await navigator.clipboard.writeText(text); notice('Kopiert. Einfach in Discord einfügen.'); }
  catch { notice('Kopieren ging nicht (der Browser hat es nicht erlaubt).'); }
};
let resetArmed = 0;
$('tierReset').onclick = () => {
  if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); notice('Nochmal tippen, um alles zurückzusetzen.'); return; }
  resetArmed = 0;
  try { localStorage.removeItem(storeKey()); } catch {}
  draw();
  notice('Zurückgesetzt.');
};
start().catch(e => { $('tiers').innerHTML = `<div class="status">Die Tier-Liste konnte nicht geladen werden (${esc(e.message)}).</div>`; });
