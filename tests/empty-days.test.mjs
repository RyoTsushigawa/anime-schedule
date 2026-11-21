import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Empty days say why: nothing planned, nothing for you (the group has shows: one click to them), or all watched
// while "Gesehene ausblenden" is on (with a way to show them again).
const ONLY_BELLY = [
  'Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly',
  'Show Alpha,Alpha EN,C,Mi.,20:00,Nein,Ja',
  'Show Beta,Beta EN,C,Sa.,,Ja,Nein',
].join('\n');
const day = (p, date) => p.document.querySelector(`.day[data-date="${date}"]`);

test('Solo: a day with only other people\'s shows says so and opens the group view', async () => {
  const p = await openPage({ storage: { mode: 'solo', soloPerson: 'MaRyo', range: 'week' }, sheets: { tabs: [['Guckplan Herbst 2026', 111], ['Herbst 2026', 222]], csv: { 111: ONLY_BELLY } } });
  try {
    const wednesday = day(p, '2026-10-28');
    assert.match(wednesday.querySelector('h2').textContent, /nichts für dich/);
    assert.match(wednesday.querySelector('[data-reveal-group]').textContent, /Gruppe ansehen/);
    assert.match(day(p, '2026-10-30').querySelector('h2').textContent, /nichts geplant/);
    await p.click(wednesday.querySelector('[data-reveal-group]'));
    await p.settle();
    assert.equal(p.run('mode'), 'group');
    assert.match(day(p, '2026-10-28').textContent, /Alpha EN/);
  } finally { p.close(); }
});

test('all of a day watched: the day is marked, and "Gesehene zeigen" turns the filter off', async () => {
  const p = await openPage({ storage: { mode: 'solo', soloPerson: 'MaRyo', range: 'week', hideWatched: '1' } });
  try {
    p.run("auth={name:'RyoTsushigawa',token:'test',avatar:''};myProgress.set(1,4);knownEntries.set(1,{status:'CURRENT',progress:4});render(...lastWeekRender)");
    await p.settle();
    const wednesday = day(p, '2026-10-28');
    assert.ok(wednesday.querySelector('.watch.done'), 'Alpha is ticked');
    assert.ok(wednesday.classList.contains('all-seen'));
    await p.click(wednesday.querySelector('[data-show-watched]'));
    assert.equal(p.$('hideWatched').checked, false);
    assert.equal(p.document.body.classList.contains('hide-watched'), false);
    assert.equal(p.storage().hideWatched, '0');
  } finally { p.close(); }
});
