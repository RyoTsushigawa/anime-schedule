import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../pocket/worker/index.js';

const origin = 'https://ryotsushigawa.github.io';
function environment(extra = {}) {
  const data = new Map();
  return { data, SITE_ORIGIN: origin, TEST_NOW: String(Date.parse('2026-11-19T12:00:00Z')), ...extra,
    POCKET: { get: async k => data.get(k) ?? null, put: async (k, v) => { data.set(k, v); }, delete: async k => { data.delete(k); },
      list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } };
}
async function call(env, path, body, headers = {}) {
  const r = await worker.fetch(new Request('https://pocket.test' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...headers }, ...(body && { body: JSON.stringify(body) }) }), env);
  return { status: r.status, ...await r.json() };
}
const record = { accounts: [{ id: 'main', name: 'Main', friendId: '1234 5678 9012 3456' }, { id: 'alt2', name: 'Alt' }], owned: { main: { 'A1-1': 2 }, alt2: { 'B2a-17': 1 } }, wish: ['A1-5'], chase: ['A1-5', 'PROMO-A-3'] };

test('join with a PIN, log in, save your own; the group reads everyone', async () => {
  const e = environment();
  assert.equal((await call(e, '/join', { person: 'Ryo' })).status, 401);
  assert.equal((await call(e, '/join', { person: 'Ryo' }, { 'X-Pocket-Pin': '4711' })).status, 200);
  assert.equal((await call(e, '/join', { person: 'ryo' }, { 'X-Pocket-Pin': '9999' })).status, 409);
  assert.equal((await call(e, '/login', { person: 'Ryo' }, { 'X-Pocket-Pin': '0000' })).status, 403);
  assert.equal((await call(e, '/login', { person: 'Ryo' }, { 'X-Pocket-Pin': '4711' })).status, 200);
  const saved = await call(e, '/pocket', { person: 'Ryo', since: '', record }, { 'X-Pocket-Pin': '4711' });
  assert.equal(saved.status, 200);
  assert.equal(saved.record.at, '2026-11-19T12:00:00.000Z');
  assert.deepEqual(saved.record.wish, []);
  assert.deepEqual(saved.record.chase, ['A1-5', 'PROMO-A-3']);
  assert.equal(e.data.get('pin:Ryo').includes('4711'), false);
  const all = await call(e, '/pocket');
  assert.deepEqual(Object.keys(all.people), ['Ryo']);
  assert.equal(all.people.Ryo.owned.main['A1-1'], 2);
});

test('a save over a newer one is refused with the newer one; bad data is refused', async () => {
  const e = environment(), pin = { 'X-Pocket-Pin': '4711' };
  await call(e, '/join', { person: 'Terra' }, pin);
  const first = await call(e, '/pocket', { person: 'Terra', since: '', record }, pin);
  e.TEST_NOW = String(Date.parse('2026-11-19T13:00:00Z'));
  const stale = await call(e, '/pocket', { person: 'Terra', since: '', record }, pin);
  assert.equal(stale.status, 409);
  assert.equal(stale.record.at, first.record.at);
  assert.equal((await call(e, '/pocket', { person: 'Terra', since: first.record.at, record }, pin)).status, 200);
  for (const bad of [{ ...record, accounts: [] }, { ...record, owned: { main: { '<x>': 1 } } }, { ...record, owned: { main: { 'A1-1': 500 } } }, { ...record, accounts: [{ id: 'main', name: '<b>' }] }])
    assert.equal((await call(e, '/pocket', { person: 'Terra', since: '', record: bad }, pin)).status >= 400, true);
  assert.equal((await call(e, '/pocket', { person: 'Nobody', since: '', record }, pin)).status, 404);
});

test('five wrong PINs lock for 15 minutes; the admin key resets a PIN', async () => {
  const e = environment({ ADMIN_KEY: 'admin-key-1234567890' });
  await call(e, '/join', { person: 'Rei' }, { 'X-Pocket-Pin': '4711' });
  for (let i = 0; i < 5; i++) await call(e, '/login', { person: 'Rei' }, { 'X-Pocket-Pin': 'wrong' });
  assert.equal((await call(e, '/login', { person: 'Rei' }, { 'X-Pocket-Pin': '4711' })).status, 429);
  assert.equal((await call(e, '/pin-reset', { person: 'Rei' }, { 'X-Admin-Key': 'nope' })).status, 403);
  assert.equal((await call(e, '/pin-reset', { person: 'Rei' }, { 'X-Admin-Key': 'admin-key-1234567890' })).status, 200);
  assert.equal((await call(e, '/join', { person: 'Rei' }, { 'X-Pocket-Pin': '1234' })).status, 200);
});

test('group code and origin', async () => {
  const e = environment({ GROUP_CODE: 'our-group-code-123456' });
  assert.equal((await call(e, '/pocket')).status, 401);
  assert.equal((await call(e, '/pocket', null, { 'X-Group-Code': 'our-group-code-123456' })).status, 200);
  const r = await worker.fetch(new Request('https://pocket.test/pocket', { headers: { Origin: 'https://evil.example' } }), e);
  assert.equal(r.status, 403);
});
