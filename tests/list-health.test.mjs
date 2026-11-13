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
    assert.deepEqual(groups.map(g => g.items.length), [1, 1, 1, 1, 0]);
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

test('Nicht in deinem Guckplan: a show on the list as watching although the Guckplan says Nein; taken off on request', async () => {
  const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' } });
  try {
    const entries = [
      { id: 501, status: 'CURRENT', progress: 2, updatedAt: NOW / 1000, media: media(11, 'Welsh EN', { status: 'RELEASING' }) },
      { id: 502, status: 'COMPLETED', progress: 12, updatedAt: NOW / 1000, media: media(12, 'Done EN') },
      { id: 503, status: 'CURRENT', progress: 3, updatedAt: NOW / 1000, media: media(13, 'Own Pick', { status: 'RELEASING' }) },
      { id: 504, status: 'CURRENT', progress: 1, updatedAt: NOW / 1000, media: media(14, 'Outside Plan', { status: 'RELEASING' }) },
    ];
    p.window.testEntries = entries;
    const notMine = [{ romaji: 'Welsh', english: 'Welsh EN', votes: { MaRyo: 'Nein' }, person: 'MaRyo' }, { romaji: 'Done', english: 'Done EN', votes: { MaRyo: 'Nein' }, person: 'MaRyo' }];
    p.window.testNotMine = notMine;
    const groups = JSON.parse(p.run(`JSON.stringify(listHealth(testEntries, [], ${NOW}, testNotMine))`));
    const stray = groups.find(g => g.name === 'Nicht in deinem Guckplan');
    assert.deepEqual(stray.items.map(i => [i.m.title.english, i.entry]), [['Welsh EN', 501]], 'only watching, only shows in the Guckplan that are not yours');
    assert.match(stray.items[0].text, /Folge 2.*„Nein“/);
    // the button deletes exactly that entry through the connected account
    const calls = [], fetch0 = p.window.fetch;
    p.window.fetch = async (url, options = {}) => {
      if (String(url) === 'https://graphql.anilist.co' && /DeleteMediaListEntry/.test(options.body || '')) { calls.push(JSON.parse(options.body).variables); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: { DeleteMediaListEntry: { deleted: true } } }) }; }
      return fetch0(url, options);
    };
    p.window.confirm = () => true;
    const list = p.$('healthList');
    list.innerHTML = '<ul><li data-stray="501" data-media="11"><a><b>Welsh EN</b></a><span class="repair-actions"><button type="button" data-stray-remove>x</button></span></li></ul>';
    await p.click(list.querySelector('[data-stray-remove]'), 200);
    assert.deepEqual(calls, [{ id: 501 }]);
    assert.match(list.textContent, /Von der Liste genommen/);
    assert.match(p.window.localStorage.getItem('syncHistoryV1') || '', /Welsh EN.*removed/);
  } finally { p.close(); }
});
