import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U: two weeks before a new season, the Season Preview sits on the plan (and leaves the Mehr menu meanwhile)

const call = p => p.$('list').querySelector('.weekline .preview-call');
const inMenu = p => p.$('miscMenu').querySelector('a[href="season-preview.html"]');

test('outside the last two weeks: only in Mehr', async () => {
  const p = await openPage();
  try {
    assert.equal(call(p), null);
    assert.equal(inMenu(p).hidden, false);
  } finally { p.close(); }
});

test('in the last two weeks: on the plan with the days left, not in Mehr', async () => {
  const p = await openPage({ now: Date.UTC(2026, 11, 23, 11) });
  try {
    assert.match(call(p)?.textContent || '', /^Season Preview Winter 2027 · noch 9 Tage$/);
    assert.equal(call(p).getAttribute('href'), 'season-preview.html');
    assert.equal(inMenu(p).hidden, true);
  } finally { p.close(); }
});

test('the day before: "morgen"', () => {
  return openPage({ now: Date.UTC(2026, 11, 31, 11) }).then(p => {
    try { assert.match(call(p)?.textContent || '', /Winter 2027 · morgen/); } finally { p.close(); }
  });
});
