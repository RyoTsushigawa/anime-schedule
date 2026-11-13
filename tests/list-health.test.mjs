import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, NOW } from './harness.mjs';
// N24 Listen-Check: forgotten "watching", progress beyond the episodes, incomplete "completed", missing Guckplan shows
const media = (id, title, extra = {}) => ({ id, status: 'FINISHED', episodes: 12, siteUrl: 'https://anilist.co/anime/' + id, synonyms: [], title: { english: title, romaji: title }, ...extra });
const day = 86400;

test('each problem is found once, the rest is fine', async () => {
  const p = await openPage();
  try {
    const entries = [
      { status: 'CURRENT', progress: 5, updatedAt: NOW / 1000 - 200 * day, media: media(1, 'Old Watch') },
      { status: 'CURRENT', progress: 5, updatedAt: NOW / 1000 - 10 * day, media: media(2, 'Recent Watch') },
      { status: 'CURRENT', progress: 4, updatedAt: NOW / 1000 - 300 * day, media: media(3, 'Still Airing', { status: 'RELEASING' }) },
      { status: 'CURRENT', progress: 15, updatedAt: NOW / 1000, media: media(4, 'Too Far') },
      { status: 'COMPLETED', progress: 9, updatedAt: NOW / 1000, media: media(5, 'Half Done') },
      { status: 'COMPLETED', progress: 12, updatedAt: NOW / 1000, media: media(6, 'Fine') },
      { status: 'PLANNING', progress: 0, updatedAt: NOW / 1000, media: media(7, 'Planned', { synonyms: ['Plan Alias'] }) },
    ];
    p.window.testEntries = entries;
    const groups = JSON.parse(p.run(`JSON.stringify(listHealth(testEntries, [{ romaji: 'Plan Alias' }, { english: 'Not There', romaji: 'Nai' }]))`));
    const names = g => g.items.map(i => i.m?.title.english || i.show.english);
    assert.deepEqual(groups.map(g => g.items.length), [1, 1, 1, 1]);
    assert.deepEqual(names(groups[0]), ['Old Watch']);
    assert.match(groups[0].items[0].text, /Seit 200 Tagen/);
    assert.deepEqual(names(groups[1]), ['Too Far']);
    assert.deepEqual(names(groups[2]), ['Half Done']);
    assert.deepEqual(names(groups[3]), ['Not There']);
  } finally { p.close(); }
});

test('the dialog explains what is needed without an AniList account', async () => {
  const p = await openPage();
  try {
    await p.click(p.$('settingsButton'));
    await p.click(p.$('healthButton'), 300);
    assert.equal(p.$('healthDlg').open, true);
    assert.ok(p.$('healthIntro').textContent.length > 10);
  } finally { p.close(); }
});
