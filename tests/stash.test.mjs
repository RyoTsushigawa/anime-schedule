import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// common.js: stash (this browser's storage, quiet when blocked) and votesApi (the helper's address)
const load = (localStorage, configJson = {}) => {
  const ctx = vm.createContext({ localStorage, sessionStorage: localStorage, fetch: async () => ({ ok: true, json: async () => configJson }), document: {}, location: { hash: '', search: '' }, URL, URLSearchParams, setTimeout, console });
  vm.runInContext(readFileSync(new URL('../common.js', import.meta.url), 'utf8') + ';this.stash=stash;this.votesApi=votesApi;', ctx);
  return ctx;
};
test('stash reads and writes, and blocked storage neither throws nor keeps anything', () => {
  const data = new Map();
  const ok = load({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) });
  ok.stash.set('a', '1'); assert.equal(ok.stash.get('a'), '1');
  ok.stash.set('j', JSON.stringify({ x: 2 })); assert.deepEqual({ ...ok.stash.json('j', {}) }, { x: 2 });
  ok.stash.set('bad', '{nope'); assert.deepEqual(ok.stash.json('bad', []), []);
  ok.stash.drop('a'); assert.equal(ok.stash.get('a'), null);
  const boom = () => { throw new Error('blocked'); };
  const blocked = load({ getItem: boom, setItem: boom, removeItem: boom });
  assert.doesNotThrow(() => { blocked.stash.set('a', '1'); blocked.stash.drop('a'); });
  assert.equal(blocked.stash.get('a'), null);
  assert.equal(blocked.stash.json('a', 'fallback'), 'fallback');
});
test('votesApi: the https address without a trailing slash, else empty', async () => {
  const mem = { getItem: () => null, setItem() {}, removeItem() {} };
  assert.equal(await load(mem, { previewVotesUrl: 'https://votes.example/' }).votesApi(), 'https://votes.example');
  assert.equal(await load(mem, { previewVotesUrl: 'http://insecure.example' }).votesApi(), '');
});
