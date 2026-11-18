import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import './votes-identity-stub.mjs';
const origin = 'https://ryotsushigawa.github.io', code = 'test-group-code-123456';
function environment() { const data = new Map(); return { data, SITE_ORIGIN: origin, GROUP_ACCESS_CODE: code, TEST_NOW: String(Date.parse('2026-11-18T12:00:00Z')), AWARDS: { get: async k => data.get(k) || null, put: async (k, v) => data.set(k, v), list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } }; }
async function call(env, path, body, token = 'tok-RyoTsushigawa', extra = {}) {
  const r = await worker.fetch(new Request('https://votes.test' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'X-Group-Code': code, ...(token && { 'X-AniList-Token': token }), ...extra }, ...(body && { body: JSON.stringify(body) }) }), env);
  return { status: r.status, ...await r.json() };
}
const text = 'Eine wirklich ausführliche Review. '.repeat(10);
const review = { person: 'Ryo', mediaId: 189123, title: 'Blue Box', cover: 'https://s4.anilist.co/file/a.jpg', season: 'Herbst 2026', score: 87, text };

test('pen name first, then a proper review; reads show the pen name, never the person', async () => {
  const e = environment();
  assert.equal((await call(e, '/troddl/review', review)).status, 400);
  assert.equal((await call(e, '/troddl/pen', { person: 'Ryo', pen: 'Drachenhort Review' })).status, 200);
  assert.equal((await call(e, '/troddl/review', { ...review, text: 'Zu kurz.' })).status, 400);
  assert.equal((await call(e, '/troddl/review', { ...review, score: 101 })).status, 400);
  assert.equal((await call(e, '/troddl/review', review)).status, 200);
  const anon = await call(e, '/troddl', null, '');
  assert.equal(anon.reviews.length, 1);
  assert.equal(anon.reviews[0].pen, 'Drachenhort Review');
  assert.equal(JSON.stringify(anon).includes('Ryo"'), false);
  assert.equal(anon.reviews[0].mine, undefined);
  const me = await call(e, '/troddl?person=Ryo', null);
  assert.equal(me.reviews[0].mine, true);
  assert.equal(me.me.pen, 'Drachenhort Review');
});

test('pen names are unique, only your own can be set, edits keep the date and delete removes', async () => {
  const e = environment();
  await call(e, '/troddl/pen', { person: 'Ryo', pen: 'Drachenhort Review' });
  assert.equal((await call(e, '/troddl/pen', { person: 'Marvin', pen: 'drachenhort review' }, 'tok-MilkyWay95')).status, 409);
  assert.equal((await call(e, '/troddl/pen', { person: 'Marvin', pen: 'Milchstraßen-Kurier' })).status, 403);
  assert.equal((await call(e, '/troddl/pen', { person: 'Marvin', pen: '<b>x</b>' }, 'tok-MilkyWay95')).status, 400);
  assert.equal((await call(e, '/troddl/pen', { person: 'Marvin', pen: 'Milchstraßen-Kurier' }, 'tok-MilkyWay95')).status, 200);
  await call(e, '/troddl/review', review);
  e.TEST_NOW = String(Date.parse('2026-11-20T12:00:00Z'));
  const edited = await call(e, '/troddl/review', { ...review, score: 90 });
  assert.equal(edited.review.at, '2026-11-18T12:00:00.000Z');
  assert.equal(edited.review.editedAt, '2026-11-20T12:00:00.000Z');
  assert.equal((await call(e, '/troddl', null)).reviews.length, 1);
  assert.equal((await call(e, '/troddl/review/delete', { person: 'Ryo', mediaId: 189123 })).status, 200);
  assert.equal((await call(e, '/troddl', null)).reviews.length, 0);
  assert.equal((await call(e, '/troddl', null, '', { 'X-Group-Code': '' })).status, 401);
});
