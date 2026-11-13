// Inhalts-Rätsel: every day the description of one of your shows (from the Guckplan, via streams-de.json),
// names and title words blacked out; four choices, two tries. Result kept in this browser for the day.
import { berlinDay } from './cover-core.mjs';
import { anilist } from './game-data.mjs';
import { dailyPuzzle, cleanDescription, giveaways, blackOut, BLACK, synopsisStats } from './synopsis-core.mjs';

const $ = id => document.getElementById(id);
const today = berlinDay(), storeKey = 'synopsisPuzzleV1', historyKey = 'synopsisHistoryV1', TRIES = 2, ARCHIVE_DAYS = 14;
let day = today, streamIds = null;
// U21/U23: every day's result, for the archive of earlier puzzles and the statistics
const history = () => { try { return JSON.parse(localStorage.getItem(historyKey) || '{}') || {}; } catch { return {}; } };
const dayBefore = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
let puzzle = null, titles = new Map(), target = null, tries = [];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const message = text => { $('synStatus').textContent = text; };
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
    const s = synopsisStats(history(), today);
    $('synStats').textContent = `Gespielt ${s.played} · gelöst ${s.rate} % · im 1. Versuch ${s.firstTry} · Serie ${s.streak}`;
  }
}
function guess(id) {
  if (!puzzle || done() || tries.includes(id)) return;
  tries.push(id);
  // solved / done too, for the overview on the Spiele page
  try {
    if (day === today) localStorage.setItem(storeKey, JSON.stringify({ day, tries, solved: solved(), done: done() }));
    localStorage.setItem(historyKey, JSON.stringify({ ...history(), [day]: { tries: tries.length, picked: tries, solved: solved(), done: done() } }));
  } catch {}
  drawArchive();
  message(id === target.id ? '' : done() ? '' : 'Nicht ganz. Noch ein Versuch.');
  draw();
}
function drawArchive() {
  const h = history(), fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const days = Array.from({ length: ARCHIVE_DAYS }, (_, i) => dayBefore(today, i));
  $('synDay').replaceChildren(...days.map((d, i) => new Option((i ? fmt(d) : 'Heute') + (h[d]?.done ? (h[d].solved ? ' ✓' : ' ✗') : ''), d)));
  $('synDay').value = day;
}
async function start() {
  $('synRetry').hidden = true;
  puzzle = null; target = null; tries = []; titles = new Map();
  $('synPlay').hidden = true; $('synEnd').hidden = true; $('synCover').hidden = true;
  drawArchive();
  message('Wird geladen …');
  try {
    streamIds ??= Object.keys((await (await fetch('streams-de.json', { cache: 'no-cache' })).json()).status || {}).map(Number);
    const ids = streamIds;
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
    const past = history()[day];
    if (Array.isArray(past?.picked)) tries = past.picked.map(Number).slice(0, TRIES);
    else try { const saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (saved?.day === day && Array.isArray(saved.tries)) tries = saved.tries.map(Number).slice(0, TRIES); } catch {}
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
$('synDay').onchange = () => { day = $('synDay').value; message(''); start(); };
$('synShare').onclick = async () => {
  const marks = tries.map(id => id === target.id ? '🟩' : '🟥').join('');
  const text = `Inhalts-Rätsel ${new Date(day + 'T12:00').toLocaleDateString('de-DE')} · ${solved() ? tries.length : 'X'}/${TRIES}\n${marks}\n${location.origin + location.pathname}`;
  try { await navigator.clipboard.writeText(text); message('Kopiert. Einfach in Discord einfügen.'); }
  catch { message(text); }
};
start();
