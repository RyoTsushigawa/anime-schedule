import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// N83 Startet bald: next season's shows with "Ja" that start in the shown week or the one after
const PLAN = ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly', 'Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja'].join('\n');
const NEXT = ['Anime Titel,Eng Anime Titel,Startdatum,Uhrzeit,MaRyo,Belly,Rei',
  'Soon One,Soon One EN,30.10.2026,,Ja,Ja,Nein',
  'Later One,,05.11.2026,,Nein,Ja,',
  'Nobody,,31.10.2026,,Nein,Vielleicht,',
  'Far Away,,20.11.2026,,Ja,Ja,Ja'].join('\n');
test('the week shows next season premieres with Ja votes, nothing else', async () => {
  const p = await openPage({ sheets: { tabs: [['Guckplan Herbst 2026', 111], ['Herbst 2026', 222], ['Winter 2027', 333]], csv: { 111: PLAN, 333: NEXT } } });
  try {
    await p.click(p.$('viewWeek'), 400);
    const box = p.$('startingSoon');
    assert.ok(box, 'shown');
    assert.match(box.querySelector('h3').textContent, /Winter 2027/);
    const rows = [...box.querySelectorAll('.season-match')].map(r => r.textContent);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /Soon One EN.*30\. Okt.*2× Ja/);
    assert.match(rows[1], /Later One.*1× Ja/);
  } finally { p.close(); }
});
