import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// The absence dialog: one-off entries in the Kalender tab, weekly series in Wiederkehrend with their own form.
// "Today" in the harness is Wed 28 Oct 2026.
const weekly = (first, n, people, extra = {}) => Array.from({ length: n }, (_, i) => {
  const d = new Date(first + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7 * i);
  return { day: d.toISOString().slice(0, 10), people, ...extra };
});
const open = async absent => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], absent } });
  p.window.Element.prototype.scrollIntoView = () => {};
  await p.click(p.$('awayButton'));
  return p;
};
const rows = (p, id) => [...p.$(id).querySelectorAll('li')].map(li => li.querySelector('.away-what')
  ? [...li.querySelectorAll('.away-who')].map(w => w.textContent).join(' ') + ' ' + li.querySelector('.away-what').textContent
  : li.textContent.trim());

test('weekly series are only in Wiederkehrend, one row for people with the same days', async () => {
  const p = await open([
    ...weekly('2026-10-31', 6, ['Sophie', 'Rei']),
    ...weekly('2026-11-02', 4, ['MaRyo'], { from: '21:00' }),
    { day: '2026-10-30', people: ['Belly'] }, { day: '2026-11-01', people: ['Sophie'] },
  ].sort((a, b) => a.day.localeCompare(b.day)));
  try {
    assert.deepEqual(rows(p, 'awayList'), ['Belly Fr 30. Okt. · ganztägig', 'Sophie So 1. Nov. · ganztägig']);
    await p.click(p.$('awayTabRecurring'));
    assert.equal(p.$('awayCalendarPanel').hidden, true);
    assert.deepEqual(rows(p, 'repList'), ['Rei Sophie jeden Sa · ganztägig · bis Sa 5. Dez.', 'MaRyo jeden Mo · ab 21:00 · bis Mo 23. Nov.']);
  } finally { p.close(); }
});

test('a long stretch of days is one entry, not a weekly series', async () => {
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 2 + i)); return { day: d.toISOString().slice(0, 10), people: ['Rei'] }; });
  const p = await open(days);
  try {
    assert.deepEqual(rows(p, 'awayList'), ['Rei Mo 2. Nov. – So 22. Nov. · ganztägig']);
    await p.click(p.$('awayTabRecurring'));
    assert.match(rows(p, 'repList')[0], /Noch keine Wiederholung/);
  } finally { p.close(); }
});

test('the form saves every chosen weekday between the two dates', async () => {
  const p = await open([]);
  try {
    await p.click(p.$('awayTabRecurring'));
    for (const b of p.$('repPeople').querySelectorAll('[aria-pressed="true"]')) b.click();
    await p.click(p.$('repPeople').querySelector('[data-rep-person="Belly"]'));
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="1"]'));   // Di
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="3"]'));   // Do
    await p.click(p.$('repMode').querySelector('[data-mode="from"]'));
    p.$('repClock').value = '22:00';
    p.$('repFrom').value = '2026-11-01'; p.$('repUntil').value = '2026-11-30';
    p.$('repUntil').dispatchEvent(new p.window.Event('change'));
    assert.match(p.$('repSummary').textContent, /^8 Termine · Di 3\. Nov\. bis Do 26\. Nov\./);
    await p.click(p.$('repSave'), 300);
    const saved = p.state.movesSaved.absent;
    assert.deepEqual(saved.map(x => x.day), ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19', '2026-11-24', '2026-11-26']);
    assert.ok(saved.every(x => x.from === '22:00' && x.people.join() === 'Belly'));
    assert.deepEqual(rows(p, 'repList'), ['Belly jeden Di · ab 22:00 · bis Di 24. Nov.', 'Belly jeden Do · ab 22:00 · bis Do 26. Nov.']);
  } finally { p.close(); }
});

test('changing a series replaces its remaining days, ✕ removes them; other people stay', async () => {
  const p = await open([...weekly('2026-11-03', 4, ['Belly', 'Rei'])]);
  try {
    await p.click(p.$('awayTabRecurring'));
    await p.click(p.$('repList').querySelector('[data-away-edit]'));
    assert.equal(p.$('repFormTitle').textContent, 'Wiederholung ändern');
    assert.equal(p.$('repFrom').value, '2026-11-03');
    assert.equal(p.$('repUntil').value, '2026-11-24');
    await p.click(p.$('repPeople').querySelector('[data-rep-person="Rei"]'));      // only Belly from now on
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="1"]'));
    await p.click(p.$('repWeekdays').querySelector('[data-rep-day="2"]'));         // Mi instead of Di
    await p.click(p.$('repSave'), 300);
    assert.deepEqual(p.state.movesSaved.absent.map(x => x.day + ' ' + x.people.join()), ['2026-11-04 Belly', '2026-11-11 Belly', '2026-11-18 Belly']);
    p.window.confirm = () => true;
    await p.click(p.$('repList').querySelector('[data-away-remove]'), 300);
    assert.deepEqual(p.state.movesSaved.absent || [], []);
  } finally { p.close(); }
});
