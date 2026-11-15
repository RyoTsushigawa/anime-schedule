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
    const staff = { 'TATSUKI FUJIMOTO': [{ name: { full: 'Tatsuki Fujimoto' } }], 'KAGUYA SHINOMIYA': [{ name: { full: 'Kaguya Shinomiya Voice' } }] };
    return new Response(JSON.stringify({ data: Object.fromEntries(Object.entries(v).map(([k, p]) => [k, { staff: staff[p] || [] }])) }));
  };
  const people = {};
  await checkPeople(['TATSUKI FUJIMOTO', 'KAGUYA SHINOMIYA'], people, Date.now() + 60000);
  assert.deepEqual(people, { 'TATSUKI FUJIMOTO': true, 'KAGUYA SHINOMIYA': false });
  assert.deepEqual([...personWords('Tatsuki Fujimoto 17-26', dictionary, people)].sort(), ['FUJIMOTO', 'TATSUKI']);
  assert.equal(personWords('Bleach: Tatsuki Story', dictionary, people).size, 0, 'the same name elsewhere is a character, it stays');
});
