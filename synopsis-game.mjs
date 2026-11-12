// Inhalts-Rätsel: every day the description of one of your shows (from the Guckplan, via streams-de.json),
// names and title words blacked out; four choices, two tries. Result kept in this browser for the day.
import { berlinDay } from './cover-core.mjs';
import { dailyPuzzle, cleanDescription, giveaways, blackOut, BLACK } from './synopsis-core.mjs';

const $ = id => document.getElementById(id);
const day = berlinDay(), storeKey = 'synopsisPuzzleV1', TRIES = 2;
let puzzle = null, titles = new Map(), target = null, tries = [];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const message = text => { $('synStatus').textContent = text; };
async function anilist(query, variables) {
  const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error('AniList antwortet ' + response.status);
  const data = await response.json();
  if (data.errors?.length) throw new Error('AniList hat die Anfrage abgelehnt');
  return data.data;
}
const solved = () => tries.includes(target.id), done = () => solved() || tries.length >= TRIES;
function draw() {
  const finished = done();
  $('synChoices').innerHTML = puzzle.options.map(id => {
    const state = finished && id === target.id ? ' right' : tries.includes(id) ? ' wrong' : '';
    return `<button type="button" class="cover-choice${state}" data-id="${id}"${finished || tries.includes(id) ? ' disabled' : ''}>${esc(titles.get(id) || '?')}</button>`;
  }).join('');
  $('synTries').textContent = finished ? '' : `${TRIES - tries.length} ${TRIES - tries.length === 1 ? 'Versuch' : 'Versuche'}`;
  $('synEnd').hidden = !finished;
  if (finished) {
    $('synAnswer').innerHTML = `${solved() ? (tries.length === 1 ? 'Richtig, beim ersten Versuch!' : 'Richtig, beim zweiten Versuch.') : 'Leider nicht.'} Gesucht war <a href="${esc(target.siteUrl)}" target="_blank" rel="noopener">${esc(titles.get(target.id))}</a>.`;
    $('synFull').textContent = cleanDescription(target.description);
    if (target.coverImage?.large) { $('synCover').src = target.coverImage.large; $('synCover').hidden = false; }
  }
}
function guess(id) {
  if (!puzzle || done() || tries.includes(id)) return;
  tries.push(id);
  try { localStorage.setItem(storeKey, JSON.stringify({ day, tries })); } catch {}
  message(id === target.id ? '' : done() ? '' : 'Nicht ganz. Noch ein Versuch.');
  draw();
}
async function start() {
  $('synRetry').hidden = true;
  message('Wird geladen …');
  try {
    const streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json();
    const ids = Object.keys(streams.status || {}).map(Number);
    puzzle = dailyPuzzle(ids, day);
    if (!puzzle) throw new Error('zu wenige Serien im Guckplan');
    const list = await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id title { english romaji } } } }', { ids: puzzle.options });
    for (const m of list.Page.media) titles.set(m.id, m.title.english || m.title.romaji);
    const one = await anilist(`query ($id: Int) { Media(id: $id, type: ANIME) { id siteUrl description(asHtml: false) title { english romaji } synonyms
      coverImage { large } characters(sort: [ROLE, RELEVANCE], perPage: 15) { nodes { name { full first last alternative } } } } }`, { id: puzzle.target });
    target = one.Media;
    const text = cleanDescription(target.description);
    if (text.length < 60) throw new Error('keine Inhaltsangabe für heute');
    $('synText').innerHTML = esc(blackOut(text, giveaways(target))).split(BLACK).join('<span class="syn-black" role="img" aria-label="geschwärzt"></span>');
    try { const saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (saved?.day === day && Array.isArray(saved.tries)) tries = saved.tries.map(Number).slice(0, TRIES); } catch {}
    $('synPlay').hidden = false;
    message('');
    draw();
  } catch (e) {
    message('Das Rätsel konnte nicht geladen werden: ' + e.message);
    $('synRetry').hidden = false;
  }
}
$('synChoices').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) guess(Number(b.dataset.id)); });
$('synRetry').onclick = start;
$('synShare').onclick = async () => {
  const marks = tries.map(id => id === target.id ? '🟩' : '🟥').join('');
  const text = `Inhalts-Rätsel ${new Date(day + 'T12:00').toLocaleDateString('de-DE')} · ${solved() ? tries.length : 'X'}/${TRIES}\n${marks}\n${location.origin + location.pathname}`;
  try { await navigator.clipboard.writeText(text); message('Kopiert. Einfach in Discord einfügen.'); }
  catch { message(text); }
};
start();
