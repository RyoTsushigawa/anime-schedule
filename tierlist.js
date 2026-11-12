// Tier-Liste: sort a season's shows from the Guckplan into S–D. Personal and kept in this browser
// (localStorage "tierlist:<tab>:<person>"); "Für Discord kopieren" shares it as text.
'use strict';
const DEFAULT_TIERS = ['S','A','B','C','D'].map(id => ({ id, name:id }));
const TIER_COLORS = ['#e5484d','#f0883e','#e2b93b','#46a758','#3e8ed0','#9566d9','#c0679d','#188c90','#b97740','#748096','#6b9b53','#8a74bf'];
const MAX_TIERS = 12;
let tiers = DEFAULT_TIERS.map(t => ({...t}));
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
const layoutKey = () => storeKey() + ':rows';
function normalizedTiers(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_TIERS) return DEFAULT_TIERS.map(t=>({...t}));
  const ids=new Set();
  const result=[];
  for(const tier of value){
    if(!tier || typeof tier.id!=='string' || !/^[A-Za-z0-9_-]{1,30}$/.test(tier.id) ||
       tier.id===POOL || ids.has(tier.id) || typeof tier.name!=='string') return DEFAULT_TIERS.map(t=>({...t}));
    ids.add(tier.id);
    result.push({id:tier.id,name:tier.name.trim().slice(0,30)||tier.id});
  }
  return result;
}
function prepareTierState(saved, tierIds, shows) {
  const allIds=new Set(shows.map(keyOf));
  const valid=[...tierIds,POOL];
  const state=Object.fromEntries(valid.map(t=>[t,[]]));
  const used=new Set();
  for(const t of valid) for(const key of Array.isArray(saved[t])?saved[t]:[]){
    if(typeof key!=='string'||!allIds.has(key)||used.has(key))continue;
    used.add(key);state[t].push(key);
  }
  for(const [t,keys] of Object.entries(saved)) if(!valid.includes(t)&&Array.isArray(keys))
    for(const key of keys) if(typeof key==='string'&&allIds.has(key)&&!used.has(key)){
      used.add(key);state[POOL].push(key);
    }
  for(const show of shows) if(!used.has(keyOf(show)))state[POOL].push(keyOf(show));
  return state;
}
function removeTierFromRanking(saved,id) {
  const result={...saved};
  result[POOL]=[...(Array.isArray(result[POOL])?result[POOL]:[]),
    ...(Array.isArray(result[id])?result[id]:[])].filter((key,i,all)=>all.indexOf(key)===i);
  delete result[id];
  return result;
}
function loadTiers() {tiers=normalizedTiers(load(layoutKey(),null));drawTierEditor();}
function persistTiers(){save(layoutKey(),tiers);drawTierEditor();draw();}
function drawTierEditor(){
  $('tierEditorRows').innerHTML=tiers.map((tier,i)=>
    `<div class="tier-editor-entry">
      <label><span class="sr-only">Name der Reihe ${i+1}</span><input data-tier-name="${esc(tier.id)}" maxlength="30" aria-label="Name der Reihe ${i+1}" value="${esc(tier.name)}"></label>
      <button type="button" class="pill tier-remove" data-tier-remove="${esc(tier.id)}" aria-label="Reihe ${esc(tier.name)} entfernen" ${tiers.length===1?'disabled':''}>Entfernen</button>
    </div>`).join('');
  $('tierAdd').disabled=tiers.length>=MAX_TIERS;
}

async function start() {
  try { streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json(); } catch {}
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  const now = Date.now();
  const current = tabFor(tabs, now);
  $('tierSeason').innerHTML = tabs.map(t => `<option value="${esc(t.gid)}"${t === current ? ' selected' : ''}>${esc(t.name.replace(/^Guckplan\s+/i, ''))}</option>`).join('');
  $('tierSeason').onchange = loadSeason;
  $('tierPerson').onchange = () => { try { localStorage.setItem('tierPerson', $('tierPerson').value); } catch {} picked=null;loadTiers();draw(); };
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
  picked=null;
  loadTiers();
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
  state = prepareTierState(saved,tiers.map(t=>t.id),sheet.shows);
  const tile = key => {
    const s = byKey.get(key), cover = covers.get(key);
    return `<button type="button" class="tier-item${picked === key ? ' picked' : ''}" draggable="true" data-key="${esc(key)}" title="${esc(titleOf(s))}">
      ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" draggable="false">` : `<span class="tier-noimg">${esc(titleOf(s).slice(0, 2))}</span>`}
      <span class="tier-title">${esc(titleOf(s))}</span></button>`;
  };
  const row = (id,label,color) => `<section class="tier-row${id===POOL?' tier-pool':''}" data-tier="${esc(id)}" style="--tier:${color}">
    <div class="tier-label" title="${esc(label)}">${esc(label)}</div>
    <div class="tier-items" data-tier="${esc(id)}">${state[id].filter(key=>byKey.has(key)).map(tile).join('') || (id===POOL?'<span class="tier-empty">Alles eingeordnet.</span>':'')}</div></section>`;
  $('tiers').innerHTML = shows.length ? tiers.map((t,i)=>row(t.id,t.name,TIER_COLORS[i])).join('')+row(POOL,'Noch offen','var(--muted)')
    : `<div class="status">${esc($('tierPerson').value)} hat in dieser Season noch keine Serie gewählt.</div>`;
}
function place(key, tier, beforeKey) {
  for (const t of Object.keys(state)) state[t] = state[t].filter(k => k !== key);
  const list = state[tier];
  const at = beforeKey ? list.indexOf(beforeKey) : -1;
  list.splice(at < 0 ? list.length : at, 0, key);
  save(storeKey(),state);
  picked = null;
  draw();
}
$('tierEditorRows').addEventListener('change',e=>{
  const input=e.target.closest('[data-tier-name]');
  if(!input)return;
  const tier=tiers.find(t=>t.id===input.dataset.tierName);
  if(!tier)return;
  tier.name=input.value.trim().slice(0,30)||tier.name;
  persistTiers();
});
$('tierEditorRows').addEventListener('click',e=>{
  const button=e.target.closest('[data-tier-remove]');
  if(!button || tiers.length<=1)return;
  const id=button.dataset.tierRemove;
  const current=tiers.find(t=>t.id===id);
  if(!current)return;
  save(storeKey(),removeTierFromRanking(load(storeKey(),{}),id));
  tiers=tiers.filter(t=>t.id!==id);
  picked=null;
  persistTiers();
  notice('Reihe „'+current.name+'“ entfernt. Ihre Serien sind unter „Noch offen“.');
});
$('tierAdd').onclick=()=>{
  if(tiers.length>=MAX_TIERS)return;
  const ids=new Set(tiers.map(t=>t.id));
  let i=1;while(ids.has('extra'+i))i++;
  tiers.push({id:'extra'+i,name:'Neue Reihe'});
  persistTiers();
  $('tierEditorRows').querySelector('[data-tier-name="extra'+i+'"]')?.focus();
};
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
  const lines = tiers.filter(t => state[t.id]?.some(k=>byKey.has(k))).map(t => `**${t.name}:** ${state[t.id].filter(k=>byKey.has(k)).map(k => titleOf(byKey.get(k))).join(', ')}`);
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
