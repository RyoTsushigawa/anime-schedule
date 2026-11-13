import { MAL_IDS, berlinDay, buildRounds, scoreAnswers } from './cover-core.mjs';
import { anilist, BLOCKED } from './game-data.mjs';

const $ = id => document.getElementById(id);
const storeKey = 'animeCoverQuizV2';   // V2: the shows come from the Guckplan
let rounds = [], answers = [], position = 0, revealed = false;
const day = berlinDay();
function message(text) { $('coverStatus').textContent = text; }
function persist() {
  // score and total too, for the overview on the Spiele page
  try { localStorage.setItem(storeKey, JSON.stringify({ day, answers, score: scoreAnswers(rounds, answers), total: rounds.length })); } catch {}
}
function loadAnswers() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
    return saved?.day === day && Array.isArray(saved.answers) ? saved.answers.slice(0, rounds.length) : [];
  } catch { return []; }
}
function imageReady(image) {
  return new Promise(resolve => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = image;
  });
}
async function start() {
  $('coverRetry').hidden = true;
  $('coverPlay').hidden = true;
  message('Cover werden geladen …');
  try {
    // the shows from your Guckplan (streams-de.json: AniList IDs); the fixed list if there are too few
    const ask = async (filter, ids, page) => (await anilist(`query ($ids: [Int], $page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } media(${filter}: $ids, type: ANIME) { idMal title { english romaji } coverImage { large extraLarge } } } }`, { ids, page })).Page || {};
    let catalog = [];
    try {
      const streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json();
      const ids = Object.keys(streams.status || {}).map(Number).filter(Boolean);
      for (let page = 1; ids.length && page <= 3; page++) {
        const part = await ask('id_in', ids, page);
        catalog.push(...(part.media || []));
        if (!part.pageInfo?.hasNextPage) break;
      }
    } catch {}
    if (catalog.filter(m => m.idMal).length < 8) catalog = (await ask('idMal_in', MAL_IDS, 1)).media || [];
    const available = await Promise.all(catalog.map(async item => (await imageReady(item.coverImage?.extraLarge || item.coverImage?.large)) ? item : null));
    rounds = buildRounds(available.filter(Boolean), day);
    if (rounds.length < 5) throw new Error('Zu wenige Anime-Cover erreichbar.');
    answers = loadAnswers();
    position = Math.min(answers.length, rounds.length - 1);
    revealed = answers.length > position;
    $('coverPlay').hidden = false;
    message('');
    if (answers.length >= rounds.length) finish();
    else render();
  } catch (error) {
    message(error?.message === BLOCKED ? BLOCKED : /zu viele/.test(error?.message) ? error.message : 'Die Cover konnten nicht geladen werden. Bitte erneut versuchen.');
    $('coverRetry').hidden = false;
    console.warn('Anime Cover Quiz:', error);
  }
}
function render() {
  // Reveal the final cover before showing the score, just like earlier rounds.
  if (answers.length >= rounds.length && !revealed) return finish();
  const round = rounds[position];
  $('coverProgress').textContent = 'Cover ' + (position + 1) + ' von ' + rounds.length;
  $('coverScore').textContent = scoreAnswers(rounds, answers) + ' Punkte';
  $('coverArt').src = round.target.image;
  $('coverArt').alt = revealed ? 'Anime-Cover: ' + round.target.name : 'Verpixeltes Anime-Cover zum Erraten';
  $('coverArt').classList.toggle('revealed', revealed);
  $('coverArt').style.filter = revealed ? 'none' : 'blur(16px)';
  $('coverChoices').replaceChildren();
  round.options.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cover-choice';
    btn.textContent = (i + 1) + '. ' + choice.name;
    if (revealed) {
      btn.disabled = true;
      if (choice.id === round.target.id) btn.classList.add('right');
      else if (choice.id === answers[position]) btn.classList.add('wrong');
    } else {
      btn.addEventListener('click', () => choose(choice.id));
    }
    $('coverChoices').append(btn);
  });
  $('coverNext').hidden = !revealed;
  if (revealed) {
    const won = answers[position] === round.target.id;
    message(won ? 'Richtig! +100 Punkte' : 'Das war ' + round.target.name + '.');
    $('coverNext').textContent = position === rounds.length - 1 ? 'Ergebnis ansehen' : 'Nächstes Cover';
  } else message('Welcher Anime ist das?');
}
function choose(id) {
  if (revealed || !rounds[position]) return;
  answers[position] = id;
  revealed = true;
  persist();
  render();
}
function next() {
  if (!revealed) return;
  if (position + 1 >= rounds.length) return finish();
  position++;
  revealed = answers.length > position;
  render();
}
function finish() {
  $('coverPlay').hidden = true;
  $('coverResult').hidden = false;
  const correct = answers.filter((id,i) => id === rounds[i]?.target.id).length;
  $('coverFinal').textContent = correct + ' / ' + rounds.length + ' richtig';
  $('coverFinalScore').textContent = scoreAnswers(rounds, answers) + ' Punkte';
  message('Morgen gibt es fünf neue Cover.');
}
async function share() {
  const result = 'Anime Cover Quiz · ' + day + '\n' + scoreAnswers(rounds, answers) + ' / ' + (rounds.length * 100) + ' Punkte\n' + answers.map((id,i) => id === rounds[i]?.target.id ? '🟩' : '⬛').join('') + '\n' + location.origin + location.pathname;
  try { await navigator.clipboard.writeText(result); $('coverShare').textContent = 'Kopiert!'; }
  catch { message('Teilen nicht möglich.'); }
}
$('coverRetry').addEventListener('click', start);
$('coverNext').addEventListener('click', next);
$('coverShare').addEventListener('click', share);
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,textarea,select')) return;
  if (!revealed && /^[1-4]$/.test(e.key) && !$('coverPlay').hidden) {
    choose(rounds[position].options[Number(e.key) - 1].id);
  } else if (revealed && e.key === 'Enter') next();
});
start();
