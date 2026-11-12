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
  const progress = alpha.querySelector('progress');
  assert.equal(progress.value, 2);
  assert.equal(progress.max, 12);
  assert.match(progress.getAttribute('aria-label'), /2 von 12 gesehen/);
  assert.match(alpha.textContent, /offen/);
  assert.equal(beta.querySelector('progress'), null);
  assert.match(beta.textContent, /offen/);
});