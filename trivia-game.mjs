// Anime-Quiz: five questions a day about the shows in your Guckplan (AniList ids from streams-de.json,
// who watches what from the Guckplan sheet). One answer per question; the result stays in this browser.
import { berlinDay } from './cover-core.mjs';
import { anilist } from './game-data.mjs';
import { questionsFor, scoreOf, norm, QUESTIONS } from './trivia-core.mjs';

const $ = id => document.getElementById(id);
const day = berlinDay(), storeKey = 'animeQuizV1';
let questions = [], answers = [], index = 0;
const message = text => { $('quizStatus').textContent = text; };
const QUERY = `query ($ids: [Int], $page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
  media(id_in: $ids, type: ANIME) { id episodes genres title { english romaji } studios(isMain: true) { nodes { name } }
  characters(role: MAIN, perPage: 6) { nodes { name { full } } } } } }`;
async function anilistMedia(ids) {
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const data = (await anilist(QUERY, { ids, page }))?.Page;
    out.push(...(data?.media || []));
    if (!data?.pageInfo?.hasNextPage) break;
  }
  return out.map(m => ({ id: m.id, title: m.title.english || m.title.romaji, alt: m.title.romaji, episodes: m.episodes, genres: m.genres || [],
    studios: (m.studios?.nodes || []).map(s => s.name).filter(Boolean), characters: (m.characters?.nodes || []).map(c => c.name?.full).filter(Boolean) }));
}
// who watches what, from this season's Guckplan (optional: the quiz works without it)
async function groupPlan() {
  try {
    const tabs = await guckplanTabs();
    const sheet = await loadPlan(tabFor(tabs, Date.now()) || tabs[0]);
    const watchers = new Map();
    for (const person of sheet.people) for (const show of picks(sheet, person).keys())
      for (const t of [show.english, show.romaji].map(norm).filter(Boolean)) watchers.set(t, [...new Set([...watchers.get(t) || [], person])]);
    return { people: sheet.people, watchers };
  } catch { return null; }
}
const save = () => { try { localStorage.setItem(storeKey, JSON.stringify({ day, answers, total: questions.length, score: scoreOf(questions, answers), done: answers.length >= questions.length })); } catch {} };
function draw() {
  const q = questions[index], answered = answers.length > index;
  $('quizPlay').hidden = false; $('quizEnd').hidden = true;
  $('quizProgress').textContent = `Frage ${index + 1} von ${questions.length}`;
  $('quizScore').textContent = `${scoreOf(questions.slice(0, answers.length), answers)} richtig`;
  $('quizPrompt').textContent = q.prompt;
  $('quizChoices').replaceChildren(...q.options.map(option => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cover-choice'; b.textContent = option; b.dataset.option = option;
    if (answered) { b.disabled = true; if (option === q.answer) b.classList.add('right'); else if (option === answers[index]) b.classList.add('wrong'); }
    return b;
  }));
  $('quizExplain').hidden = !answered; $('quizExplain').textContent = answered ? (answers[index] === q.answer ? 'Richtig! ' : 'Leider nicht. ') + q.explain : '';
  $('quizNext').hidden = !answered; $('quizNext').textContent = index + 1 < questions.length ? 'Weiter' : 'Zum Ergebnis';
}
function drawEnd() {
  const score = scoreOf(questions, answers);
  $('quizPlay').hidden = true; $('quizEnd').hidden = false;
  $('quizResult').textContent = `${score} von ${questions.length} richtig` + (score === questions.length ? ' · perfekt!' : '');
  $('quizReview').replaceChildren(...questions.map((q, i) => {
    const li = document.createElement('li'); li.className = answers[i] === q.answer ? 'right' : 'wrong';
    const b = document.createElement('b'); b.textContent = q.answer;
    li.append(q.prompt + ' ', b); return li;
  }));
}
$('quizChoices').addEventListener('click', e => {
  const b = e.target.closest('[data-option]');
  if (!b || answers.length > index) return;
  answers[index] = b.dataset.option; save(); draw();
});
$('quizNext').onclick = () => { if (index + 1 < questions.length) { index++; draw(); } else drawEnd(); };
$('quizShare').onclick = async () => {
  const marks = questions.map((q, i) => answers[i] === q.answer ? '🟩' : '🟥').join('');
  const text = `Anime-Quiz ${new Date(day + 'T12:00').toLocaleDateString('de-DE')} · ${scoreOf(questions, answers)}/${questions.length}\n${marks}\n${location.origin + location.pathname}`;
  try { await navigator.clipboard.writeText(text); message('Kopiert. Einfach in Discord einfügen.'); } catch { message(text); }
};
async function start() {
  $('quizRetry').hidden = true;
  message('Wird geladen …');
  try {
    const streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json();
    const ids = Object.keys(streams.status || {}).map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length < 4) throw new Error('zu wenige Serien im Guckplan');
    const [media, plan] = await Promise.all([anilistMedia(ids), groupPlan()]);
    questions = questionsFor(media, day, plan);
    if (questions.length < QUESTIONS) throw new Error('heute lassen sich nicht genug Fragen bilden');
    try { const saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (saved?.day === day && Array.isArray(saved.answers)) answers = saved.answers.slice(0, questions.length); } catch {}
    message('');
    if (answers.length >= questions.length) drawEnd();
    else { index = answers.length && answers.length < questions.length ? answers.length : 0; draw(); }
  } catch (e) {
    message('Das Quiz konnte nicht geladen werden: ' + e.message);
    $('quizRetry').hidden = false;
  }
}
$('quizRetry').onclick = start;
start();
