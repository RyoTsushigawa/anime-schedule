import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// N59: AniList and MyAnimeList compared by MAL ID; a preview, nothing written
const m = (id, idMal, t) => ({ id, idMal, episodes: 12, siteUrl: 'https://anilist.co/anime/' + id, title: { english: t, romaji: t } });
test('differences, entries on one side only, and entries without a MAL ID', async () => {
  const p = await openPage();
  try {
    p.window.aniE = [
      { status: 'CURRENT', progress: 3, media: m(1, 101, 'Same') },
      { status: 'CURRENT', progress: 5, media: m(2, 102, 'Ahead') },
      { status: 'COMPLETED', progress: 12, media: m(3, 103, 'Only Ani') },
      { status: 'PLANNING', progress: 0, media: m(4, null, 'No Mal') },
    ];
    p.window.malE = [
      { status: 'CURRENT', progress: 3, media: { idMal: 101, title: { english: 'Same' } } },
      { status: 'CURRENT', progress: 4, media: { idMal: 102, title: { english: 'Ahead' } } },
      { status: 'DROPPED', progress: 2, media: { idMal: 109, title: { english: 'Only Mal' } } },
    ];
    const g = JSON.parse(p.run('JSON.stringify(transferPreview(aniE, malE))'));
    const names = i => g[i].items.map(x => x.title);
    assert.deepEqual(g.map(x => x.name), ['Unterschiedlich', 'Nur auf AniList', 'Nur auf MyAnimeList', 'Auf AniList ohne MyAnimeList-ID']);
    assert.deepEqual(names(0), ['Ahead']);
    assert.match(g[0].items[0].text, /AniList: Schaue ich, Folge 5 · MAL: Schaue ich, Folge 4/);
    assert.deepEqual(names(1), ['Only Ani']);
    assert.deepEqual(names(2), ['Only Mal']);
    assert.equal(g[2].items[0].url, 'https://myanimelist.net/anime/109');
    assert.deepEqual(names(3), ['No Mal']);
  } finally { p.close(); }
});
test('without both accounts it says what is needed', async () => {
  const p = await openPage();
  try {
    await p.click(p.$('settingsButton'));
    await p.click(p.$('transferButton'), 200);
    assert.match(p.$('transferIntro').textContent, /AniList- und ein MyAnimeList-Konto/);
  } finally { p.close(); }
});
test('N59: ticked entries are copied to MyAnimeList with AniList status and episode; the rest stays untouched', async () => {
  const p = await openPage();
  try {
    const saved = [];
    p.window.savedToMal = saved;
    p.window.confirm = () => true;
    p.run(`
      accounts = [{ name: 'Ani', token: 't' }, { name: 'Mali', provider: 'mal' }];
      anilist = async () => ({ MediaListCollection: { lists: [{ entries: [
        { status: 'CURRENT', progress: 5, media: { id: 2, idMal: 102, siteUrl: 'https://anilist.co/anime/2', title: { english: 'Ahead' } } },
        { status: 'COMPLETED', progress: 12, media: { id: 3, idMal: 103, siteUrl: 'https://anilist.co/anime/3', title: { english: 'Only Ani' } } },
        { status: 'PLANNING', progress: 0, media: { id: 4, idMal: null, siteUrl: 'https://anilist.co/anime/4', title: { english: 'No Mal' } } }] }] } });
      MAL.list = async () => ({ entries: [
        { status: 'CURRENT', progress: 4, media: { idMal: 102, title: { english: 'Ahead' } } },
        { status: 'DROPPED', progress: 2, media: { idMal: 109, title: { english: 'Only Mal' } } }] });
      MAL.save = async (account, id, vars) => { savedToMal.push([account.name, id, vars]); if (id === -103) throw new Error('kaputt'); return {}; };
    `);
    await p.run('drawTransfer()');
    // only entries with a MAL ID on the AniList side can be ticked
    assert.equal(p.$('transferList').querySelectorAll('.transfer-pick').length, 2);
    assert.equal(p.$('transferCopy').hidden, false);
    assert.equal(p.$('transferCopy').disabled, true);
    const all = p.$('transferList').querySelector('.transfer-all');
    all.checked = true; all.dispatchEvent(new p.window.Event('change', { bubbles: true }));
    assert.match(p.$('transferCopy').textContent, /^1 auf MyAnimeList übernehmen/);
    const only = [...p.$('transferList').querySelectorAll('.transfer-pick')].find(c => /Only Ani/.test(c.getAttribute('aria-label')));
    only.checked = true; only.dispatchEvent(new p.window.Event('change', { bubbles: true }));
    assert.match(p.$('transferCopy').textContent, /^2 auf MyAnimeList/);
    await p.click(p.$('transferCopy'), 50);
    const plain = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(plain.map(s => s.slice(0, 2)), [['Mali', -102], ['Mali', -103]]);
    assert.deepEqual(plain[0][2], { status: 'CURRENT', progress: 5 });
    assert.match(p.$('transferIntro').textContent, /1 übernommen, nicht geklappt: Only Ani \(kaputt\)/);
    const log = JSON.parse(p.window.localStorage.getItem('syncHistoryV1'));
    assert.deepEqual(log.map(e => [e.title, e.ok]), [['Only Ani', false], ['Ahead', true]]);
  } finally { p.close(); }
});
