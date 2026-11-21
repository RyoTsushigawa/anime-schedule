import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// "Neu seit deinem letzten Besuch": entries of the feature list not seen yet get a dot on Mehr / "N Funktionen"
// and "Neu" in the list; opening the list counts as seen; a first visit marks nothing.
const ids = p => JSON.parse(p.storage().featuresSeen);

test('first visit: everything counts as seen, no dot', async () => {
  const p = await openPage();
  try {
    assert.ok(ids(p).length > 50);
    assert.equal(p.$('miscButton').classList.contains('has-new'), false);
    assert.match(p.$('siteFeatureCount').textContent, /alle ansehen/);
  } finally { p.close(); }
});

test('two entries added since: dot, "2 neu", marked in the list; opening clears the dot', async () => {
  const first = await openPage();
  const all = ids(first); first.close();
  const p = await openPage({ storage: { featuresSeen: JSON.stringify(all.slice(2)) } });
  try {
    assert.ok(p.$('miscButton').classList.contains('has-new'));
    assert.match(p.$('siteFeatureCount').textContent, /2 neu/);
    await p.click(p.$('siteFeatureCount'));
    assert.equal(p.$('featuresList').querySelectorAll('.feature-new').length, 2);
    // the new ones come first
    assert.ok(p.$('featuresList').querySelector('li').querySelector('.feature-new'));
    assert.equal(p.$('miscButton').classList.contains('has-new'), false);
    assert.equal(ids(p).length, all.length);
  } finally { p.close(); }
});
