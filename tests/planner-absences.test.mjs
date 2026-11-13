import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// U74: the Watch-Planer takes recurring absences over as busy times
const source = readFileSync(new URL('../planner.js', import.meta.url), 'utf8');
const start = source.indexOf('function absenceBusy('), end = source.indexOf('function busyRows(', start);
assert.ok(start > 0 && end > start);
const norm = s => String(s || '').toLowerCase().trim();
const absenceBusy = new Function('norm', source.slice(start, end) + '\nreturn absenceBusy;')(norm);

test('whole day, ab and bis become busy times; spontan da, ended rules and unknown people do not', () => {
  const rules = [
    { person: 'Sophie', weekdays: [5], start: '2026-11-01' },
    { person: 'rei', weekdays: [0, 3], start: '2026-11-01', from: '21:00' },
    { person: 'Belly', weekdays: [2], start: '2026-11-01', until: '20:30' },
    { person: 'MaRyo', weekdays: [1], start: '2026-11-01', maybe: true },
    { person: 'Terra', weekdays: [4], start: '2026-01-01', end: '2026-02-01' },
    { person: 'Stranger', weekdays: [6], start: '2026-11-01' },
  ];
  const out = absenceBusy(rules, ['Sophie', 'Rei', 'Belly', 'MaRyo', 'Terra'], '2026-11-13');
  assert.deepEqual(out.map(e => [e.person, e.day, e.from, e.to]), [
    ['Sophie', 5, '', ''], ['Rei', 0, '21:00', '04:59'], ['Rei', 3, '21:00', '04:59'], ['Belly', 2, '12:00', '20:30']]);
  assert.ok(out.every(e => /wiederkehrend/.test(e.note)));
});
