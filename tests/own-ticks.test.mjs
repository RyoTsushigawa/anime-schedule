import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// ✓ writes to the connected list: in another person's plan (or the group view) a show the account's own
// person doesn't watch and that isn't on its list gets no ✓, so "Alle heutigen Folgen gesehen" can't add it.
const CSV = ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly', 'Show Alpha,Alpha EN,C,Mi.,20:00,Nein,Ja'].join('\n');
const open = list => openPage({ list, sheets: { csv: { 111: CSV } },
  storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester', ownPerson: 'MaRyo', soloPerson: 'Belly' } });
const alpha = p => [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Alpha EN'));

test('Belly\'s show, not on my list: no ✓ and no Droppen', async () => {
  const p = await open({});
  const row = alpha(p);
  assert.ok(row, 'Alpha is shown in Belly\'s plan');
  assert.equal(row.querySelector('.watch'), null);
  assert.equal(row.querySelector('.drop'), null);
  assert.equal(p.$('list').querySelector('[data-day-watched]'), null, 'no "all watched" for a day with nothing of mine');
  p.close();
});
test('the same show on my list: ✓ as before', async () => {
  const p = await open({ 1: { status: 'CURRENT', progress: 1 } });
  assert.ok(alpha(p).querySelector('.watch'));
  p.close();
});
