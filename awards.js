'use strict';
// Seasonal Anime Awards: everyone picks one anime from the Guckplan per category. With the votes helper
// (config.json previewVotesUrl, workers/season-votes) the ballots are shared and stay secret until someone
// presses "Auflösen"; then everyone sees the winners and voting closes. Without it, the ballot stays in this
// browser and can be copied for Discord. Each person's picks are also kept locally as a draft.

const awardCategories = [
  ['best', 'Anime der Season'],
  ['surprise', 'Größte Überraschung'],
  ['animation', 'Beste Animation'],
  ['opening', 'Bestes Opening'],
  ['ending', 'Bestes Ending'],
  ['finale', 'Bestes Finale']
];

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
let shared = null; // the helper's answer for this season: { revealed, voters, ballots? } or { error }

function ballotKey() {
  return 'seasonal-awards:' + JSON.stringify([SHEET_ID, seasonSelect.value, personSelect.value]);
}
const seasonName = () => seasonSelect.selectedOptions[0]?.textContent || '';
const revealed = () => !!shared?.revealed;

function ballotSummary() {
  return awardCategories.flatMap(([id, label]) =>
    nominees.has(ballot[id]) ? [label + ': ' + nominees.get(ballot[id])] : []);
}

// The winners per category: titles with their votes, most first (a tie means more than one winner)
function awardsResults(ballots) {
  return awardCategories.map(([id, label]) => {
    const counts = new Map();
    for (const b of ballots || []) { const title = b.picks?.[id]; if (title) counts.set(title, (counts.get(title) || 0) + 1); }
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
    return { id, label, ranked, top: ranked[0]?.[1] || 0 };
  });
}
function resultsText() {
  const lines = awardsResults(shared?.ballots).filter(r => r.ranked.length).map(r =>
    '**' + r.label + ':** ' + r.ranked.filter(([, n]) => n === r.top).map(([t]) => t).join(' / ') + ' (' + r.top + (r.top === 1 ? ' Stimme' : ' Stimmen') + ')');
  return ['🏆 Seasonal Anime Awards · ' + seasonName(), ...lines].join('\n');
}

function updateAwardsCopy() {
  copyButton.disabled = revealed() ? false : !ballotSummary().length;
  copyButton.textContent = revealed() ? 'Ergebnis für Discord kopieren' : 'Für Discord kopieren';
  $('awardsManual').hidden = true;
  const submit = $('awardsSubmit');
  if (submit) submit.disabled = !ballotSummary().length;
}

function renderBallot() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ballotKey())); } catch {}
  ballot = Object.fromEntries(awardCategories.flatMap(([id]) =>
    nominees.has(saved?.[id]) ? [[id, saved[id]]] : []));
  ballotElement.replaceChildren();
  for (const [id, name] of awardCategories) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.className = 'pill';
    select.add(new Option('Keine Auswahl', ''));
    for (const [key, title] of nominees) select.add(new Option(title, key));
    select.value = ballot[id] || '';
    select.onchange = () => {
      if (select.value) ballot[id] = select.value;
      else delete ballot[id];
      try {
        localStorage.setItem(ballotKey(), JSON.stringify(ballot));
        awardsStatus.textContent = voteApi ? 'Entwurf gespeichert · mit „Stimme abgeben“ zählt er.' : 'Stimmzettel gespeichert.';
      } catch {
        awardsStatus.textContent = 'Speichern ist in diesem Browser gerade nicht möglich.';
      }
      updateAwardsCopy();
    };
    label.append(name, select);
    ballotElement.append(label);
  }
  updateAwardsCopy();
}

// The shared part: who has voted, the buttons, and after "Auflösen" the results
async function awardsCall(path, body) {
  let code = '';
  try { code = sessionStorage.getItem('previewGroupCode') || ''; } catch {}
  const response = await fetch(voteApi + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(body && { 'Content-Type': 'application/json' }) },
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
  ballotElement.hidden = $('awardsIntro').hidden = revealed();
  personSelect.closest('label').hidden = revealed();
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
    submit.disabled = !ballotSummary().length;
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
function drawResults() {
  const box = $('awardsResults');
  box.replaceChildren();
  const head = document.createElement('h2'); head.textContent = '🏆 Die Gewinner · ' + seasonName(); box.append(head);
  const grid = document.createElement('div'); grid.className = 'awards-result-grid';
  for (const r of awardsResults(shared.ballots)) {
    const card = document.createElement('section'); card.className = 'awards-result';
    const title = document.createElement('h3'); title.textContent = r.label; card.append(title);
    if (!r.ranked.length) { card.append(chip('Keine Stimmen', 'muted')); grid.append(card); continue; }
    const list = document.createElement('ol');
    for (const [name, n] of r.ranked) {
      const li = document.createElement('li'); if (n === r.top) li.className = 'winner';
      const b = document.createElement('span'); b.textContent = name;
      const c = document.createElement('small'); c.textContent = n + (n === 1 ? ' Stimme' : ' Stimmen');
      li.append(b, c); list.append(li);
    }
    card.append(list); grid.append(card);
  }
  box.append(grid);
  const details = document.createElement('details'); details.className = 'awards-ballots';
  const summary = document.createElement('summary'); summary.textContent = 'Wer hat was gewählt?'; details.append(summary);
  for (const b of shared.ballots || []) {
    const p = document.createElement('p');
    const who = document.createElement('b'); who.textContent = b.person + ': ';
    p.append(who, awardCategories.filter(([id]) => b.picks?.[id]).map(([id, label]) => label + ' ' + b.picks[id]).join(' · '));
    details.append(p);
  }
  box.append(details);
}
async function submitBallot() {
  const picks = Object.fromEntries(awardCategories.flatMap(([id]) => nominees.has(ballot[id]) ? [[id, nominees.get(ballot[id])]] : []));
  const button = $('awardsSubmit'); button.disabled = true;
  awardsStatus.textContent = 'Wird abgegeben…';
  try {
    await awardsCall('/awards/ballot', { season: seasonName(), person: personSelect.value, picks });
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
  shared = null;
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
    if (!nominees.size || !people.length) {
      awardsStatus.textContent = 'Für diese Season ist kein Stimmzettel verfügbar.';
      return;
    }
    personSelect.disabled = false;
    awardsStatus.textContent = '';
    renderBallot();
    drawShared();
    loadShared();
  } catch {
    if (request === seasonRequest) awardsStatus.textContent = 'Der Guckplan konnte nicht geladen werden.';
  }
}

personSelect.onchange = () => {
  awardsStatus.textContent = '';
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
      const winners = r.ranked.filter(([, n]) => n === r.top).map(([t]) => t);
      const li = document.createElement('li');
      const label = document.createElement('span'); label.textContent = r.label;
      const won = document.createElement('b'); won.textContent = winners.join(' / ');
      li.append(label, won); list.append(li);
      for (const b of ballots) if (winners.includes(b.picks?.[r.id])) hits.set(b.person, (hits.get(b.person) || 0) + 1);
    }
    section.append(list); body.append(section);
  }
  if (hits.size) {
    const top = [...hits].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
    const p = document.createElement('p'); p.className = 'awards-hall-note';
    p.textContent = 'Am häufigsten auf den Gewinner gesetzt: ' + top.slice(0, 5).map(([name, n]) => `${name} (${n})`).join(', ');
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
