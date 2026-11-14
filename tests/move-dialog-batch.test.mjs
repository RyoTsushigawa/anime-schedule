import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U61 / U63 warnings in the move dialog, U66 "Bis …" (a move for a few weeks, then back to the Guckplan slot)
// Test week: Mon 26 Oct 2026. Alpha Wed 20:00 (out Wed 15:00, MaRyo + Belly), Beta Sat (out Fri 17:00, MaRyo).

const moveButton = (p, name) => [...p.$('list').querySelectorAll('button.move')].find(b => b.dataset.moveName === name);
const set = (p, id, value) => { p.$(id).value = value; p.$(id).dispatchEvent(new p.window.Event(id === 'moveTime' ? 'input' : 'change')); };

test('U63: a slot before the episode is out gets a warning; a later one none', async () => {
  const p = await openPage({ storage: { movesKey: 'k' } });
  try {
    await p.click(moveButton(p, 'Alpha EN'));
    set(p, 'moveTag', 'Di.'); set(p, 'moveTime', '20:00');
    assert.match(p.$('moveWarn').textContent, /kommt erst .*15:00 raus/);
    set(p, 'moveTag', 'Do.');
    assert.equal(p.$('moveWarn').textContent, '');
  } finally { p.close(); }
});

test('U61: the same slot as another show of the same people gets a warning, with the names', async () => {
  const p = await openPage({ storage: { movesKey: 'k' } });
  try {
    await p.click(moveButton(p, 'Beta EN'));
    set(p, 'moveTag', 'Sa.'); set(p, 'moveTime', '20:00');
    set(p, 'moveTag', 'Mi.');
    assert.match(p.$('moveWarn').textContent, /läuft schon Alpha EN \(mit MaRyo\)/);
    assert.match(p.$('moveWarn').textContent, /kommt erst/, 'Beta is only out on Friday');
  } finally { p.close(); }
});

test('U66: "Bis …" saves one move per week up to the chosen week, then the Guckplan slot counts again', async () => {
  const p = await openPage({ storage: { movesKey: 'k' } });
  try {
    await p.click(moveButton(p, 'Alpha EN'));
    await p.click(p.$('moveUntil'));
    assert.equal(p.$('moveUntilWeek').hidden, false);
    assert.equal(p.$('moveUntilWeek').options.length, 7);
    p.$('moveUntilWeek').value = '2';
    set(p, 'moveTag', 'Do.'); set(p, 'moveTime', '21:30');
    await p.click(p.$('moveSave'), 300);
    const saved = p.state.movesSaved.moves.filter(m => m.title === 'Alpha EN');
    assert.deepEqual(saved.map(m => [m.week, m.tag, m.time]), [['2026-10-26', 'Do.', '21:30'], ['2026-11-02', 'Do.', '21:30'], ['2026-11-09', 'Do.', '21:30']]);
    assert.ok(saved.every(m => m.week), 'no permanent move');
  } finally { p.close(); }
});
