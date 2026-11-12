import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Idea 132: the search in the Zeitplan also lists matching shows of the season that aren't on this week.
const settle = () => new Promise(r => setTimeout(r, 30));
const CSV = ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly', 'Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja', 'Show Delta,Delta EN,C,Fr.,22:00,Nein,Ja'].join('\n');
test('search: Delta has no episode this week, but the season list names it with its slot and people', async () => {
  const p = await openPage({ sheets: { csv: { 111: CSV } } });
  p.$('search').value = 'delta';
  p.$('search').dispatchEvent(new p.window.Event('input', { bubbles: true }));
  await settle();
  const box = p.$('seasonMatches');
  assert.ok(box, 'season list shown');
  assert.match(box.textContent, /Delta EN/);
  assert.match(box.textContent, /Fr\. 22:00/);
  assert.match(box.textContent, /Belly/);
  p.$('search').value = 'alpha';
  p.$('search').dispatchEvent(new p.window.Event('input', { bubbles: true }));
  await settle();
  assert.equal(p.$('seasonMatches'), null, 'Alpha is on this week: no extra list');
  p.close();
});
