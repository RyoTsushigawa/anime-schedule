import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Catch-up: with several open episodes, − / + choose how many the ✓ marks; nothing saves before the ✓.
test('− / + choose how many open episodes the ✓ saves', async () => {
  const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' },
    list: { 1: { status: 'CURRENT', progress: 0 } } });
  await p.click(p.$('viewCatchup'));
  const row = [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Alpha EN'));
  assert.ok(row, 'Alpha is in Catch-up');
  const box = row.querySelector('.ep-stepper');
  assert.ok(box, 'stepper shown for several open episodes');
  const open = Number(box.querySelector('.ep-count').textContent);
  assert.ok(open > 1);
  const minus = box.querySelector('[data-step="-1"]');
  await p.click(minus); await p.click(minus);
  assert.equal(Number(box.querySelector('.ep-count').textContent), open - 2);
  const first = Number(box.dataset.first);
  assert.equal(Number(row.querySelector('.watch').dataset.ep), first + open - 3);
  assert.equal(p.calls.some(c => /SaveMediaListEntry/.test(c.query)), false, 'nothing saved yet');
  await p.click(row.querySelector('.watch'));
  const save = p.calls.find(c => /SaveMediaListEntry/.test(c.query));
  assert.ok(save, 'saved on ✓');
  assert.equal(save.variables.progress, first + open - 3);
  p.close();
});
