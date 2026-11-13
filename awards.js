'use strict';
// Seasonal Anime Awards: 22 categories like the Crunchyroll Anime Awards, Eurovision points (12, 10, 8 for
// three places per category), a Ceddl of the Year from candidates collected over the season. With the votes helper
// (config.json previewVotesUrl, workers/season-votes) the ballots are shared and stay secret until someone
// presses "Auflösen"; then everyone sees the winners and voting closes. Without it, the ballot stays in this
// browser and can be copied for Discord. Each person's picks are also kept locally as a draft.

// Categories like the Crunchyroll Anime Awards, in groups. The kind decides what can be picked: a show from
// the Guckplan (genre or new/sequel filters when AniList knows the show), a character of the season's shows
// ("Name (Anime)"), a couple of two characters, or a Ceddl candidate collected over the season.
const AWARD_GROUPS = [
  ['Hauptpreise', [['best', 'Anime der Season'], ['new', 'Beste neue Serie', 'new'], ['sequel', 'Beste Fortsetzung', 'sequel'],
    ['surprise', 'Größte Überraschung'], ['finale', 'Bestes Finale']]],
  ['Genres', [['action', 'Bester Action-Anime', 'genre:Action'], ['comedy', 'Beste Comedy', 'genre:Comedy'], ['romance', 'Beste Romanze', 'genre:Romance'],
    ['drama', 'Bestes Drama', 'genre:Drama'], ['fantasy', 'Bestes Fantasy / Isekai', 'genre:Fantasy'], ['sliceoflife', 'Bestes Slice of Life', 'genre:Slice of Life']]],
  ['Figuren', [['protagonist', 'Beste Hauptfigur', 'char:MAIN'], ['supporting', 'Beste Nebenfigur', 'char:SUPPORTING'],
    ['villain', 'Bester Bösewicht', 'char'], ['couple', 'Bestes Paar', 'couple']]],
  ['Handwerk', [['animation', 'Beste Animation'], ['soundtrack', 'Bester Soundtrack'], ['design', 'Bestes Charakterdesign'],
    ['fight', 'Beste Kampfszene'], ['opening', 'Bestes Opening'], ['ending', 'Bestes Ending']]],
  ['Ceddl of the Year', [['ceddl', 'Ceddl of the Year', 'ceddl']]],
];
const awardCategories = AWARD_GROUPS.flatMap(([, list]) => list);
// Eurovision style: three places per category
const POINTS = [12, 10, 8];
// the show after "Auflösen": the big ones last
const REVEAL_ORDER = [...awardCategories.filter(([id]) => id !== 'best' && id !== 'ceddl'), ...awardCategories.filter(([id]) => id === 'ceddl'), ...awardCategories.filter(([id]) => id === 'best')];

const seasonSelect = $('awardsSeason');
const personSelect = $('awardsPerson');
const ballotElement = $('awardsBallot');
const copyButton = $('awardsCopy');
const awardsStatus = $('awardsStatus');
let nominees = new Map();
let ballot = {};
let seasonRequest = 0;
let people = [];
// A Guckplan column shared by two people still gives each of them a ballot of their own
const BALLOT_PEOPLE = { MaRyo: ['Marvin', 'Ryo'] };
const voters = names => names.flatMap(name => BALLOT_PEOPLE[name] || [name]);
let voteApi = '';
// only for yourself: your AniList login or your PIN goes with the ballot (identity.js)
const ID = typeof Identity === 'undefined' ? null : Identity;
const drawIdentity = () => { if (ID && $('awardsIdentity')) ID.draw($('awardsIdentity'), revealed() ? '' : personSelect.value, () => drawShared()); };
let shared = null; // the helper's answer for this season: { revealed, voters, ballots? } or { error }
let showInfo = new Map(); // title → { genres, sequel, chars: [{ name, role }] } from AniList, when reachable
let ceddl = []; // Ceddl of the Year candidates: [{ id, name, anime, by }]

function ballotKey() {
  return 'seasonal-awards:' + JSON.stringify([SHEET_ID, seasonSelect.value, personSelect.value]);
}
const seasonName = () => seasonSelect.selectedOptions[0]?.textContent || '';
const revealed = () => !!shared?.revealed;
const picksOf = value => (Array.isArray(value) ? value : value ? [value] : []).map(v => String(v || ''));

// what a category offers
const charLabel = (c, title) => `${c.name} (${title})`;
function optionsFor(kind) {
  const titles = [...nominees.values()];
  if (!kind) return titles;
  if (kind === 'new' || kind === 'sequel') return titles.filter(t => { const i = showInfo.get(t); return !i || i.sequel === null || i.sequel === (kind === 'sequel'); });
  if (kind.startsWith('genre:')) { const g = kind.slice(6); return titles.filter(t => { const i = showInfo.get(t); return !i?.genres?.length || i.genres.includes(g) || (g === 'Fantasy' && i.genres.includes('Isekai')); }); }
  if (kind.startsWith('char') || kind === 'couple') {
    const role = kind.split(':')[1];
    return titles.flatMap(t => (showInfo.get(t)?.chars || []).filter(c => !role || c.role === role).map(c => charLabel(c, t)));
  }
  if (kind === 'ceddl') return ceddl.map(c => c.anime ? `${c.name} (${c.anime})` : c.name);
  return titles;
}
const valid = (kind, value) => {
  if (!value) return true;
  if (kind === 'couple') { const parts = value.split(' × '); return parts.length === 2 && parts.every(p => optionsFor('char').includes(p) || (!showInfo.size && p.trim())); }
  // characters without AniList: free text is allowed, the voters agree on the spelling themselves
  if (kind?.startsWith('char') && !showInfo.size) return true;
  return optionsFor(kind).includes(value);
};

function ballotSummary() {
  return awardCategories.flatMap(([id, label]) => {
    const list = (ballot[id] || []).map((v, i) => v && `${POINTS[i]} ${v}`).filter(Boolean);
    return list.length ? [label + ': ' + list.join(' · ')] : [];
  });
}

// Points per category: 12 / 10 / 8 by place; ties go to more 12s, then more 10s (as at the Eurovision)
function awardsResults(ballots) {
  return awardCategories.map(([id, label]) => {
    const score = new Map();
    for (const b of ballots || []) picksOf(b.picks?.[id]).forEach((title, i) => {
      if (!title || i >= POINTS.length) return;
      const s = score.get(title) || { points: 0, places: [0, 0, 0] };
      s.points += POINTS[i]; s.places[i]++; score.set(title, s);
    });
    const ranked = [...score].sort((a, b) => b[1].points - a[1].points || b[1].places[0] - a[1].places[0] || b[1].places[1] - a[1].places[1] || a[0].localeCompare(b[0], 'de'))
      .map(([title, s]) => [title, s.points]);
    return { id, label, ranked, top: ranked[0]?.[1] || 0 };
  });
}
const winnersOf = r => r.ranked.length ? [r.ranked[0][0]] : [];
function resultsText() {
  const lines = awardsResults(shared?.ballots).filter(r => r.ranked.length).map(r =>
    '**' + r.label + ':** ' + winnersOf(r).join(' / ') + ' (' + r.top + ' Punkte)');
  return ['🏆 Seasonal Anime Awards · ' + seasonName(), ...lines].join('\n');
}

function updateAwardsCopy() {
  copyButton.disabled = revealed() ? false : !ballotSummary().length;
  copyButton.textContent = revealed() ? 'Ergebnis für Discord kopieren' : 'Für Discord kopieren';
  $('awardsManual').hidden = true;
  const submit = $('awardsSubmit');
  if (submit) submit.disabled = !ballotSummary().length || (!!ID && !ID.canAct(personSelect.value));
  const filled = awardCategories.filter(([id]) => (ballot[id] || []).some(Boolean)).length;
  $('awardsProgress').textContent = `${filled} von ${awardCategories.length} Kategorien ausgefüllt`;
}
function saveDraft() {
  try {
    localStorage.setItem(ballotKey(), JSON.stringify(ballot));
    awardsStatus.textContent = voteApi ? 'Entwurf gespeichert · mit „Stimme abgeben“ zählt er.' : 'Stimmzettel gespeichert.';
  } catch {
    awardsStatus.textContent = 'Speichern ist in diesem Browser gerade nicht möglich.';
  }
  updateAwardsCopy();
}
// one list of choices per kind, shared by the inputs (typing searches it)
function drawLists() {
  const box = $('awardsLists');
  box.replaceChildren(...[...new Set(awardCategories.map(([, , kind]) => kind || 'show'))].map(kind => {
    const list = document.createElement('datalist');
    list.id = 'awardsList-' + kind.replace(/\W+/g, '-');
    for (const value of optionsFor(kind === 'show' ? undefined : kind === 'couple' ? 'char' : kind)) list.append(new Option(value));
    return list;
  }));
}
const listId = kind => 'awardsList-' + (kind || 'show').replace(/\W+/g, '-');
function renderBallot() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ballotKey())); } catch {}
  ballot = {};
  for (const [id, , kind] of awardCategories) {
    const list = picksOf(saved?.[id]).slice(0, 3).map(v => nominees.has(v) ? nominees.get(v) : v);
    if (list.some(Boolean)) ballot[id] = list;
  }
  drawLists();
  ballotElement.replaceChildren();
  for (const [group, list] of AWARD_GROUPS) {
    const block = document.createElement('details'); block.className = 'awards-block'; block.open = true;
    const summary = document.createElement('summary'); summary.textContent = group; block.append(summary);
    const grid = document.createElement('div'); grid.className = 'awards-cats';
    for (const [id, name, kind] of list) {
      const box = document.createElement('fieldset'); box.className = 'awards-cat'; box.dataset.category = id;
      const legend = document.createElement('legend'); legend.textContent = name; box.append(legend);
      if (kind === 'ceddl' && !ceddl.length) { const p = document.createElement('p'); p.className = 'awards-hint'; p.textContent = 'Noch keine Kandidaten: unten welche sammeln.'; box.append(p); }
      else if (kind && kind !== 'couple' && showInfo.size && !optionsFor(kind).length) { const p = document.createElement('p'); p.className = 'awards-hint'; p.textContent = 'Diese Season passt laut AniList keine Serie: einfach leer lassen.'; box.append(p); }
      POINTS.forEach((points, place) => {
        const row = document.createElement('label'); row.className = 'awards-place';
        const badge = document.createElement('span'); badge.className = 'awards-points'; badge.textContent = points;
        row.append(badge);
        const current = ballot[id]?.[place] || '';
        const inputs = (kind === 'couple' ? [0, 1] : [0]).map(part => {
          const input = document.createElement('input');
          input.className = 'pill'; input.setAttribute('list', listId(kind === 'couple' ? 'char' : kind));
          input.placeholder = kind === 'couple' ? (part ? 'und …' : 'Figur …') : place ? 'optional' : 'Tippen zum Suchen …';
          input.setAttribute('aria-label', `${name}: ${points} Punkte${kind === 'couple' ? (part ? ', zweite Figur' : ', erste Figur') : ''}`);
          input.value = kind === 'couple' ? (current.split(' × ')[part] || '') : current;
          return input;
        });
        const update = () => {
          const value = kind === 'couple' ? (inputs.every(i => i.value.trim()) ? inputs.map(i => i.value.trim()).sort((a, b) => a.localeCompare(b, 'de')).join(' × ') : '') : inputs[0].value.trim();
          const others = (ballot[id] || []).filter((v, i) => i !== place);
          const bad = !valid(kind, value) ? 'Nicht in der Auswahl' : value && others.includes(value) ? 'Schon auf einem anderen Platz' : '';
          inputs.forEach(i => { i.classList.toggle('bad', !!bad); i.title = bad; i.setAttribute('aria-invalid', !!bad); });
          const next = [...(ballot[id] || ['', '', ''])];
          while (next.length < 3) next.push('');
          next[place] = bad ? '' : value;
          if (next.some(Boolean)) ballot[id] = next.slice(0, next.findLastIndex(Boolean) + 1); else delete ballot[id];
          saveDraft();
        };
        inputs.forEach(i => { i.onchange = update; });
        if (kind === 'couple') { const x = document.createElement('span'); x.className = 'awards-x'; x.textContent = '×'; row.append(inputs[0], x, inputs[1]); }
        else row.append(inputs[0]);
        box.append(row);
      });
      grid.append(box);
    }
    block.append(grid); ballotElement.append(block);
  }
  updateAwardsCopy();
}

// AniList (optional): genres, whether a show is a sequel, and its characters, for the filters and the character
// categories. AniList ids come from the site's streams-de.json; kept a day per season in this browser.
async function loadShowInfo(request) {
  const key = 'awardsInfo:' + seasonSelect.value;
  try {
    const kept = JSON.parse(localStorage.getItem(key) || 'null');
    if (kept && Date.now() - kept.at < 864e5) return new Map(kept.info);
  } catch {}
  const streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json();
  const ids = new Map();
  for (const [id, s] of Object.entries(streams.status || {})) for (const t of s.titles || []) ids.set(norm(t), Number(id));
  const wanted = new Map();
  for (const [k, title] of nominees) { const id = ids.get(k) || ids.get(norm(title)); if (id) wanted.set(id, title); }
  if (!wanted.size) return new Map();
  const query = 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id genres relations { edges { relationType } } characters(sort: [ROLE, RELEVANCE], perPage: 10) { edges { role node { name { full } } } } } } }';
  const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables: { ids: [...wanted.keys()].slice(0, 50) } }) });
  if (!res.ok) throw new Error('AniList ' + res.status);
  const info = new Map();
  for (const m of (await res.json()).data?.Page?.media || []) info.set(wanted.get(m.id), {
    genres: m.genres || [], sequel: (m.relations?.edges || []).some(e => e.relationType === 'PREQUEL'),
    chars: (m.characters?.edges || []).map(e => ({ name: e.node?.name?.full, role: e.role })).filter(c => c.name),
  });
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), info: [...info] })); } catch {}
  return info;
}

// Ceddl of the Year: candidates collected over the season, shared through the votes helper
async function loadCeddl() {
  if (!voteApi) return;
  try { ceddl = (await awardsCall('/awards/ceddl?season=' + encodeURIComponent(seasonName()))).candidates || []; } catch { ceddl = []; }
}
function drawCeddl() {
  const box = $('awardsCeddl');
  box.hidden = !voteApi || revealed();
  if (box.hidden) return;
  const list = $('awardsCeddlList');
  list.replaceChildren(...(ceddl.length ? ceddl.map(c => {
    const li = document.createElement('li');
    const name = document.createElement('b'); name.textContent = c.name;
    const meta = document.createElement('small'); meta.textContent = [c.anime, c.by && 'von ' + c.by].filter(Boolean).join(' · ');
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pill'; remove.textContent = '✕';
    remove.title = 'Kandidat entfernen'; remove.dataset.ceddlRemove = c.id;
    li.append(name, meta, remove); return li;
  }) : [Object.assign(document.createElement('li'), { className: 'awards-hint', textContent: 'Noch niemand nominiert.' })]));
}
async function changeCeddl(path, body) {
  $('awardsCeddlMsg').textContent = 'Wird gespeichert …';
  try {
    ceddl = (await awardsCall(path, { season: seasonName(), ...body })).candidates || ceddl;
    $('awardsCeddlMsg').textContent = '';
    drawCeddl(); drawLists();
    if (!ballotElement.hidden) { const open = document.activeElement; renderBallot(); open?.focus?.(); }
  } catch (e) { $('awardsCeddlMsg').textContent = 'Nicht gespeichert: ' + e.message; }
}
$('awardsCeddlAdd').onclick = () => {
  let name = $('awardsCeddlName').value.trim(), anime = $('awardsCeddlAnime').value.trim();
  const picked = name.match(/^(.*) \((.*)\)$/);
  if (picked && !anime) [, name, anime] = picked;
  if (!name) { $('awardsCeddlMsg').textContent = 'Erst den Namen der Figur eintragen.'; return; }
  $('awardsCeddlName').value = $('awardsCeddlAnime').value = '';
  changeCeddl('/awards/ceddl', { name, anime, by: personSelect.value });
};
$('awardsCeddlList').addEventListener('click', e => {
  const b = e.target.closest('[data-ceddl-remove]');
  if (b && confirm('Diesen Kandidaten entfernen?')) changeCeddl('/awards/ceddl/remove', { id: b.dataset.ceddlRemove });
});

// The shared part: who has voted, the buttons, and after "Auflösen" the results
async function awardsCall(path, body, person = '') {
  let code = '';
  try { code = sessionStorage.getItem('previewGroupCode') || ''; } catch {}
  const response = await fetch(voteApi + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(person && ID && ID.headers(person)), ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Gruppencode fehlt: einmal in der Season Preview eingeben' : data.error || 'Fehler ' + response.status);
  return data;
}
async function loadShared() {
  if (!voteApi) { drawShared(); return; }
  const season = seasonName(), request = seasonRequest;
  try { const state = await awardsCall('/awards?season=' + encodeURIComponent(season)); if (request === seasonRequest) shared = state; }
  catch (e) { if (request === seasonRequest) shared = { error: e.message }; }
  if (request === seasonRequest) drawShared();
}
const chip = (text, cls) => { const s = document.createElement('span'); s.className = 'awards-chip' + (cls ? ' ' + cls : ''); s.textContent = text; return s; };
function drawShared() {
  const box = $('awardsGroup'), results = $('awardsResults');
  box.hidden = !voteApi; results.hidden = !revealed();
  ballotElement.hidden = $('awardsIntro').hidden = $('awardsProgress').hidden = revealed();
  if ($('awardsIdentity')) $('awardsIdentity').hidden = revealed() || !voteApi;
  personSelect.closest('label').hidden = revealed();
  drawCeddl();
  if (!voteApi) return;
  box.replaceChildren();
  if (!shared) { box.append(chip('Lade die gemeinsame Abstimmung…', 'muted')); return; }
  if (shared.error) { box.append(chip('Gemeinsame Abstimmung gerade nicht erreichbar: ' + shared.error, 'muted')); return; }
  const voted = new Set(shared.voters || []);
  const row = document.createElement('div'); row.className = 'awards-voters';
  row.append(chip(revealed() ? 'Abgestimmt haben' : voted.size ? 'Abgestimmt' : 'Noch hat niemand abgestimmt', 'label'));
  for (const name of [...voted]) row.append(chip('✓ ' + name, 'done'));
  if (!revealed()) for (const name of people.filter(p => !voted.has(p))) row.append(chip(name, 'open'));
  box.append(row);
  if (!revealed()) {
    const actions = document.createElement('div'); actions.className = 'awards-actions';
    const submit = document.createElement('button'); submit.type = 'button'; submit.id = 'awardsSubmit'; submit.className = 'pill primary';
    submit.textContent = voted.has(personSelect.value) ? 'Stimme ändern' : 'Stimme abgeben';
    const confirmed = !ID || ID.canAct(personSelect.value);
    submit.disabled = !ballotSummary().length || !confirmed;
    if (!confirmed) submit.title = 'Erst oben bestätigen, dass du ' + personSelect.value + ' bist';
    submit.onclick = submitBallot;
    const reveal = document.createElement('button'); reveal.type = 'button'; reveal.id = 'awardsReveal'; reveal.className = 'pill';
    reveal.textContent = 'Auflösen'; reveal.disabled = !voted.size;
    reveal.title = 'Zeigt allen die Gewinner. Danach kann niemand mehr abstimmen.';
    reveal.onclick = revealAwards;
    actions.append(submit, reveal);
    box.append(actions);
    return;
  }
  drawResults();
}

// After "Auflösen": the show, Eurovision style. One category at a time, voter by voter: 8, 10, then
// „… und unsere 12 Punkte gehen an …“, with the scoreboard sorting itself. Below, every result at once.
let show = null;
function seededOrder(names, seed) {
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return names.map(n => { let x = h; for (const c of n) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return [x >>> 0, n]; }).sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}
function showSteps(id) {
  const ballots = shared?.ballots || [];
  const order = seededOrder(ballots.map(b => b.person), seasonName() + ':' + id);
  return order.flatMap(person => {
    const picks = picksOf(ballots.find(b => b.person === person)?.picks?.[id]);
    return [2, 1, 0].filter(i => picks[i]).map(i => ({ person, points: POINTS[i], pick: picks[i] }));
  });
}
function drawShow() {
  const [id, label] = REVEAL_ORDER[show.cat];
  const steps = showSteps(id), done = steps.slice(0, show.step);
  const score = new Map();
  for (const s of done) score.set(s.pick, (score.get(s.pick) || 0) + s.points);
  const board = [...score].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  const last = done[done.length - 1];
  $('awardsShowCat').textContent = `${show.cat + 1} / ${REVEAL_ORDER.length} · ${label}`;
  $('awardsShowPick').value = String(show.cat);
  $('awardsShowLine').textContent = !steps.length ? 'In dieser Kategorie hat niemand abgestimmt.'
    : !last ? 'Gleich geht es los …'
    : last.points === 12 ? `${last.person}: „… und unsere 12 Punkte gehen an … ${last.pick}!“` : `${last.person}: ${last.points} Punkte an ${last.pick}`;
  const finished = show.step >= steps.length;
  const list = $('awardsShowBoard');
  list.replaceChildren(...board.map(([title, points], i) => {
    const li = document.createElement('li');
    if (finished && i === 0) li.className = 'winner';
    if (last?.pick === title) li.classList.add('fresh');
    const name = document.createElement('span'); name.textContent = title;
    const bar = document.createElement('i'); bar.style.width = Math.round(points / (board[0][1] || 1) * 100) + '%';
    const pts = document.createElement('b'); pts.textContent = points;
    li.append(name, bar, pts); return li;
  }));
  const more = nextCategory(show.cat) !== null;
  $('awardsShowNext').textContent = finished ? (more ? 'Nächste Kategorie ▸' : 'Fertig') : 'Nächste Wertung ▸';
  $('awardsShowNext').disabled = finished && !more;
  $('awardsShowAll').disabled = finished;
}
// the next category somebody voted in (empty ones are skipped in the show)
function nextCategory(from) {
  for (let i = from + 1; i < REVEAL_ORDER.length; i++) if (showSteps(REVEAL_ORDER[i][0]).length) return i;
  return null;
}
function drawResults() {
  const box = $('awardsResults');
  if (!show || show.season !== seasonName()) show = { season: seasonName(), cat: nextCategory(-1) ?? 0, step: 0 };
  $('awardsShow').hidden = false;
  drawShow();
  const grid = $('awardsResultGrid');
  grid.replaceChildren();
  for (const r of awardsResults(shared.ballots)) {
    const card = document.createElement('section'); card.className = 'awards-result';
    const title = document.createElement('h3'); title.textContent = r.label; card.append(title);
    if (!r.ranked.length) { card.append(chip('Keine Stimmen', 'muted')); grid.append(card); continue; }
    const list = document.createElement('ol');
    r.ranked.forEach(([name, n], i) => {
      const li = document.createElement('li'); if (i === 0) li.className = 'winner';
      const b = document.createElement('span'); b.textContent = name;
      const c = document.createElement('small'); c.textContent = n + ' Punkte';
      li.append(b, c); list.append(li);
    });
    card.append(list); grid.append(card);
  }
  const ballots = $('awardsBallotsList');
  ballots.replaceChildren();
  for (const b of shared.ballots || []) {
    const p = document.createElement('p');
    const who = document.createElement('b'); who.textContent = b.person + ': ';
    p.append(who, awardCategories.filter(([id]) => picksOf(b.picks?.[id]).some(Boolean)).map(([id, label]) =>
      label + ' ' + picksOf(b.picks[id]).map((v, i) => v && `${POINTS[i]} ${v}`).filter(Boolean).join(', ')).join(' · '));
    ballots.append(p);
  }
  box.hidden = false;
}
$('awardsShowNext').onclick = () => {
  const steps = showSteps(REVEAL_ORDER[show.cat][0]);
  if (show.step < steps.length) show.step++;
  else if (nextCategory(show.cat) !== null) { show.cat = nextCategory(show.cat); show.step = 0; }
  drawShow();
};
$('awardsShowAll').onclick = () => { show.step = showSteps(REVEAL_ORDER[show.cat][0]).length; drawShow(); };
$('awardsShowPick').onchange = () => { show.cat = Number($('awardsShowPick').value); show.step = 0; drawShow(); };
$('awardsShowPick').replaceChildren(...REVEAL_ORDER.map(([, label], i) => new Option(label, i)));

async function submitBallot() {
  const picks = Object.fromEntries(awardCategories.flatMap(([id]) => (ballot[id] || []).some(Boolean) ? [[id, ballot[id]]] : []));
  const button = $('awardsSubmit'); button.disabled = true;
  awardsStatus.textContent = 'Wird abgegeben…';
  try {
    await awardsCall('/awards/ballot', { season: seasonName(), person: personSelect.value, picks }, personSelect.value);
    awardsStatus.textContent = 'Stimme von ' + personSelect.value + ' abgegeben. Bis zum Auflösen sieht sie niemand.';
    shared = { ...shared, voters: [...new Set([...(shared?.voters || []), personSelect.value])] };
    drawShared();
  } catch (e) { awardsStatus.textContent = 'Nicht abgegeben: ' + e.message; button.disabled = false; }
}
async function revealAwards() {
  const missing = people.filter(p => !(shared?.voters || []).includes(p));
  if (!confirm('Jetzt auflösen? Alle sehen dann die Gewinner, und niemand kann mehr abstimmen.' + (missing.length ? '\n\nNoch nicht abgestimmt: ' + missing.join(', ') : ''))) return;
  awardsStatus.textContent = 'Wird aufgelöst…';
  try { await awardsCall('/awards/reveal', { season: seasonName() }); awardsStatus.textContent = ''; await loadShared(); }
  catch (e) { awardsStatus.textContent = 'Nicht aufgelöst: ' + e.message; }
}

async function loadAwardsSeason(tab) {
  const request = ++seasonRequest;
  const wanted = personSelect.value;
  personSelect.disabled = true;
  ballotElement.replaceChildren();
  copyButton.disabled = true;
  $('awardsManual').hidden = true;
  shared = null; showInfo = new Map(); ceddl = [];
  awardsStatus.textContent = 'Lade Guckplan…';
  try {
    const plan = await loadPlan(tab);
    if (request !== seasonRequest) return;
    const titles = plan.shows.filter(show => !show.hidden)
      .map(show => [norm(show.romaji || show.english), show.english || show.romaji])
      .filter(([key]) => key)
      .sort((a, b) => a[1].localeCompare(b[1], 'de'));
    nominees = new Map(titles);
    people = voters(plan.people);
    personSelect.replaceChildren(...people.map(name => new Option(name, name)));
    if (people.includes(wanted)) personSelect.value = wanted;
    // your own name first when your AniList login is in this browser
    else if (ID) { await ID.ready; const mine = ID.myPeople().find(p => people.includes(p)); if (mine) personSelect.value = mine; }
    if (!nominees.size || !people.length) {
      awardsStatus.textContent = 'Für diese Season ist kein Stimmzettel verfügbar.';
      return;
    }
    personSelect.disabled = false;
    awardsStatus.textContent = '';
    if (ID) await ID.ready;
    drawIdentity();
    renderBallot();
    drawShared();
    loadShared();
    // characters, genres and the Ceddl candidates fill in when they arrive
    Promise.allSettled([loadShowInfo(request).then(info => { if (request === seasonRequest) showInfo = info; }), loadCeddl()]).then(() => {
      if (request !== seasonRequest) return;
      drawCeddl();
      if (!revealed()) renderBallot(); else drawLists();
    });
  } catch {
    if (request === seasonRequest) awardsStatus.textContent = 'Der Guckplan konnte nicht geladen werden.';
  }
}

personSelect.onchange = () => {
  awardsStatus.textContent = '';
  drawIdentity();
  renderBallot();
  drawShared();
};

copyButton.onclick = async () => {
  const text = revealed() ? resultsText()
    : ['Seasonal Anime Awards · ' + seasonName() + ' · ' + personSelect.value, ...ballotSummary()].join('\n');
  const request = seasonRequest;
  const copiedBallot = ballot;
  try {
    await navigator.clipboard.writeText(text);
    if (request === seasonRequest && copiedBallot === ballot) awardsStatus.textContent = revealed() ? 'Ergebnis kopiert.' : 'Stimmzettel kopiert.';
  } catch {
    if (request !== seasonRequest || copiedBallot !== ballot) return;
    $('awardsManual').hidden = false;
    const field = $('awardsText');
    field.value = text;
    field.focus();
    field.select();
  }
};

// N84 Ruhmeshalle: the winners of every revealed season, and who most often picked a winner
let hallTabs = [], hallLoaded = false;
async function drawHall() {
  const body = $('awardsHallBody');
  const seasons = [];
  let failed = 0;
  for (const tab of hallTabs) {
    const season = tab.name.replace(/^Guckplan\s+/i, '');
    try { const s = await awardsCall('/awards?season=' + encodeURIComponent(season)); if (s.revealed) seasons.push({ season, ballots: s.ballots || [] }); } catch { failed++; }
  }
  body.replaceChildren();
  if (!seasons.length) {
    const p = document.createElement('p'); p.className = 'awards-hall-note';
    p.textContent = failed && failed === hallTabs.length ? 'Die Ruhmeshalle ist gerade nicht erreichbar. Später noch einmal öffnen.' : 'Noch keine Season aufgelöst.';
    body.append(p);
    if (failed === hallTabs.length) hallLoaded = false; // next opening tries again
    return;
  }
  const hits = new Map();
  for (const { season, ballots } of seasons) {
    const section = document.createElement('section'); section.className = 'awards-hall-season';
    const h = document.createElement('h3'); h.textContent = season; section.append(h);
    const list = document.createElement('ul');
    for (const r of awardsResults(ballots).filter(r => r.ranked.length)) {
      const winners = winnersOf(r);
      const li = document.createElement('li');
      const label = document.createElement('span'); label.textContent = r.label;
      const won = document.createElement('b'); won.textContent = winners.join(' / ');
      li.append(label, won); list.append(li);
      for (const b of ballots) if (winners.includes(picksOf(b.picks?.[r.id])[0])) hits.set(b.person, (hits.get(b.person) || 0) + 1);
    }
    section.append(list); body.append(section);
  }
  if (hits.size) {
    const top = [...hits].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
    const p = document.createElement('p'); p.className = 'awards-hall-note';
    p.textContent = 'Am häufigsten die 12 Punkte an den Gewinner gegeben: ' + top.slice(0, 5).map(([name, n]) => `${name} (${n})`).join(', ');
    body.prepend(p);
  }
}
async function startAwards() {
  if (typeof config === 'function') {
    const settings = await config().catch(() => ({}));
    if (typeof settings.previewVotesUrl === 'string' && /^https:\/\//.test(settings.previewVotesUrl))
      voteApi = settings.previewVotesUrl.replace(/\/$/, '');
  }
  let tabs;
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  const current = tabFor(tabs, Date.now()) || tabs[0];
  seasonSelect.replaceChildren(...tabs.map(tab => new Option(
    tab.name.replace(/^Guckplan\s+/i, ''), tab.gid
  )));
  seasonSelect.value = current.gid;
  hallTabs = tabs;
  $('awardsHall').hidden = !voteApi;
  $('awardsHall').addEventListener('toggle', () => { if ($('awardsHall').open && !hallLoaded) { hallLoaded = true; drawHall(); } });
  seasonSelect.disabled = false;
  seasonSelect.onchange = () => loadAwardsSeason(tabs[seasonSelect.selectedIndex]);
  await loadAwardsSeason(current);
}

startAwards();
