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

test('U66: the dialog says "Verschoben bis …", and "Zurücksetzen" ends the whole series from this week on', async () => {
  const weeks = ['2026-10-26', '2026-11-02', '2026-11-09'];
  const p = await openPage({ storage: { movesKey: 'k' }, movesFile: { moves: [
    ...weeks.map(week => ({ show: 'showalpha', title: 'Alpha EN', tag: 'Do.', time: '21:30', week })),
    { show: 'showalpha', title: 'Alpha EN', tag: 'Fr.', time: '20:00', week: '2026-11-16' },
    { show: 'showbeta', title: 'Beta EN', tag: 'So.', time: '', week: '2026-11-02' }] } });
  try {
    await p.click(moveButton(p, 'Alpha EN'));
    assert.match(p.$('moveFrom').textContent, /Verschoben bis 15\. Nov\./);
    await p.click(p.$('moveReset'), 300);
    const left = p.state.movesSaved.moves.map(m => [m.title, m.week, m.tag]);
    // the series is gone; a different move later and other shows stay
    assert.deepEqual(left, [['Alpha EN', '2026-11-16', 'Fr.'], ['Beta EN', '2026-11-02', 'So.']]);
  } finally { p.close(); }
});
