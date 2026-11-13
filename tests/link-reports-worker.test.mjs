import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
// U45 wrong streaming links: report, list, resolve (the data contract for the repair queue N55)
const origin = 'https://ryotsushigawa.github.io';
const kv = () => { const d = new Map(); return { get: async k => d.get(k) ?? null, put: async (k, v) => { d.set(k, v); }, list: async ({ prefix }) => ({ keys: [...d.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) }; };
const call = async (env, path, body) => {
  const res = await worker.fetch(new Request('https://votes.test' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) }), env);
  return { status: res.status, body: await res.json() };
};
const report = { anilistId: 1, title: 'Frieren', service: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/wrong', suggestion: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren', note: 'Falsche Staffel' };

test('a report is kept as pending, listed, not doubled, and can be resolved', async () => {
  const env = { SITE_ORIGIN: origin, AWARDS: kv() };
  const first = await call(env, '/reports', report);
  assert.equal(first.status, 200);
  assert.equal((await call(env, '/reports', report)).body.duplicate, true);
  let list = (await call(env, '/reports?status=pending')).body.reports;
  assert.equal(list.length, 1);
  assert.equal(list[0].suggestion, report.suggestion);
  const done = await call(env, '/reports/resolve', { id: list[0].id, status: 'fixed', resolution: 'Link in streams-de.json korrigiert' });
  assert.equal(done.body.report.status, 'fixed');
  assert.equal((await call(env, '/reports?status=pending')).body.reports.length, 0);
  assert.equal((await call(env, '/reports')).body.reports.length, 1);
});

test('bad reports are refused', async () => {
  const env = { SITE_ORIGIN: origin, AWARDS: kv() };
  for (const bad of [{ ...report, anilistId: 0 }, { ...report, url: 'javascript:alert(1)' }, { ...report, suggestion: 'http://insecure.test' }, { ...report, note: '<script>' }, { ...report, service: '' }])
    assert.equal((await call(env, '/reports', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await call(env, '/reports/resolve', { id: 'nope', status: 'fixed' })).status, 400);
  assert.equal((await call(env, '/reports?status=weird')).status, 400);
});
