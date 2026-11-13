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

const fill = async (p, { people, days, mode, clock, from, until }) => {
  for (const b of p.$('repPeople').querySelectorAll('[aria-pressed="true"]')) b.click();
  for (const name of people) await p.click(p.$('repPeople').querySelector(`[data-rep-person="${name}"]`));
  for (const b of p.$('repWeekdays').querySelectorAll('[aria-pressed="true"]')) b.click();
  for (const d of days) await p.click(p.$('repWeekdays').querySelector(`[data-rep-day="${d}"]`));
  await p.click(p.$('repMode').querySelector(`[data-mode="${mode || 'day'}"]`));
  if (clock) p.$('repClock').value = clock;
  if (from) p.$('repFrom').value = from;
  p.$('repOpen').checked = !until;
  if (until) p.$('repUntil').value = until;
  p.$('repOpen').dispatchEvent(new p.window.Event('change'));
  if (until) { p.$('repUntil').value = until; p.$('repUntil').dispatchEvent(new p.window.Event('change')); }
};

test('the form saves a rule without an end, and the schedule reads it far ahead', async () => {
  const p = await open([]);
  try {
    await p.click(p.$('awayTabRecurring'));
    await fill(p, { people: ['Belly'], days: [1, 3], mode: 'from', clock: '22:00', from: '2026-11-01' });
    assert.match(p.$('repSummary').textContent, /Erster Termin Di 3\. Nov\. · ohne Ende/);
    await p.click(p.$('repSave'), 300);
    const file = p.state.movesSaved;
    assert.equal(file.absent, undefined);
    assert.equal(file.absentRules.length, 1);
    const { id, ...rule } = file.absentRules[0];
    assert.match(id, /^[a-z0-9]{8}$/);
    assert.deepEqual(rule, { person: 'Belly', weekdays: [1, 3], start: '2026-11-01', from: '22:00' });
    assert.deepEqual(rows(p, 'repList'), ['Belly jeden Di, Do · ab 22:00 · ab So 1. Nov. · bis auf Weiteres']);
    // a Tuesday next autumn, still there
    assert.equal(p.run("awayAt('2027-10-26', 'Belly', 22 * 60 + 30)"), true);
    assert.equal(p.run("awayAt('2027-10-26', 'Belly', 21 * 60)"), false);
    assert.equal(p.run("awayAt('2027-10-27', 'Belly', 22 * 60 + 30)"), false);
  } finally { p.close(); }
});

test('a rule with an end date stops there', async () => {
  const p = await open([]);
  try {
    await p.click(p.$('awayTabRecurring'));
    await fill(p, { people: ['MaRyo'], days: [5], until: '2026-11-21' });
    assert.match(p.$('repSummary').textContent, /Erster Termin Sa 31\. Okt\. · letzter Sa 21\. Nov\./);
    await p.click(p.$('repSave'), 300);
    assert.equal(p.state.movesSaved.absentRules[0].end, '2026-11-21');
    assert.equal(p.run("JSON.stringify(absentOn('2026-11-21'))"), JSON.stringify(['MaRyo']));
    assert.equal(p.run("JSON.stringify(absentOn('2026-11-28'))"), JSON.stringify([]));
  } finally { p.close(); }
});

test('changing one day of a rule in the calendar saves an exception, undoing it removes the exception', async () => {
  const rule = { id: 'abcd1234', person: 'MaRyo', weekdays: [5], start: '2026-10-28' };
  const p = await openPage({ storage: { movesKey: 'fixture-only' }, movesFile: { moves: [], absentRules: [rule] } });
  try {
    p.window.Element.prototype.scrollIntoView = () => {};
    await p.click(p.$('awayButton'));
    await p.click(p.$('awayGrid').querySelector('[data-away-day="2026-10-31"]'));
    const chip = () => p.$('awayPeople').querySelector('[data-away="MaRyo"]');
    assert.equal(chip().getAttribute('aria-pressed'), 'true');
    await p.click(chip());
    await p.click(p.$('awaySave'), 300);
    assert.deepEqual(p.state.movesSaved.absentRules, [{ ...rule, skip: ['2026-10-31'] }]);
    assert.equal(p.state.movesSaved.absent, undefined);
    assert.equal(p.run("JSON.stringify(absentOn('2026-10-31'))"), JSON.stringify([]));
    assert.equal(p.run("JSON.stringify(absentOn('2026-11-07'))"), JSON.stringify(['MaRyo']));
    await p.click(p.$('awayGrid').querySelector('[data-away-day="2026-10-31"]'));
    await p.click(chip());
    await p.click(p.$('awaySave'), 300);
    assert.deepEqual(p.state.movesSaved.absentRules, [rule]);
    assert.equal(p.state.movesSaved.absent, undefined);
  } finally { p.close(); }
});

test('an old series of single days becomes a rule when changed; ✕ ends a rule', async () => {
  const p = await open([...weekly('2026-11-03', 4, ['Belly', 'Rei']), { day: '2026-11-05', people: ['Belly'] }]);
  try {
    await p.click(p.$('awayTabRecurring'));
    await p.click(p.$('repList').querySelector('[data-away-edit]'));
    assert.equal(p.$('repFormTitle').textContent, 'Wiederholung ändern');
    assert.equal(p.$('repFrom').value, '2026-11-03');
    assert.equal(p.$('repUntil').value, '2026-11-24');
    await p.click(p.$('repPeople').querySelector('[data-rep-person="Rei"]'));      // only Belly from now on
    p.$('repOpen').checked = true; p.$('repOpen').dispatchEvent(new p.window.Event('change'));
    await p.click(p.$('repSave'), 300);
    const file = p.state.movesSaved;
    assert.deepEqual(file.absent, [{ day: '2026-11-05', people: ['Belly'] }]);
    assert.deepEqual(file.absentRules.map(({ id, ...r }) => r), [{ person: 'Belly', weekdays: [1], start: '2026-11-03' }]);
    p.window.confirm = () => true;
    await p.click(p.$('repList').querySelector('[data-rule-remove]'), 300);
    assert.equal(p.state.movesSaved.absentRules, undefined);
    assert.deepEqual(p.state.movesSaved.absent, [{ day: '2026-11-05', people: ['Belly'] }]);
  } finally { p.close(); }
});

test('without the GitHub key, rules go to the save service, which must give them back', async () => {
  for (const helper of ['v19', 'v18']) {
    const p = await openPage({ config: { delaysUrl: 'https://helper.test/' }, movesFile: { moves: [] },
      delaysReply: op => ({ moves: [], ...(op.absent.length && { absent: op.absent }), ...(helper === 'v19' && op.rules?.length && { absentRules: op.rules }) }) });
    try {
      p.window.Element.prototype.scrollIntoView = () => {};
      await p.click(p.$('awayButton'));
      await p.click(p.$('awayTabRecurring'));
      await fill(p, { people: ['Belly'], days: [4] });
      await p.click(p.$('repSave'), 300);
      const post = p.state.delayPosts.at(-1);
      assert.deepEqual(post.days, []);
      assert.equal(post.rules.length, 1);
      if (helper === 'v19') assert.match(p.$('awayMsg').textContent, /Belly: jeden Fr, ganztägig, bis auf Weiteres/);
      else assert.match(p.$('awayMsg').textContent, /Nicht gespeichert: .*v19/);
    } finally { p.close(); }
  }
});

test('daily open-ended absences group matching people and stay active beyond one year', async t => {
  const p = await open([{ day: '2026-11-01', people: ['Sophie'] }]);
  t.after(() => p.close());
  await p.click(p.$('awayTabRecurring'));
  await fill(p, { people: ['Belly', 'MaRyo'], days: [], from: '2026-11-03' });
  await p.click(p.$('repDaily'));
  assert.equal(p.$('repDaily').getAttribute('aria-pressed'), 'true');
  await p.click(p.$('repSave'), 300);
  const file = p.state.movesSaved;
  assert.deepEqual(file.absent, [{ day: '2026-11-01', people: ['Sophie'] }]);
  assert.deepEqual(file.absentRules.map(({ id, ...rule }) => rule), ['Belly', 'MaRyo'].map(person => ({
    person, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '2026-11-03'
  })));
  assert.deepEqual(rows(p, 'repList'), ['Belly MaRyo täglich · ganztägig · ab Di 3. Nov. · bis auf Weiteres']);
  assert.equal(p.run("awayAt('2026-11-02', 'Belly', null)"), false);
  assert.equal(p.run("awayAt('2029-01-01', 'Belly', null)"), true);
  assert.equal(p.run("awayAt('2029-01-02', 'Belly', null)"), true);
  assert.equal(p.run("awayText('2029-01-01').join(', ')"), 'Belly, MaRyo');
  p.window.confirm = () => true;
  await p.click(p.$('repList').querySelector('[data-rule-remove]'), 300);
  assert.equal(p.run("awayAt('2029-01-01', 'Belly', null)"), false);
});
