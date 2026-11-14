import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// An optional reason for an absence, typed freely ("Today" in the harness: Wed 28 Oct 2026)
const open = async file => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], ...file } });
  p.window.Element.prototype.scrollIntoView = () => {};
  await p.click(p.$('awayButton'));
  return p;
};

test('a reason can be typed freely (or left out) and is saved with the absence, cleaned', async () => {
  const p = await open({});
  try {
    assert.equal(p.$('awayReason').tagName, 'INPUT');
    assert.equal(p.$('awayReason').maxLength, 60);
    await p.click(p.$('awayGrid').querySelector('[data-away-day="2026-10-30"]'));
    for (const b of p.$('awayPeople').querySelectorAll('[aria-pressed="true"]')) b.click();
    await p.click(p.$('awayPeople').querySelector('[data-away="Belly"]'));
    p.$('awayReason').value = '  Urlaub   in <Rom>  ';
    await p.click(p.$('awaySave'), 300);
    assert.deepEqual(p.state.movesSaved.absent, [{ day: '2026-10-30', people: ['Belly'], reason: 'Urlaub in Rom' }]);
    assert.match(p.$('awayList').textContent, /Belly.*Fr\.?,? ?30\. Okt\..*ganztägig · Urlaub in Rom/s);
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

test('a link in the reason is not saved', async () => {
  const p = await open({});
  try {
    await p.click(p.$('awayGrid').querySelector('[data-away-day="2026-10-30"]'));
    await p.click(p.$('awayPeople').querySelector('[data-away="Belly"]'));
    p.$('awayReason').value = 'siehe discord.gg/abc';
    await p.click(p.$('awaySave'), 200);
    assert.match(p.$('awayMsg').textContent, /keine Links/);
    assert.equal(p.state.movesSaved, undefined);
  } finally { p.close(); }
});
