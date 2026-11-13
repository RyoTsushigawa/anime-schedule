import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// N35: the search box also looks titles up on AniList: English, romaji, Japanese, Guckplan and MAL
const lookup = [
  { id: 1, idMal: 101, siteUrl: 'https://anilist.co/anime/1', format: 'TV', seasonYear: 2026, title: { english: 'Alpha EN', romaji: 'Show Alpha', native: 'アルファ' } },
  { id: 77, idMal: null, siteUrl: 'https://anilist.co/anime/77', format: 'MOVIE', seasonYear: 2019, title: { english: null, romaji: 'Alpha no Eiga', native: 'アルファの映画' } },
];
test('Nachschlagen lists AniList matches, marks Guckplan shows and links MAL only when known', async () => {
  const p = await openPage({ lookup });
  try {
    await p.click(p.$('viewWeek'));
    p.$('search').value = 'alpha';
    p.$('search').dispatchEvent(new p.window.Event('input'));
    await p.settle(1200);
    const box = p.$('titleLookup');
    assert.ok(box, 'lookup shown');
    const items = [...box.querySelectorAll('.lookup-match')];
    assert.equal(items.length, 2);
    assert.match(items[0].textContent, /Alpha EN.*im Guckplan.*Show Alpha · アルファ · TV 2026/s);
    assert.equal(items[0].querySelector('a[href="https://myanimelist.net/anime/101"]').textContent, 'MAL');
    assert.doesNotMatch(items[1].textContent, /im Guckplan/);
    assert.equal(items[1].querySelector('a[href*="myanimelist"]'), null);
    p.$('search').value = 'al';
    p.$('search').dispatchEvent(new p.window.Event('input'));
    await p.settle();
    assert.equal(p.$('titleLookup'), null, 'not for fewer than 3 letters');
  } finally { p.close(); }
});
