import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('season progress shows a real episode fraction and never invents unknown totals', async () => {
 const page = await openPage();
 try {
  const known = page.run('seasonProgress([6], 12)');
  assert.match(known, /role="progressbar"/);
  assert.match(known, /aria-valuenow="6"/);
  assert.match(known, /aria-valuemax="12"/);
  assert.match(known, /width:50%/);
  assert.match(known, /Folge 6 von 12/);

  assert.equal(page.run('seasonProgress([6], null)'), '');
  assert.equal(page.run('seasonProgress([6], 0)'), '');
  assert.equal(page.run('seasonProgress([6], undefined)'), '');
  assert.equal(page.run('seasonProgress([6], 5)'), '');
  assert.equal(page.run('seasonProgress([], 12)'), '');
  assert.equal(page.run('seasonProgress([0], 12)'), '');
  assert.match(page.run('seasonProgress([11, 12], 12)'), /width:100%/);

  const bar = page.document.querySelector('#list .season-progress');
  assert.ok(bar, 'weekly episode cards include a progress bar when the total is known');
  assert.ok(Number(bar.getAttribute('aria-valuenow')) <= Number(bar.getAttribute('aria-valuemax')));
 } finally {
  page.close();
 }
});
