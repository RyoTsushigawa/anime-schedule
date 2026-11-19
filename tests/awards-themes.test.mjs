import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
// Bestes Opening / Ending: the songs from AnimeThemes (by AniList id) in the dropdown, grouped by show; a show
// without known songs stays pickable by its title; the songs can be heard as a playlist first
const theme = (type, sequence, title, artist, audio) => ({ type, sequence, slug: type + sequence, song: { title, artists: [{ name: artist }] },
  animethemeentries: [{ version: 1, nsfw: false, videos: [{ link: audio.replace('a.', 'v.').replace('.ogg', '.webm'), audio: { link: audio } }] }] });
async function page(t) {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom; t.after(() => window.close());
  const asked = [];
  window.fetch = async (url) => {
    const u = new URL(url, 'https://schedule.example/'), reply = data => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('streams-de.json')) return reply({ status: { 101: { titles: ['Alpha', 'The Alpha'] }, 102: { titles: ['Beta', 'Beta EN'] } } });
    if (u.host === 'graphql.anilist.co') return reply({ data: { Page: { media: [] } } });
    if (u.host === 'api.animethemes.moe') {
      asked.push(u.searchParams.get('filter[external_id]') + '|' + u.searchParams.get('filter[site]'));
      return reply({ anime: u.searchParams.get('filter[external_id]') === '101' ? [{ name: 'Alpha', animethemes: [
        theme('ED', 1, 'Ending Song', 'Singer B', 'https://a.animethemes.moe/Alpha-ED1.ogg'),
        theme('OP', 1, 'Opening Song', 'Singer A', 'https://a.animethemes.moe/Alpha-OP1.ogg')] }] : [] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const config = async () => ({});
    const guckplanTabs = async () => [{ gid: '2', name: 'Guckplan Herbst 2026' }];
    const tabFor = tabs => tabs[0];
    const loadPlan = async () => ({ people: ['Mia'], shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Beta', english: 'Beta EN' }] });
    ${read('awards.js')}
  `);
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
  return { window, doc: window.document, asked };
}
test('openings in the dropdown by show, a show without songs by title, an earlier title pick stays valid', async t => {
  const { doc, asked } = await page(t);
  assert.deepEqual(asked.sort(), ['101|AniList', '102|AniList']);
  const select = doc.querySelector('[data-category="opening"] .awards-place select');
  const groups = [...select.querySelectorAll('optgroup')].map(g => [g.label, [...g.children].map(o => o.textContent)]);
  assert.deepEqual(groups, [['The Alpha', ['OP1 „Opening Song“ – Singer A']], ['Ohne Songdaten', ['Beta EN']]]);
  select.value = 'The Alpha – OP1 „Opening Song“'; select.dispatchEvent(new doc.defaultView.Event('change'));
  assert.equal(select.classList.contains('bad'), false);
  const ending = doc.querySelector('[data-category="ending"] .awards-place select');
  assert.ok([...ending.options].some(o => o.value === 'The Alpha – ED1 „Ending Song“'));
  // a pick from before the songs were known (just the show) is still accepted
  ending.value = 'Beta EN'; ending.dispatchEvent(new doc.defaultView.Event('change'));
  assert.equal(ending.classList.contains('bad'), false);
});
test('the playlist: openings or endings, a tap plays it and the next one follows', async t => {
  const { doc } = await page(t);
  const box = doc.getElementById('awardsListen');
  assert.equal(box.hidden, false);
  const tracks = () => [...doc.querySelectorAll('#awardsTracks [data-track]')].map(b => b.textContent);
  assert.deepEqual(tracks(), ['The Alpha · OP1„Opening Song“ – Singer A']);
  box.querySelector('[data-listen="ED"]').click();
  assert.deepEqual(tracks(), ['The Alpha · ED1„Ending Song“ – Singer B']);
  doc.querySelector('#awardsTracks [data-track]').click();
  assert.equal(doc.getElementById('awardsAudio').getAttribute('src'), 'https://a.animethemes.moe/Alpha-ED1.ogg');
  assert.ok(doc.querySelector('#awardsTracks button.playing'));
});
