import test from 'node:test';
import assert from 'node:assert/strict';
import { questionsFor, scoreOf, norm } from '../trivia-core.mjs';
// The daily Anime-Quiz: the same five questions for everyone on a day, never a wrong answer that is right.
const media = [
  { id: 1, title: 'Frieren', genres: ['Adventure', 'Drama', 'Fantasy'], studios: ['Madhouse'], episodes: 28, characters: ['Frieren', 'Fern'] },
  { id: 2, title: 'Dandadan', genres: ['Action', 'Comedy', 'Supernatural'], studios: ['Science SARU'], episodes: 12, characters: ['Momo Ayase', 'Okarun'] },
  { id: 3, title: 'Gachiakuta', genres: ['Action', 'Fantasy'], studios: ['Bones'], episodes: 24, characters: ['Rudo'] },
  { id: 4, title: 'Kusuriya', alt: 'Kusuriya no Hitorigoto', genres: ['Drama', 'Mystery', 'Romance'], studios: ['OLM', 'TOHO animation STUDIO'], episodes: 24, characters: ['Maomao', 'Jinshi'] },
  { id: 5, title: 'Sakamoto Days', genres: ['Action', 'Comedy'], studios: ['TMS Entertainment'], episodes: 11, characters: ['Taro Sakamoto'] },
  { id: 6, title: 'Spy x Family', genres: ['Action', 'Comedy', 'Slice of Life'], studios: ['WIT STUDIO', 'CloverWorks'], episodes: 13, characters: ['Anya Forger', 'Loid Forger'] },
];
const plan = { people: ['MaRyo', 'Belly', 'Rei', 'Sophie', 'Terra'], watchers: new Map([[norm('Frieren'), ['MaRyo', 'Rei']], [norm('Kusuriya no Hitorigoto'), ['Belly']]]) };

test('five questions about five different shows, the same for everyone on a day', () => {
  const a = questionsFor(media, '2026-11-13', plan), b = questionsFor([...media].reverse(), '2026-11-13', plan);
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(q => q.show)).size, 5);
  assert.ok(new Set(a.map(q => q.kind)).size >= 3, 'mixed kinds');
  // the group question gets in even when only two shows have one
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15']) assert.ok(questionsFor(media, d, plan).some(q => q.kind === 'watcher'), d);
  assert.notDeepEqual(questionsFor(media, '2026-11-14', plan).map(q => q.prompt), a.map(q => q.prompt));
});

test('every wrong option is really wrong, and the answer is among four options', () => {
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-12-01', '2027-01-07']) for (const q of questionsFor(media, d, plan)) {
    assert.equal(q.options.length, 4); assert.ok(q.options.includes(q.answer));
    const m = media.find(x => x.id === q.show), wrong = q.options.filter(o => o !== q.answer);
    if (q.kind === 'genre') { assert.ok(m.genres.includes(q.answer)); for (const o of wrong) assert.ok(!m.genres.includes(o)); }
    if (q.kind === 'studio') for (const o of wrong) assert.ok(!m.studios.includes(o));
    if (q.kind === 'character') for (const o of wrong) assert.ok(!media.find(x => x.title === o).characters.includes(q.prompt.match(/stammt (.+)\?$/)[1]));
    if (q.kind === 'episodes') { assert.equal(q.answer, String(m.episodes)); for (const o of wrong) assert.notEqual(o, String(m.episodes)); }
    if (q.kind === 'watcher') { const w = plan.watchers.get(norm(m.title)) || plan.watchers.get(norm(m.alt)); assert.ok(w.includes(q.answer)); for (const o of wrong) assert.ok(!w.includes(o)); }
  }
});

test('without the Guckplan there are no "who watches" questions; the score counts right answers', () => {
  const qs = questionsFor(media, '2026-11-13', null);
  assert.ok(qs.every(q => q.kind !== 'watcher'));
  assert.equal(scoreOf(qs, [qs[0].answer, 'x', qs[2].answer]), 2);
  assert.deepEqual(questionsFor(media.slice(0, 2), '2026-11-13', plan).length < 5, true);
});
