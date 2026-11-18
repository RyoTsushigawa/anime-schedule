import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U: a Skip icon next to Verspätung switches the Skip buttons on; a skipped show gets ↺ to bring it back

test('the Skip icon in the day heading shows a Skip button on each upcoming show, and hides them again', async () => {
  const p = await openPage({ storage: { movesKey: 'k' } });
  try {
    const icon = p.$('list').querySelector('[data-day-skip]');
    assert.ok(icon, 'editors see the Skip icon');
    assert.equal(p.$('list').querySelectorAll('.bulk-skip-pick').length, 0);
    await p.click(icon);
    assert.ok(p.$('list').querySelectorAll('.bulk-skip-pick').length > 0);
    assert.equal(p.$('list').querySelector('[data-day-skip]').getAttribute('aria-pressed'), 'true');
    await p.click(p.$('list').querySelector('[data-day-skip]'));
    assert.equal(p.$('list').querySelectorAll('.bulk-skip-pick').length, 0);
  } finally { p.close(); }
});

test('without edit access there is no Skip icon', async () => {
  const p = await openPage({});
  try { assert.equal(p.$('list').querySelector('[data-day-skip]'), null); } finally { p.close(); }
});

test('↺ on a skipped show removes the skip for this week', async () => {
  const skip = { show: 'showalpha', title: 'Show Alpha', tag: 'Mi.', time: '20:00', week: '2026-10-26', skip: true };
  const p = await openPage({ storage: { movesKey: 'k' }, movesFile: { moves: [skip] } });
  try {
    await p.click(p.$('list').querySelector('[data-day-skip]'));
    const back = p.$('list').querySelector('.bulk-unskip');
    assert.ok(back, 'the skipped show has ↺');
    await p.click(back, 500);
    assert.deepEqual(p.state.movesSaved.moves.filter(m => m.skip), []);
    assert.match(p.$('noticeText').textContent, /Skip aufgehoben/);
  } finally { p.close(); }
});
