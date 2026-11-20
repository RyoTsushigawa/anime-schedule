import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Season Preview: shortly before a season starts, the shows with two or more "Ja" but no day/time in the Guckplan
const source = readFileSync(new URL('../season-preview.js', import.meta.url), 'utf8');
const part = source.slice(source.indexOf('const SLOT_WINDOW='), source.indexOf('function draftButton('));
const prelude = source.slice(source.indexOf('const PV_SEASONS'), source.indexOf('\n', source.indexOf('const PV_MONTHS')));
const make = new Function('env', `let {current,shows,pv,guckplanTabs,loadPlan,norm,safeText,Date}=env;
 ${prelude}
 ${part}
 return loadSlotCheck;`);
const ja = (...names) => names.map(name => ({ name, value: 'Ja' }));
function page({ today = '2026-12-25', tabs = [{ name: 'Guckplan Winter 2027' }] } = {}) {
  const box = { hidden: true, innerHTML: '' };
  const RealDate = globalThis.Date;
  class FakeDate extends RealDate { static now() { return RealDate.parse(today + 'T12:00:00Z'); } }
  const env = { current: { name: 'Winter 2027' }, pv: () => box, Date: FakeDate,
    norm: s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''), safeText: s => String(s),
    shows: [
      { key: 'a', title: 'Alpha', english: 'Alpha EN', votes: ja('Rei', 'Ryo', 'Marvin') },
      { key: 'b', title: 'Beta', votes: ja('Rei', 'Ryo') },
      { key: 'c', title: 'Gamma', votes: ja('Rei', 'Ryo') },
      { key: 'd', title: 'Delta', votes: [...ja('Rei'), { name: 'Ryo', value: 'Vielleicht' }] },
      { key: 'e', title: 'Epsilon', votes: ja('MaRyo') },
    ],
    guckplanTabs: async () => tabs,
    loadPlan: async () => ({ shows: [{ romaji: 'Beta', tag: 'Mo', time: '20:00' }, { romaji: 'Gamma', tag: '', time: '' }] }) };
  return { run: make(env), box };
}
test('lists shows with enough Ja and no slot, most votes first', async () => {
  const p = page();
  await p.run();
  assert.equal(p.box.hidden, false);
  assert.match(p.box.innerHTML, /Guckplan Winter 2027\): Alpha EN <small>3× Ja<\/small> · Epsilon <small>2× Ja<\/small> · Gamma <small>2× Ja<\/small>$/);
  assert.doesNotMatch(p.box.innerHTML, /Beta|Delta/);
});
test('outside the two weeks around the start nothing shows', async () => {
  for (const today of ['2026-12-01', '2027-01-20']) { const p = page({ today }); await p.run(); assert.equal(p.box.hidden, true); }
});
test('without a Guckplan tab yet, every show with enough Ja is listed', async () => {
  const p = page({ today: '2027-01-05', tabs: [] });
  await p.run();
  assert.match(p.box.innerHTML, /Guckplan Winter 2027 fehlt noch\): Alpha EN.*Beta.*Gamma/);
});
