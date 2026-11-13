import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('More shows the count of site views, tools and the games hub', async t => {
  const p = await openPage();
  t.after(() => p.close());
  await p.click(p.$('miscButton'));
  assert.equal(p.$('miscMenu').hidden, false);
  assert.equal(p.$('siteFeatureCount').hidden, false);
  assert.match(p.$('siteFeatureCount').textContent, /^11 Funktionen/);
});