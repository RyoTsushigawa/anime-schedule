import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Idea 68, Jahres-Wrapped: "Jahr 2027" in the season picker combines that year's Guckpläne.
const csv = rows => ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly', ...rows].join('\n');
const sheets = {
  tabs: [['Guckplan Winter 2027', 301], ['Guckplan Frühling 2027', 302], ['Guckplan Herbst 2026', 111]],
  csv: {
    301: csv(['Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja', 'Show Beta,Beta EN,C,Do.,20:00,Ja,Nein']),
    302: csv(['Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja', 'Show Gamma,Gamma EN,C,Fr.,21:00,Nein,Ja']),
    111: csv(['Show Delta,Delta EN,C,Mo.,20:00,Ja,Ja']),
  },
};
const settle = () => new Promise(r => setTimeout(r, 80));

test('the picker offers whole years next to the seasons', async () => {
  const p = await openPage({ wrapped: true, sheets });
  await settle();
  const groups = [...p.$('season').querySelectorAll('optgroup')].map(g => [g.label, [...g.children].map(o => o.textContent)]);
  assert.deepEqual(groups, [['Season', ['Frühling 2027', 'Winter 2027', 'Herbst 2026']], ['Ganzes Jahr', ['Jahr 2027', 'Jahr 2026']]]);
  p.close();
});
test('Jahr 2027: shows of both seasons once, per-season card, year wording', async () => {
  const p = await openPage({ wrapped: true, sheets });
  await settle();
  p.$('season').value = 'year:2027';
  p.$('season').dispatchEvent(new p.window.Event('change'));
  await settle();
  const text = p.$('stories').textContent;
  assert.match(p.$('introHeading').textContent, /Euer Jahr\./);
  assert.match(text, /Jahr 2027 · Die ganze Gruppe/);
  assert.equal(p.$('stories').querySelector('.big').textContent, '3', 'Alpha, Beta, Gamma: Alpha counts once');
  assert.match(text, /Eine Serie blieb über mehrere Seasons\./);
  assert.match(text, /Winter 2027\s*2 Serien/);
  assert.match(text, /Frühling 2027\s*2 Serien/);
  assert.doesNotMatch(text, /Delta EN/, 'Herbst 2026 is another year');
  p.close();
});
