// Titel-Rätsel: guess today's word from a Guckplan anime title in 6 tries (green = right place, yellow = elsewhere
// in the word, grey = not in it). Same word for everyone each day (German time); words in games-words.json, in order.
// Progress and stats stay in this browser; "Teilen" copies an emoji grid without the answer.
'use strict';
const $ = id => document.getElementById(id);
const TRIES = 6;
const ROWS = ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'];
const berlinDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const dayNumber = (day, start) => Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 86400000);
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

// green / yellow / grey per letter, letters counted so a double letter isn't yellow twice
function score(guess, answer) {
  const result = Array(answer.length).fill('miss'), left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = 'hit';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i++)
    if (result[i] !== 'hit' && left[guess[i]]) { result[i] = 'near'; left[guess[i]]--; }
  return result;
}

let puzzle, state, typing = '';
async function start() {
  const data = await (await fetch('games-words.json', { cache: 'no-cache' })).json();
  const today = berlinDay(), n = Math.max(0, dayNumber(today, data.start));
  const entry = data.words[n % data.words.length];
  puzzle = { day: today, number: n + 1, word: entry.word.toUpperCase(), title: entry.title, from: entry.from };
  const saved = load('titleGame', null);
  state = saved?.day === today ? saved : { day: today, guesses: [], done: false, won: false };
  $('gameNumber').textContent = `Titel-Rätsel #${puzzle.number}`;
  $('gameHint').textContent = `${puzzle.word.length} Buchstaben`;
  draw();
  if (state.done) finish(false);
}
function draw() {
  const len = puzzle.word.length;
  $('board').style.setProperty('--len', len);
  $('board').innerHTML = Array.from({ length: TRIES }, (_, r) => {
    const guess = state.guesses[r], current = !state.done && r === state.guesses.length;
    const marks = guess ? score(guess, puzzle.word) : [];
    return `<div class="board-row${current ? ' current' : ''}" role="row">${Array.from({ length: len }, (_, i) => {
      const letter = guess ? guess[i] : current ? typing[i] || '' : '';
      return `<span class="tile${guess ? ' ' + marks[i] : letter ? ' typed' : ''}" role="gridcell">${letter}</span>`;
    }).join('')}</div>`;
  }).join('');
  // the keyboard remembers the best mark per letter
  const best = {};
  const rank = { hit: 3, near: 2, miss: 1 };
  for (const g of state.guesses) score(g, puzzle.word).forEach((m, i) => { if ((rank[m] || 0) > (rank[best[g[i]]] || 0)) best[g[i]] = m; });
  $('keyboard').innerHTML = ROWS.map((row, r) => `<div class="key-row">${r === 2 ? '<button type="button" class="key wide" data-key="Enter">Raten</button>' : ''}${
    [...row].map(k => `<button type="button" class="key ${best[k] || ''}" data-key="${k}">${k}</button>`).join('')}${
    r === 2 ? '<button type="button" class="key wide" data-key="Backspace" aria-label="Löschen">⌫</button>' : ''}</div>`).join('');
}
function message(text) { $('gameMsg').textContent = text; }
function press(key) {
  if (state.done) return;
  const len = puzzle.word.length;
  if (key === 'Enter') {
    if (typing.length < len) return message(`Das Wort hat ${len} Buchstaben.`);
    state.guesses.push(typing); typing = '';
    if (state.guesses.at(-1) === puzzle.word) { state.done = state.won = true; }
    else if (state.guesses.length >= TRIES) state.done = true;
    message('');
    save('titleGame', state);
    draw();
    if (state.done) finish(true);
    return;
  }
  if (key === 'Backspace') typing = typing.slice(0, -1);
  else if (/^[A-Z]$/.test(key) && typing.length < len) typing += key;
  draw();
}
function finish(fresh) {
  // stats: counted once per day
  const stats = load('titleGameStats', { played: 0, won: 0, streak: 0, best: 0, tries: [0, 0, 0, 0, 0, 0], last: '' });
  if (fresh && stats.last !== puzzle.day) {
    stats.played++;
    if (state.won) { stats.won++; stats.tries[state.guesses.length - 1]++; }
    const yesterday = new Date(Date.parse(puzzle.day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    stats.streak = state.won ? (stats.last === yesterday && stats.lastWon ? stats.streak + 1 : 1) : 0;
    stats.best = Math.max(stats.best, stats.streak);
    stats.last = puzzle.day; stats.lastWon = state.won;
    save('titleGameStats', stats);
  }
  $('gameEnd').hidden = false;
  $('gameAnswer').innerHTML = `${state.won ? 'Richtig!' : 'Leider nicht.'} Gesucht war <b>${puzzle.word}</b> aus <i>${puzzle.title.replace(/[<>&]/g, '')}</i>.`;
  $('gameStats').innerHTML = [['Gespielt', stats.played], ['Gewonnen', stats.played ? Math.round(stats.won / stats.played * 100) + ' %' : '–'], ['Serie', stats.streak], ['Beste', stats.best]]
    .map(([label, value]) => `<span><b>${value}</b>${label}</span>`).join('');
  $('gameNext').textContent = 'Morgen gibt es ein neues Wort.';
}
$('gameShare').onclick = async () => {
  const grid = state.guesses.map(g => score(g, puzzle.word).map(m => ({ hit: '🟩', near: '🟨', miss: '⬛' })[m]).join('')).join('\n');
  const text = `Titel-Rätsel #${puzzle.number} · ${state.won ? state.guesses.length : 'X'}/${TRIES}\n${grid}`;
  try { await navigator.clipboard.writeText(text); message('Kopiert. Einfach in Discord einfügen.'); }
  catch { message(text); }
};
$('keyboard').addEventListener('click', e => { const k = e.target.closest('[data-key]'); if (k) press(k.dataset.key); });
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.length === 1 ? e.key.toUpperCase().replace('Ä', 'A').replace('Ö', 'O').replace('Ü', 'U') : '';
  if (key) { e.preventDefault(); press(key); }
});
start().catch(e => message('Das Rätsel konnte nicht geladen werden: ' + e.message));
