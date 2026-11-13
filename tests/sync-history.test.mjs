import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// N44: every ✓ (and failure) lands in Settings > Sync-Verlauf, newest first
const auth = { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' };

test('a ✓ is listed with the show, the episodes and the account', async () => {
  const p = await openPage({ storage: auth, list: { 1: { status: 'CURRENT', progress: 3 } } });
  try {
    await p.click(p.$('viewWeek'));
    const tick = p.$('list').querySelector('.watch[data-media="1"]');
    assert.ok(tick);
    await p.click(tick, 400);
    await p.click(p.$('settingsButton'));
    await p.click(p.$('syncButton'));
    const item = p.$('syncList').querySelector('li');
    assert.match(item.textContent, /✓ Alpha EN/);
    assert.match(item.textContent, /Folge 3 → 4/);
    assert.match(item.textContent, /AniList Tester/);
    await p.click(p.$('syncClear'));
    assert.match(p.$('syncList').textContent, /Noch nichts gespeichert/);
  } finally { p.close(); }
});

test('a failed save is listed as failed, with the reason', async () => {
  const p = await openPage({ storage: auth, list: { 1: { status: 'CURRENT', progress: 3 } } });
  try {
    await p.click(p.$('viewWeek'));
    // the save itself fails (without AniList's long retry waits)
    p.run("anilistAsMe = async () => { throw new Error('Testfehler'); }");
    await p.click(p.$('list').querySelector('.watch[data-media="1"]'), 600);
    await p.click(p.$('settingsButton'));
    await p.click(p.$('syncButton'));
    assert.match(p.$('syncList').querySelector('li.failed').textContent, /✕ Alpha EN.*Nicht gespeichert/s);
  } finally { p.close(); }
});
