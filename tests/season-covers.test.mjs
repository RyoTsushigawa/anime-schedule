import test from 'node:test';
import assert from 'node:assert/strict';
import { addCovers } from '../tools/season-covers.mjs';
// seasons.json covers: AniList by id, then MyAnimeList (Jikan), then LiveChart's poster; last week's are kept
const card = (livechartId, more = {}, list = {}) => ({ ...more, list: { livechartId, romaji: 'Show ' + livechartId, english: '', mal: '', ...list } });
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
test('each source in turn, only for what is still missing', async () => {
  const asked = [];
  const cards = [
    card('1', { anilist: '101' }),
    card('2', {}, { mal: 'https://myanimelist.net/anime/202' }),
    card('3', {}, { mal: 'https://myanimelist.net/anime/303' }),
    card('4', {}, { romaji: 'Peropero Sparkles' }),
    card('5', { poster: 'https://u.livechart.me/anime/5/poster_image/a.webp' }, { romaji: 'Nowhere Else' }),
    card('6'),
  ];
  let jikanTries = 0;
  const fetch = async (url, opts) => {
    asked.push(url);
    if (url.includes('anilist')) {
      const { variables, query } = JSON.parse(opts.body);
      if (query.includes('id_in')) return json({ data: { Page: { media: [{ id: 101, coverImage: { medium: 'https://s4.anilist.co/c/101.jpg' } }] } } });
      assert.deepEqual(variables.ids, [202, 303]);
      return json({ data: { Page: { media: [{ idMal: 202, coverImage: { medium: 'https://s4.anilist.co/c/202.jpg' } }] } } });
    }
    if (url.endsWith('/anime/303')) return ++jikanTries < 2 ? json(null, 503) : json({ data: { images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1/303.jpg' } } } });
    if (url.includes('Peropero')) return json({ data: [{ title: 'Peropero★Sparkles', images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1/4.jpg' } } }] });
    return json({ data: [{ title: 'Something else entirely', images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1/x.jpg' } } }] });
  };
  await addCovers(cards, { 6: 'https://s4.anilist.co/c/kept.jpg' }, { fetch, wait: 0 });
  assert.deepEqual(cards.map(c => c.list.cover), [
    'https://s4.anilist.co/c/101.jpg', 'https://s4.anilist.co/c/202.jpg', 'https://cdn.myanimelist.net/images/anime/1/303.jpg',
    'https://cdn.myanimelist.net/images/anime/1/4.jpg', 'https://u.livechart.me/anime/5/poster_image/a.webp', 'https://s4.anilist.co/c/kept.jpg']);
  assert.equal(asked.filter(u => u.includes('jikan')).length, 4); // 303 twice (503, then found), Peropero, Nowhere Else
});
