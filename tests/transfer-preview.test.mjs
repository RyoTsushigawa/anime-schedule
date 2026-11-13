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
