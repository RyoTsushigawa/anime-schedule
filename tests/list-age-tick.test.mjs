import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Catch-up says when the list was last loaded ("Stand 12:00" next to ↻); after a tick the card stays a moment with
// "✓ Gespeichert" before the list changes, so the next show doesn't slide under the pointer at once.
const auth = { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' };
const list = { 1: { status: 'CURRENT', progress: 2 }, 2: { status: 'CURRENT', progress: 0 } };

test('Catch-up shows when the list was loaded', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    await p.click(p.$('viewCatchup'));
    assert.equal(p.$('listAge').hidden, false);
    assert.match(p.$('listAge').textContent, /^Stand \d\d:\d\d$/);
    assert.match(p.$('listAge').title, /zuletzt von AniList geladen/i);
  } finally { p.close(); }
});

test('a tick holds the card with a confirmation before the list redraws', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    await p.click(p.$('viewCatchup'));
    const tick = p.$('list').querySelector('.watch:not(.done)[data-media]');
    assert.ok(tick);
    const row = tick.closest('.row');
    p.click(tick, 0);
    await new Promise(r => setTimeout(r, 300));
    assert.ok(row.isConnected && row.classList.contains('just-saved'), 'still there, marked');
    assert.match(row.querySelector('.saved-tag').textContent, /Gespeichert/);
    await p.settle?.();
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(p.$('list').querySelector('.saved-tag'), null, 'redrawn after the hold');
  } finally { p.close(); }
});
