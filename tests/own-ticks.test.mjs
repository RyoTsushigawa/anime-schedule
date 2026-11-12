import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// ✓ and Droppen write to the connected list. They only show for shows the account's person watches (person from
// "Wer ist wer", wrapped-profiles.json) or that are on its list, so "Alle heutigen Folgen gesehen" in someone
// else's plan or the group view can't add a show to it.
const CSV = ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly', 'Show Alpha,Alpha EN,C,Mi.,20:00,Nein,Ja'].join('\n');
const open = (name, storage, list = {}) => openPage({ list, sheets: { csv: { 111: CSV } },
  profiles: { MaRyo: [{ provider: 'anilist', name: 'RyoTsushigawa' }], Belly: [{ provider: 'anilist', name: 'BelmontGabriel' }] },
  storage: { anilistAccounts: JSON.stringify([{ name, token: 'fixture-only' }]), anilistActive: name, anilistUser: name, ...storage } });
const alpha = p => [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Alpha EN'));

test('MaRyo\'s account in Belly\'s plan: Belly\'s show, not on the list, has no ✓ and no Droppen', async () => {
  const p = await open('RyoTsushigawa', { soloPerson: 'Belly' });
  const row = alpha(p);
  assert.ok(row, 'Alpha is shown in Belly\'s plan');
  assert.equal(row.querySelector('.watch'), null);
  assert.equal(row.querySelector('.drop'), null);
  assert.equal(p.$('list').querySelector('[data-day-watched]'), null, 'no "all watched" for a day with nothing of mine');
  p.close();
});
test('the same show already on the list: ✓ as before', async () => {
  const p = await open('RyoTsushigawa', { soloPerson: 'Belly' }, { 1: { status: 'CURRENT', progress: 1 } });
  assert.ok(alpha(p).querySelector('.watch'));
  p.close();
});
test('Belly\'s account: her own show has ✓, even with an old wrong guess saved in the browser', async () => {
  const p = await open('BelmontGabriel', { soloPerson: 'Belly', ownPerson: 'MaRyo' });
  assert.ok(alpha(p).querySelector('.watch'), 'Belly watches Alpha');
  p.close();
});
test('Belly\'s account in the group view: also only her shows', async () => {
  const p = await open('BelmontGabriel', { mode: 'group', people: JSON.stringify(['MaRyo', 'Belly']), ownPerson: 'MaRyo' });
  assert.ok(alpha(p).querySelector('.watch'));
  p.close();
});
test('an account not in "Wer ist wer": no ✓ in the group view for a show not on its list, ✓ in Solo', async () => {
  let p = await open('Stranger', { mode: 'group', people: JSON.stringify(['MaRyo', 'Belly']) });
  assert.equal(alpha(p).querySelector('.watch'), null);
  p.close();
  p = await open('Stranger', { soloPerson: 'Belly' });
  assert.ok(alpha(p).querySelector('.watch'));
  p.close();
});
