import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// An absence entered from someone's Schichtplan (shift-plan.json "applied") is marked as such in the week
// table and the list; the same absence entered by hand is not
const tick = () => new Promise(r => setTimeout(r, 30));
const open = async (absent, shiftPlan) => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], absent }, shiftPlan });
  p.window.Element.prototype.scrollIntoView = () => {};
  await tick();
  await p.click(p.$('awayButton'));
  return p;
};
const plan = { plans: [{ person: 'Belly', applied: { '2026-10-29': '22:00' } }] };
test('from the Schichtplan: "bis 22:00" with a "Schicht" mark, and "aus dem Schichtplan" in the list', async () => {
  const p = await open([{ day: '2026-10-29', people: ['Belly'], until: '22:00' }, { day: '2026-10-30', people: ['MaRyo'], until: '22:00' }], plan);
  try {
    const rows = [...p.$('awayList').querySelectorAll('li')].map(li => li.textContent);
    assert.ok(rows.some(t => /Belly.*29\. Okt\. · bis 22:00 · aus dem Schichtplan/.test(t)), rows.join(' | '));
    assert.ok(rows.some(t => /MaRyo.*30\. Okt\. · bis 22:00/.test(t) && !/Schichtplan/.test(t)), rows.join(' | '));
    await p.click(p.$('awayTabWeek'));
    const shift = p.$('awayWeek').querySelector('.aw-shift');
    assert.ok(shift, 'the Schichtplan day is marked');
    assert.match(shift.textContent, /bis 22:00\s*Schicht/);
    assert.match(shift.title, /aus dem Schichtplan/);
    assert.equal(p.$('awayWeek').querySelectorAll('.aw-shift').length, 1);
  } finally { p.close(); }
});
test('changed by hand (another time): no mark any more', async () => {
  const p = await open([{ day: '2026-10-29', people: ['Belly'], until: '21:00' }], plan);
  try {
    await p.click(p.$('awayTabWeek'));
    assert.equal(p.$('awayWeek').querySelector('.aw-shift'), null);
  } finally { p.close(); }
});
