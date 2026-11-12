import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, MEDIA, sec, NOW } from './harness.mjs';

const csv = [
  'Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Matthias',
  'Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja',
  'Show Beta,Beta EN,C,Sa.,,Nein,Ja'
].join('\n');
const sheets = { csv: {111:csv, 222:csv} };

test('Catch-up and Non-seasonal follow the person selected in Solo', async () => {
  const p = await openPage({ storage:{soloPerson:'Matthias'}, sheets, planNext:{episode:5, airingAt:sec(2026,10,4,14)} });
  try {
    await p.click(p.$('viewCatchup'), 650);
    assert.equal(p.$('friendList').value, 'local:Matthias');
    assert.match(p.$('tabName').textContent, /Matthias.*Lokal/);
    assert.match(p.$('list').textContent, /Alpha EN/);
    const mark = p.$('list').querySelector('[data-local-watch]');
    assert.ok(mark, 'untracked person can mark episodes without an AniList account');
    const id = Number(mark.dataset.localWatch), progress=Number(mark.dataset.localEpisode);
    await p.click(mark, 500);
    const saved = JSON.parse(p.storage()['localAnimeProgress:v1:Matthias']);
    assert.equal(saved[id], progress);
    await p.click(p.$('viewPace'), 400);
    assert.equal(p.$('friendList').value, 'local:Matthias');
    assert.match(p.$('tabName').textContent,/Matthias.*Lokal/);
  } finally { p.close(); }
});

test('Solo person changes switch the list source automatically', async () => {
  const p = await openPage({sheets});
  try {
    await p.click(p.$('viewCatchup'), 400);
    const select=p.$('soloPerson');
    select.value='Matthias';
    select.dispatchEvent(new p.window.Event('change',{bubbles:true}));
    await p.settle(550);
    assert.equal(p.$('friendList').value,'local:Matthias');
    select.value='MaRyo';
    select.dispatchEvent(new p.window.Event('change',{bubbles:true}));
    await p.settle(450);
    assert.equal(p.$('friendList').value,'RyoTsushigawa');
  } finally { p.close(); }
});

test('A person without a tracker can add a non-seasonal series and keep progress locally', async () => {
  const p = await openPage({
    storage:{soloPerson:'Matthias'}, sheets,
    media:{4:{status:'FINISHED',episodes:12,startDate:{year:2019,month:4,day:1}}},
    search:{'Delta EN':MEDIA[4]}
  });
  try {
    await p.click(p.$('viewPace'),450);
    assert.equal(p.$('friendList').value,'local:Matthias');
    const form=p.$('localAnimeAdd');
    assert.ok(form,'add anime form is available without tracking account');
    form.querySelector('input').value='Delta EN';
    form.dispatchEvent(new p.window.Event('submit',{bubbles:true,cancelable:true}));
    await p.settle(650);
    assert.deepEqual(JSON.parse(p.storage()['localAnimeShows:v1:Matthias']),[4]);
    const row=[...p.$('list').querySelectorAll('.row')].find(r=>r.textContent.includes('Delta EN'));
    assert.ok(row,'manually added finished anime appears in Non-seasonal');
    const button=row.querySelector('[data-local-watch]');
    assert.ok(button,'user can mark progress');
    await p.click(button,550);
    assert.equal(JSON.parse(p.storage()['localAnimeProgress:v1:Matthias'])['4'],1);
    assert.equal(p.storage()['localAnimeProgress:v1:MaRyo'],undefined);
  } finally {p.close();}
});
