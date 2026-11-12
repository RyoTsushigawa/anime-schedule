import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzle, cleanDescription, giveaways, blackOut, BLACK } from '../synopsis-core.mjs';
// Idea 114, Inhalts-Rätsel: the same puzzle for everyone on a day, names and title words blacked out.
test('daily puzzle: same for a day, four different choices including the answer', () => {
  const ids = [5, 9, 1, 7, 3, 11];
  const a = dailyPuzzle(ids, '2026-11-12'), b = dailyPuzzle([...ids].reverse(), '2026-11-12');
  assert.deepEqual(a, b);
  assert.equal(new Set(a.options).size, 4);
  assert.ok(a.options.includes(a.target));
  assert.equal(dailyPuzzle([1, 2, 3], '2026-11-12'), null);
});
test('description: tags, source note and long text cleaned', () => {
  const text = cleanDescription('Frieren is an elf.<br><br><i>A long journey</i> ends &amp; begins.<br><br>(Source: Crunchyroll)<br>Note: episode 1 is double length.');
  assert.equal(text, 'Frieren is an elf. A long journey ends & begins.');
  assert.ok(cleanDescription('Word. '.repeat(300)).length <= 652);
});
test('giveaways blacked out: title words and character names, whole words only', () => {
  const media = { title: { english: "Frieren: Beyond Journey's End", romaji: 'Sousou no Frieren' }, synonyms: [],
    characters: { nodes: [{ name: { full: 'Fern', first: 'Fern', last: null, alternative: [] } }, { name: { full: 'Stark', first: 'Stark' } }] } };
  const out = blackOut('Frieren travels with Fern and Stark beyond the mountains; Fernando is someone else.', giveaways(media));
  assert.equal(out, `${BLACK} travels with ${BLACK} and ${BLACK} the mountains; Fernando is someone else.`, "neighbouring words merge into one block");
});
