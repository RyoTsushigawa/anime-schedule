import test from 'node:test';
import assert from 'node:assert/strict';

const source = APP_SOURCE;
function extract(name) {
 const start = source.indexOf('function ' + name + '(');
 assert.ok(start >= 0, name + ' exists');
 const begin = source.indexOf('{', start);
 let depth = 0;
 for (let i = begin; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
 }
 throw Error('Unclosed function: ' + name);
}
const slim = source.match(/const slimMedia = .*\n/)[0];
const plan = new Function('rows', 'days', 'max', 'week', 'existing', `${slim}${extract('autoCatchupPlan')}\nreturn autoCatchupPlan(rows, days, max, week, existing);`);
const at = day => Date.parse(day + 'T20:00:00Z') / 1000;
const row = (id, first, out, next = 0, missing = false) => ({ m: { id, title: { english: 'Show ' + id }, coverImage: {} }, first, out, nextAt: next, missing });
const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];

test('spreads shows over the evenings, never more than the limit per evening', () => {
 const { entries, left } = plan([row(1, 3, 4), row(2, 1, 2), row(3, 5, 5), row(4, 2, 3)], days, 2, '2026-11-09', []);
 const perDay = Object.fromEntries(days.map(d => [d, entries.filter(e => e.day === d).reduce((n, e) => n + e.last - e.first + 1, 0)]));
 assert.ok(Object.values(perDay).every(n => n <= 2), JSON.stringify(perDay));
 assert.equal(entries.reduce((n, e) => n + e.last - e.first + 1, 0) + left, 7);
 assert.equal(left, 0);
 assert.ok(entries.every(e => e.extra && e.week === '2026-11-09' && e.time === '' && e.show === 'extra:' + e.media.id));
});
test('a show whose next episode comes soon goes first, on an evening before that episode', () => {
 const { entries } = plan([row(1, 1, 2), row(2, 4, 5, at('2026-11-13'))], days, 2, '2026-11-09', []);
 assert.equal(entries[0].media.id, 2);
 assert.equal(entries[0].day, '2026-11-12');
});
test('too many episodes: the rest waits for next week; shows only in the Guckplan are left out', () => {
 const { entries, left } = plan([row(1, 1, 10), row(2, 1, 3, 0, true)], ['2026-11-15'], 3, '2026-11-09', []);
 assert.deepEqual(entries.map(e => [e.first, e.last]), [[1, 3]]);
 assert.equal(left, 7);
});
test('catch-up already planned for other shows counts towards the limit', () => {
 const existing = [{ show: 'extra:9', extra: true, week: '2026-11-09', day: '2026-11-12', first: 1, last: 2 }];
 const { entries } = plan([row(1, 1, 1)], ['2026-11-12', '2026-11-13'], 2, '2026-11-09', existing);
 assert.equal(entries[0].day, '2026-11-13');
});
import { openPage } from './harness.mjs';
import { APP_SOURCE } from './app-source.mjs';
test('Catch-up: "Automatisch einplanen" previews the open episodes on this week\'s evenings', async () => {
 const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester', movesKey: 'fixture-only' },
  list: { 1: { status: 'CURRENT', progress: 0 }, 2: { status: 'CURRENT', progress: 0 } } });
 await p.click(p.$('viewCatchup'));
 const open = p.$('autoPlanOpen');
 assert.ok(open, 'button shown with the helper key');
 await p.click(open);
 assert.equal(p.$('autoPlanDlg').open, true);
 const days = p.$('autoPlanDays').querySelectorAll('input:checked').length;
 assert.ok(days >= 1);
 const preview = p.$('autoPlanPreview').textContent;
 assert.match(preview, /Alpha EN/);
 assert.equal(p.$('autoPlanSave').disabled, false);
 p.$('autoPlanMax').value = '1';
 p.$('autoPlanMax').dispatchEvent(new p.window.Event('change'));
 const perDay = [...p.$('autoPlanPreview').querySelectorAll('.auto-plan-day')].map(d => d.querySelectorAll('small').length);
 assert.ok(perDay.every(n => n <= 1), JSON.stringify(perDay));
 p.close();
});
