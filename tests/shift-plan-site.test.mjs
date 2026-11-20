import test from 'node:test';
import assert from 'node:assert/strict';
import { readShifts } from '../tools/shift-text.mjs';
import { applyPlan } from '../tools/shift-plan.mjs';
// The daily job: Marius's Schichtplan from Discord → "abwesend bis …" in moves.json; hand-made entries stay
const message = `Ab dem 5.10.26-13.09.27 montags und mittwochs erst ab 21 Uhr da

Arbeitszeiten November
Woche 1: 16.11-21.11
Montag und Freitag 16:00 Uhr, Dienstag 22:00 Uhr, Donnerstag und Samstag 15 Uhr, Mittwoch frei. Montag und Mittwoch 17:30-20:45 Abendschule.

Woche 2: 23.11-28.11
Montag, Dienstag und Freitag 15:00 Uhr, Donnerstag und Samstag 22:00 Uhr, Mittwoch frei. Montag und Mittwoch 17:30-20:45 Abendschule.`;
const today = '2026-11-21';
test('the late days from today on are entered; a hand-made whole day stays; Rei untouched', () => {
  const absent = [{ day: '2026-11-26', people: ['Rei'] }, { day: '2026-11-28', people: ['Marius'] }];
  const r = applyPlan(absent, { person: 'Marius', applied: {} }, readShifts(message, today), today);
  assert.equal(r.changed, true);
  assert.deepEqual(r.absent, [
    { day: '2026-11-26', people: ['Rei'] },
    { day: '2026-11-26', people: ['Marius'], until: '22:00' },
    { day: '2026-11-28', people: ['Marius'] },
  ]);
  assert.deepEqual(r.applied, { '2026-11-26': '22:00' });
  assert.deepEqual(absent[1], { day: '2026-11-28', people: ['Marius'] }, 'the input is not changed');
});
test('an edit: a day no longer late goes (only the job\'s own); the same text again changes nothing', () => {
  const plan = { person: 'Marius', applied: { '2026-11-26': '22:00' } };
  const absent = [{ day: '2026-11-26', people: ['Marius'], until: '22:00' }];
  const edited = message.replace('Donnerstag und Samstag 22:00 Uhr', 'Donnerstag und Samstag 15:00 Uhr');
  const r = applyPlan(absent, plan, readShifts(edited, today), today);
  assert.deepEqual(r.absent, []);
  assert.deepEqual(r.applied, {});
  const again = applyPlan(r.absent, { ...plan, applied: r.applied }, readShifts(edited, today), today);
  assert.equal(again.changed, false);
});
test('someone changed the job\'s entry by hand: from then on it is theirs', () => {
  const plan = { person: 'Marius', applied: { '2026-11-26': '22:00' } };
  const absent = [{ day: '2026-11-26', people: ['Marius'] }]; // made a whole day by hand
  const r = applyPlan(absent, plan, readShifts(message, today), today);
  assert.deepEqual(r.absent.filter(x => x.day === '2026-11-26'), [{ day: '2026-11-26', people: ['Marius'] }]);
  assert.equal('2026-11-26' in r.applied, false);
  assert.deepEqual(r.applied, { '2026-11-28': '22:00' }); // Saturday is still the job's to enter
});
