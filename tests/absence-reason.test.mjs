import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// An optional reason for an absence, picked from a short list ("Today" in the harness: Wed 28 Oct 2026)
const open = async file => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], ...file } });
  p.window.Element.prototype.scrollIntoView = () => {};
  await p.click(p.$('awayButton'));
  return p;
};

test('a reason can be picked (or left out) and is saved with the absence', async () => {
  const p = await open({});
  try {
    assert.deepEqual([...p.$('awayReason').options].map(o => o.value), ['', 'Arbeit', 'Schule/Uni', 'Urlaub', 'Krank', 'Familie', 'Termin', 'Unterwegs']);
    await p.click(p.$('awayGrid').querySelector('[data-away-day="2026-10-30"]'));
    for (const b of p.$('awayPeople').querySelectorAll('[aria-pressed="true"]')) b.click();
    await p.click(p.$('awayPeople').querySelector('[data-away="Belly"]'));
    p.$('awayReason').value = 'Urlaub';
    await p.click(p.$('awaySave'), 300);
    assert.deepEqual(p.state.movesSaved.absent, [{ day: '2026-10-30', people: ['Belly'], reason: 'Urlaub' }]);
    assert.match(p.$('awayList').textContent, /Belly.*Fr\.?,? ?30\. Okt\..*ganztägig · Urlaub/s);
  } finally { p.close(); }
});

test('without a reason nothing extra is saved; the plan shows a saved reason next to the name', async () => {
  const p = await open({ absent: [{ day: '2026-10-28', people: ['Belly'], from: '21:00', reason: 'Arbeit' }, { day: '2026-10-29', people: ['Belly'] }] });
  try {
    p.$('awayDlg').close();
    await p.settle(300);
    assert.match(p.$('list').textContent, /Abwesend: Belly \(ab 21:00, Arbeit\)/);
    assert.match(p.$('list').textContent, /Abwesend: Belly(?! \()/);
    // editing the entry brings its reason back into the form
    await p.click(p.$('awayButton'));
    const edit = [...p.$('awayList').querySelectorAll('[data-away-edit]')].find(b => /Arbeit/.test(b.getAttribute('aria-label')));
    await p.click(edit);
    assert.equal(p.$('awayReason').value, 'Arbeit');
  } finally { p.close(); }
});
