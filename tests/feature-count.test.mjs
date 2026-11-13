import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('More shows how many features the site has, and the list behind it', async t => {
  const p = await openPage();
  t.after(() => p.close());
  await p.click(p.$('miscButton'));
  assert.equal(p.$('miscMenu').hidden, false);
  assert.equal(p.$('siteFeatureCount').hidden, false);
  const total = Number(p.$('siteFeatureCount').textContent.match(/^(\d+) Funktionen/)?.[1]);
  assert.ok(total >= 100);
  await p.click(p.$('siteFeatureCount'));
  assert.equal(p.$('featuresDlg').open, true);
  assert.equal(p.$('featuresList').querySelectorAll('li').length, total);
  assert.ok(p.$('featuresList').querySelectorAll('h3').length >= 10);
  // "Geplant": what's approved but not live yet
  await p.click(p.$('featuresTabPlanned'));
  assert.equal(p.$('featuresTabPlanned').getAttribute('aria-selected'), 'true');
  const planned = Number(p.$('featuresTabPlanned').textContent.match(/(\d+)/)[1]);
  assert.equal(p.$('featuresList').querySelectorAll('li').length, planned);
  assert.ok(planned > 0);
  await p.click(p.$('featuresTabNow'));
  assert.equal(p.$('featuresList').querySelectorAll('li').length, total);
});