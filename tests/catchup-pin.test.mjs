import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U25: a pinned show stays at the top of Catch-up, whatever the sort
const auth = { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' };
const order = p => [...p.$('list').querySelectorAll('.catchup-single, .show-head')].map(r => r.querySelector('.title a').textContent);

test('pinning moves a show to the top and is remembered; unpinning puts it back', async () => {
  const p = await openPage({ storage: { ...auth, sort: 'az' }, list: { 1: { status: 'CURRENT', progress: 2 }, 2: { status: 'CURRENT', progress: 0 } } });
  try {
    await p.click(p.$('viewCatchup'));
    const before = order(p);
    assert.ok(before.length >= 2);
    const last = before.at(-1);
    const pin = [...p.$('list').querySelectorAll('[data-pin]')].find(b => b.closest('.info, .row, .show-head').textContent.includes(last));
    await p.click(pin, 300);
    assert.equal(order(p)[0], last);
    assert.equal(JSON.parse(p.window.localStorage.getItem('catchupPinned')).length, 1);
    assert.equal(p.$('list').querySelector('[data-pin][aria-pressed="true"]').closest('.info, .row, .show-head').textContent.includes(last), true);
    await p.click(p.$('list').querySelector('[data-pin][aria-pressed="true"]'), 300);
    assert.deepEqual(order(p), before);
  } finally { p.close(); }
});
