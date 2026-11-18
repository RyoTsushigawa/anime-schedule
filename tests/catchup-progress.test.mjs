import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('Catch-up shows watched progress when the series total is known', async t => {
  const p = await openPage({
    storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]),
      anilistActive: 'Tester', anilistUser: 'Tester' },
    list: { 1: { status: 'CURRENT', progress: 2 }, 2: { status: 'CURRENT', progress: 0 } },
    media: { 2: { episodes: null } }
  });
  t.after(() => p.close());
  await p.click(p.$('viewCatchup'));
  const rows = [...p.$('list').querySelectorAll('.catchup-single, .show-head')];
  const alpha = rows.find(row => row.textContent.includes('Alpha EN'));
  const beta = rows.find(row => row.textContent.includes('Beta EN'));
  const progress = alpha.querySelector('.season-progress');
  assert.equal(progress.getAttribute('aria-valuenow'), '2');
  assert.equal(progress.getAttribute('aria-valuemax'), '12');
  assert.equal(progress.querySelector('span').style.width, '17%');
  assert.match(progress.getAttribute('aria-label'), /2 von 12 gesehen/);
  assert.match(alpha.textContent, /offen/);
  assert.equal(beta.querySelector('.season-progress'), null);
  assert.match(beta.textContent, /offen/);
});
test('Other shows the same watched-progress line', async t => {
  const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' },
    list: { 4: { status: 'CURRENT', progress: 3 } }, listNext: { 4: null },
    media: { 4: { status: 'FINISHED', episodes: 12, startDate: { year: 2019, month: 4, day: 1 } } } });
  t.after(() => p.close());
  await p.click(p.$('viewPace'));
  const row = [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Delta EN'));
  const bar = row.querySelector('.season-progress');
  assert.equal(bar.getAttribute('aria-valuenow'), '3');
  assert.equal(bar.querySelector('span').style.width, '25%');
});
