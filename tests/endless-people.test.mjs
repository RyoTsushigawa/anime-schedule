import test from 'node:test';
import assert from 'node:assert/strict';
import { namePairs, personWords, checkPeople } from '../tools/games-endless.mjs';

const dictionary = new Set(['THE', 'BOTTLE', 'RAMUNE', 'IS', 'IN', 'COLLECTION']);
test('two names in a row in a title are a candidate person', () => {
  assert.deepEqual(namePairs('Tatsuki Fujimoto 17-26', dictionary), ['TATSUKI FUJIMOTO']);
  assert.deepEqual(namePairs('Chitose Is in the Ramune Bottle', dictionary), []);
  assert.deepEqual(namePairs('Junji Ito Collection', dictionary), ['JUNJI ITO']);
});
test('AniList staff decides: a real person\'s name is left out of that title only', async t => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async (url, init) => {
    const v = JSON.parse(init.body).variables;
    const staff = { 'TATSUKI FUJIMOTO': [{ name: { full: 'Tatsuki Fujimoto' }, primaryOccupations: ['Mangaka'] }], 'KAGUYA SHINOMIYA': [{ name: { full: 'Kaguya Shinomiya Voice' } }], 'LULUTTO LILLY': [{ name: { full: 'Lulutto Lilly' }, primaryOccupations: [] }],
      'AVE MUJICA': [{ name: { full: 'Ave Mujica' }, primaryOccupations: ['Band'] }], 'HARUHI SUZUMIYA': [{ name: { full: 'Haruhi Suzumiya' }, primaryOccupations: [] }] };
    const chars = { 'HARUHI SUZUMIYA': [{ name: { full: 'Haruhi Suzumiya' } }] };
    return new Response(JSON.stringify({ data: Object.fromEntries(Object.entries(v).flatMap(([k, p]) => [['p' + k.slice(1), { staff: staff[p] || [] }], ['c' + k.slice(1), { characters: chars[p] || [] }]])) }));
  };
  const people = {};
  await checkPeople(['TATSUKI FUJIMOTO', 'KAGUYA SHINOMIYA', 'AVE MUJICA', 'HARUHI SUZUMIYA', 'LULUTTO LILLY'], people, Date.now() + 60000);
  // a real person; a partial match; a band; a character credited for songs
  assert.deepEqual(people, { 'TATSUKI FUJIMOTO': true, 'KAGUYA SHINOMIYA': false, 'AVE MUJICA': false, 'HARUHI SUZUMIYA': false, 'LULUTTO LILLY': false });
  assert.deepEqual([...personWords('Tatsuki Fujimoto 17-26', dictionary, people)].sort(), ['FUJIMOTO', 'TATSUKI']);
  assert.equal(personWords('Bleach: Tatsuki Story', dictionary, people).size, 0, 'the same name elsewhere is a character, it stays');
});
