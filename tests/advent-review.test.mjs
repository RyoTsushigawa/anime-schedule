import test from 'node:test';
import assert from 'node:assert/strict';
// The owner's Advent review: verdicts go into advent-review.json in the repository, merged into the newest file
let file = null, sha = 0, puts = [];
globalThis.localStorage = { getItem: k => k === 'movesKey' ? 'k' : null };
globalThis.fetch = async (url, init = {}) => {
  if (init.method === 'PUT') {
    const body = JSON.parse(init.body);
    if (body.sha !== (file ? 's' + sha : undefined)) return { ok: false, status: 409 };
    file = JSON.parse(decodeURIComponent(escape(atob(body.content)))); sha++; puts.push(body.message);
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (!file) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => ({ sha: 's' + sha, content: btoa(unescape(encodeURIComponent(JSON.stringify(file)))) }) };
};
const { saveVerdict, loadReview, summary } = await import('../advent-review.mjs');

test('approving and requesting changes are saved per door and merged with what is already there', async () => {
  await saveVerdict(1, { status: 'ok' });
  file.doors[7] = { status: 'ok', at: 'x' };   // another tab approved door 7 meanwhile
  await saveVerdict(2, { status: 'change', note: 'Andere Frage, bitte nicht One Piece' });
  assert.deepEqual(Object.keys(file.doors).sort(), ['1', '2', '7']);
  assert.equal(file.doors[2].note, 'Andere Frage, bitte nicht One Piece');
  assert.match(puts[1], /Türchen 2 Änderungswunsch/);
  await loadReview();
  assert.equal(summary(), '2 freigegeben · 1 Änderungswünsche · 21 offen');
  await saveVerdict(1, null);
  assert.equal(file.doors[1], undefined);
});
