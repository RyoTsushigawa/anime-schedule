'use strict';

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

function ballotKey() {
  return 'seasonal-awards:' + JSON.stringify([SHEET_ID, seasonSelect.value, personSelect.value]);
}

function ballotSummary() {
  return awardCategories.flatMap(([id, label]) =>
    nominees.has(ballot[id]) ? [label + ': ' + nominees.get(ballot[id])] : []);
}

function updateAwardsCopy() {
  copyButton.disabled = !ballotSummary().length;
  $('awardsManual').hidden = true;
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
        awardsStatus.textContent = 'Stimmzettel gespeichert.';
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

async function loadAwardsSeason(tab) {
  const request = ++seasonRequest;
  const wanted = personSelect.value;
  personSelect.disabled = true;
  ballotElement.replaceChildren();
  copyButton.disabled = true;
  $('awardsManual').hidden = true;
  awardsStatus.textContent = 'Lade Guckplan…';
  try {
    const plan = await loadPlan(tab);
    if (request !== seasonRequest) return;
    const titles = plan.shows.filter(show => !show.hidden)
      .map(show => [norm(show.romaji || show.english), show.english || show.romaji])
      .filter(([key]) => key)
      .sort((a, b) => a[1].localeCompare(b[1], 'de'));
    nominees = new Map(titles);
    personSelect.replaceChildren(...plan.people.map(name => new Option(name, name)));
    if (plan.people.includes(wanted)) personSelect.value = wanted;
    if (!nominees.size || !plan.people.length) {
      awardsStatus.textContent = 'Für diese Season ist kein Stimmzettel verfügbar.';
      return;
    }
    personSelect.disabled = false;
    awardsStatus.textContent = '';
    renderBallot();
  } catch {
    if (request === seasonRequest) awardsStatus.textContent = 'Der Guckplan konnte nicht geladen werden.';
  }
}

personSelect.onchange = () => {
  awardsStatus.textContent = '';
  renderBallot();
};

copyButton.onclick = async () => {
  const season = seasonSelect.selectedOptions[0].textContent;
  const text = ['Seasonal Anime Awards · ' + season + ' · ' + personSelect.value, ...ballotSummary()].join('\n');
  const request = seasonRequest;
  const copiedBallot = ballot;
  try {
    await navigator.clipboard.writeText(text);
    if (request === seasonRequest && copiedBallot === ballot) awardsStatus.textContent = 'Stimmzettel kopiert.';
  } catch {
    if (request !== seasonRequest || copiedBallot !== ballot) return;
    $('awardsManual').hidden = false;
    const field = $('awardsText');
    field.value = text;
    field.focus();
    field.select();
  }
};

async function startAwards() {
  let tabs;
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  const current = tabFor(tabs, Date.now()) || tabs[0];
  seasonSelect.replaceChildren(...tabs.map(tab => new Option(
    tab.name.replace(/^Guckplan\s+/i, ''), tab.gid
  )));
  seasonSelect.value = current.gid;
  seasonSelect.disabled = false;
  seasonSelect.onchange = () => loadAwardsSeason(tabs[seasonSelect.selectedIndex]);
  await loadAwardsSeason(current);
}

startAwards();
