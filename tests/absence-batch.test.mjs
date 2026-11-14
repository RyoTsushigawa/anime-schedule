import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U62 affected shows before saving, U56 overlapping series, U51 undo a removed absence
// "Today" in the harness: Wed 28 Oct 2026. Alpha Wed (MaRyo + Belly), Gamma Thu (MaRyo + Belly), Beta Sat (MaRyo).
const tick = () => new Promise(r => setTimeout(r, 30));
const open = async file => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], ...file } });
  p.window.Element.prototype.scrollIntoView = () => {};
  await p.click(p.$('awayButton'));
  return p;
};

test('U62: the recurring form names the shows the chosen people watch on the chosen weekdays', async () => {
  const p = await open({});
  try {
    await p.click(p.$('awayTabRecurring'));
    for (const b of p.$('repPeople').querySelectorAll('[aria-pressed="true"]')) b.click();
    await p.click(p.$('repPeople').querySelector('[data-rep-person="Belly"]'));
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="2"]')); // Wednesday
    await tick();
    assert.match(p.$('repAffected').textContent, /Betroffen: Alpha EN/);
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="5"]')); // + Saturday: Beta isn't Belly's
    await tick();
    assert.doesNotMatch(p.$('repAffected').textContent, /Beta/);
  } finally { p.close(); }
});

test('U56: two series of the same person on the same weekday are flagged as overlapping', async () => {
  const p = await open({ absentRules: [
    { id: 'a', person: 'Rei', weekdays: [1], start: '2026-10-01' },
    { id: 'b', person: 'Rei', weekdays: [1, 3], start: '2026-10-15', from: '21:00' },
    { id: 'c', person: 'Belly', weekdays: [1], start: '2026-10-01' },
  ] });
  try {
    await p.click(p.$('awayTabRecurring'));
    const text = p.$('repList').textContent;
    assert.equal((text.match(/überschneidet sich/g) || []).length, 2, text);
  } finally { p.close(); }
});

test('U51: a removed series comes back with "Rückgängig"', async () => {
  const rule = { id: 'r1', person: 'Rei', weekdays: [4], start: '2026-10-01' };
  const p = await open({ absentRules: [rule] });
  try {
    p.window.confirm = () => true;
    await p.click(p.$('awayTabRecurring'));
    await p.click(p.$('repList').querySelector('[data-rule-remove]'), 300);
    assert.equal(p.state.movesSaved.absentRules, undefined, 'removed');
    const undo = [...p.$('awayMsg').querySelectorAll('button')].find(b => b.textContent === 'Rückgängig');
    assert.ok(undo, p.$('awayMsg').textContent);
    await p.click(undo, 300);
    assert.deepEqual(p.state.movesSaved.absentRules.map(({ id, ...r }) => r), [{ person: 'Rei', weekdays: [4], start: '2026-10-01' }]);
    assert.match(p.$('awayMsg').textContent, /Wiederhergestellt/);
  } finally { p.close(); }
});
