import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNames, checkAllNames } from '../tools/games-endless.mjs';

const realFetch = globalThis.fetch;
const character = (first, last = '') => ({ name: { first, last } });
test('name checks: up to 10 words in one AniList request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    const data = Object.fromEntries(Object.entries(body.variables).map(([k, w]) => [k, { characters: w === 'RANMA' ? [character('Ranma', 'Saotome')] : [character('Someone')] }]));
    return new Response(JSON.stringify({ data }));
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const run = checkNames(['RANMA', 'KOKORO']);
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); t.mock.timers.tick(2000);
  const result = await run;
  assert.equal(bodies.length, 1);
  assert.match(bodies[0].query, /w0: Page.*w1: Page/);
  assert.deepEqual([...result], [['RANMA', true], ['KOKORO', false]]);
});
test('name checks: a refused batch falls back to one word at a time; the time limit leaves the rest for later', async t => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    if (Object.keys(body.variables).length > 1) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ data: { Page: { characters: body.variables.w === 'CHITOSE' ? [character('Chitose')] : [] } } }));
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const names = {};
  // already past the deadline: nothing is checked
  await checkAllNames(['CHITOSE', 'XYZZY'], names, Date.now() - 1);
  assert.equal(calls, 0);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const run = checkAllNames(['CHITOSE', 'XYZZY'], names, Date.now() + 60000);
  for (let i = 0; i < 20; i++) { await new Promise(r => setImmediate(r)); t.mock.timers.tick(1000); }
  await run;
  assert.deepEqual(names, { CHITOSE: true, XYZZY: false });
  assert.equal(calls, 3);
});
