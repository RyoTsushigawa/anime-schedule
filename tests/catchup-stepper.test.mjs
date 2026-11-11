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
// Non-seasonal (older shows at your own pace): the counter starts at one episode, + goes up to the last one out
test('Non-seasonal: the counter starts at the next episode and + adds more', async () => {
  const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' },
    list: { 4: { status: 'CURRENT', progress: 2 } }, listNext: { 4: null },
    media: { 4: { status: 'FINISHED', episodes: 12, startDate: { year: 2019, month: 4, day: 1 } } } });
  await p.click(p.$('viewPace'));
  const row = [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Delta EN'));
  assert.ok(row, 'Delta is in Non-seasonal');
  const box = row.querySelector('.ep-stepper');
  assert.ok(box, 'stepper shown');
  assert.equal(box.querySelector('.ep-count').textContent, '1');
  assert.equal(Number(row.querySelector('.watch').dataset.ep), 3);
  const plus = box.querySelector('[data-step="1"]');
  await p.click(plus); await p.click(plus);
  assert.equal(Number(row.querySelector('.watch').dataset.ep), 5);
  await p.click(row.querySelector('.watch'));
  assert.equal(p.calls.find(c => /SaveMediaListEntry/.test(c.query))?.variables.progress, 5);
  p.close();
});
