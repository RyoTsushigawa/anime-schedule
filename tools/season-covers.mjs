// Cover pictures for seasons.json, so the Season Preview has them without asking AniList or MyAnimeList
// from every visitor's browser (AniList's per-minute limit and the often slow Jikan left some shows bare).
// In order: AniList (by the AniList or MyAnimeList number LiveChart links), MyAnimeList through Jikan
// (by number, else by title), and last LiveChart's own poster. A cover found last week is kept.
import { titleScore } from './livechart-pages.mjs';

const ANILIST = 'https://graphql.anilist.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const malNumber = list => list.mal?.match(/myanimelist\.net\/anime\/(\d+)/)?.[1];
const isCover = url => /^https:\/\/(?:s\d\.anilist\.co|cdn\.myanimelist\.net\/images\/anime|u\.livechart\.me\/anime)\//.test(url || '');

async function retried(request, tries = 3) {
	for (let i = 1; ; i++) {
		try { const res = await request(); if (res.ok) return await res.json(); if (i >= tries || ![429, 500, 502, 503, 504].includes(res.status)) return null; }
		catch { if (i >= tries) return null; }
		await sleep(i * 3000);
	}
}

// cards: [{ anilist, poster, list: { livechartId, mal, romaji, english } }]; old: { livechartId: cover }.
// Sets list.cover where one is found.
export async function addCovers(cards, old = {}, { fetch: get = fetch, wait = 1200 } = {}) {
	const open = () => cards.filter(c => !isCover(c.list.cover));
	for (const c of cards) if (isCover(old[c.list.livechartId])) c.list.cover = old[c.list.livechartId];
	for (const [field, idOf] of [['id', c => c.anilist], ['idMal', c => malNumber(c.list)]]) {
		const todo = open().filter(idOf);
		for (let i = 0; i < todo.length; i += 50) {
			const part = todo.slice(i, i + 50);
			const data = await retried(() => get(ANILIST, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ query: `query ($ids: [Int]) { Page(perPage: 50) { media(${field}_in: $ids, type: ANIME) { ${field} coverImage { medium } } } }`, variables: { ids: part.map(c => +idOf(c)) } }) }));
			for (const c of part) {
				const url = data?.data?.Page?.media?.find(m => String(m[field]) === String(idOf(c)))?.coverImage?.medium;
				if (isCover(url) && !/\/default\.\w+$/.test(url)) c.list.cover = url;
			}
		}
	}
	for (const c of open()) {
		const id = malNumber(c.list), title = c.list.english || c.list.romaji;
		const data = await retried(() => get(id ? `https://api.jikan.moe/v4/anime/${id}` : `https://api.jikan.moe/v4/anime?limit=1&q=${encodeURIComponent(c.list.romaji || title)}`));
		const found = Array.isArray(data?.data) ? data.data[0] : data?.data;
		const url = found?.images?.jpg?.image_url;
		// by title only when it is the same show (a search always answers something)
		if (isCover(url) && (id || titleScore([c.list.romaji, c.list.english], [found.title, found.title_english, found.title_japanese, ...(found.titles || []).map(t => t.title)]))) c.list.cover = url;
		await sleep(wait); // Jikan allows about one request a second
	}
	for (const c of open()) if (isCover(c.poster)) c.list.cover = c.poster;
	return cards;
}
