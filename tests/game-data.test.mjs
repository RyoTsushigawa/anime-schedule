import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
  key: i => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const { anilist, BLOCKED } = await import('../game-data.mjs');
const ok = data => ({ ok: true, status: 200, json: async () => ({ data }) });

test('a game asks AniList once a day for the same query', async () => {
  store.clear();
  let calls = 0;
  const fetcher = async () => { calls++; return ok({ Media: { id: 1 } }); };
  assert.deepEqual(await anilist('q1', { id: 1 }, { fetcher }), { Media: { id: 1 } });
  assert.deepEqual(await anilist('q1', { id: 1 }, { fetcher }), { Media: { id: 1 } });
  assert.equal(calls, 1);
  await anilist('q1', { id: 2 }, { fetcher });
  assert.equal(calls, 2);
});

test('blocked AniList: an older saved answer stands in, otherwise a clear message', async () => {
  store.clear();
  const down = async () => { throw new TypeError('NetworkError when attempting to fetch resource.'); };
  await assert.rejects(anilist('q2', {}, { fetcher: down }), new RegExp(BLOCKED.slice(0, 30)));
  await anilist('q2', {}, { fetcher: async () => ok({ x: 1 }) });
  const [key, value] = [...store.entries()].find(([k]) => k.startsWith('anilistCache:'));
  store.set(key, JSON.stringify({ ...JSON.parse(value), at: Date.now() - 2 * 86400000 }));
  assert.deepEqual(await anilist('q2', {}, { fetcher: down }), { x: 1 });
});

test('a rate limit gets one retry, then a readable message', async () => {
  store.clear();
  let calls = 0;
  const limited = { ok: false, status: 429, headers: { get: () => '0.01' } };
  assert.deepEqual(await anilist('q3', {}, { fetcher: async () => (++calls === 1 ? limited : ok({ y: 2 })) }), { y: 2 });
  assert.equal(calls, 2);
  await assert.rejects(anilist('q4', {}, { fetcher: async () => limited }), /zu viele Anfragen/);
});

test('copies older than four days are cleared when a new one is saved', async () => {
  store.clear();
  store.set('anilistCache:old', JSON.stringify({ at: Date.now() - 5 * 86400000, data: 1 }));
  store.set('otherKey', 'kept');
  await anilist('q5', {}, { fetcher: async () => ok({ z: 3 }) });
  assert.equal(store.has('anilistCache:old'), false);
  assert.equal(store.get('otherKey'), 'kept');
});
