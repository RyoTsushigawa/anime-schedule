import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, sec } from './harness.mjs';

const next = { episode: 5, airingAt: sec(2026, 10, 4, 14) };

for (const linked of [false, true]) {
  test('Allein enters Catch-up on release with ' + (linked ? 'linked' : 'local') + ' progress', async t => {
    const csv = [
      'Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Matthias',
      'Show Alpha,Alpha EN,C,Mi.,20:00,' + (linked ? 'Allein,Ja' : 'Ja,Allein')
    ].join('\n');
    const storage = linked ? { soloPerson: 'MaRyo' } :
      { soloPerson: 'Matthias', 'localAnimeProgress:v1:Matthias': JSON.stringify({ 1: 3 }) };
    const p = await openPage({ storage, sheets: { csv: { 111: csv, 222: csv } },
      list: linked ? { 1: { status: 'CURRENT', progress: 3 } } : {}, planNext: next });
    t.after(() => p.close());
    await p.click(p.$('viewCatchup'), 500);
    assert.doesNotMatch(p.$('list').textContent, /Alpha EN/);
    p.advance(4 * 3600000);
    await p.click(p.$('viewWeek'));
    await p.click(p.$('viewCatchup'), 500);
    const row = [...p.$('list').querySelectorAll('.row')].find(row => row.textContent.includes('Alpha EN'));
    assert.ok(row, 'episode is available before the group slot');
    assert.match(row.textContent, /Folge\s*4/);
  });
}