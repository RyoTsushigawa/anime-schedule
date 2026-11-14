// The answers for endless Titel-Rätsel (games-endless.json): every 5-8 letter real English word (SCOWL,
// games-guesses.json, the same list that checks guesses) from an anime title, plus character names from English
// titles (Ranma, Chitose …). A word that isn't English is only taken when AniList knows a character with that first
// or last name, so romaji words (Tensei, Mushoku, Ojosama …) stay out. Each word is asked once; the answers are
// kept in the file ("names": word → true/false). Titles from the Guckplan
// tabs in the Sheet backup (English title column, plus the "Anime Top 100" and "Rewatches" lists), the season
// catalog (seasons.json), the stream data (streams-de.json) and, when AniList can be reached, the English titles on
// the group's AniList lists (wrapped-profiles.json). Run daily after the Sheet backup.
//   node tools/games-endless.mjs            update games-endless.json
//   node tools/games-endless.mjs --offline  without AniList
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './boerse-prices.mjs';

const root = new URL('../', import.meta.url);
const path = file => fileURLToPath(new URL(file, root));
const json = async file => JSON.parse(await readFile(path(file), 'utf8'));

// titles marked english: any word (names too); the others: dictionary words only
export function endlessWords(titles, dictionary) {
  const words = new Map();
  for (const { title, from, english } of titles) for (const raw of String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z']+/)) {
    // whole words only: "Kaguya-sama" gives KAGUYA, "Ranma½" gives RANMA, an apostrophe word ("Isn't") is left out
    if (!/^[A-Za-z]+$/.test(raw)) continue;
    const word = raw.toUpperCase();
    if (word.length < 5 || word.length > 8) continue;
    if (!dictionary.has(word) && !english) continue;
    if (!words.has(word)) words.set(word, { word, title: title.trim(), from, ...(!dictionary.has(word) && { name: true }) });
  }
  return [...words.values()].sort((a, b) => a.word.localeCompare(b.word));
}

async function sheetTitles() {
  const out = [];
  const dir = path('backup/sheet/');
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.csv'))) {
    const rows = parseCsv(await readFile(dir + file, 'utf8'));
    const head = rows.findIndex(r => r.some(c => c.trim() === 'Eng Anime Titel'));
    if (head >= 0) {
      const col = rows[head].findIndex(c => c.trim() === 'Eng Anime Titel');
      for (const r of rows.slice(head + 1)) if ((r[col] || '').trim()) out.push({ title: r[col], from: file.replace(/\.csv$/, ''), english: true });
    } else if (/^(Anime Top 100|Rewatches)/i.test(file)) {
      for (const r of rows.slice(2)) for (const c of r) if (/[A-Za-z]{5}/.test(c) && c.length < 120) out.push({ title: c.replace(/\s+/g, ' '), from: file.replace(/\.csv$/, '') });
    }
  }
  return out;
}
// the final list: English words, and other words only with AniList's yes (names[word] === true)
export const selectWords = (candidates, dictionary, names) => [...candidates].filter(w => dictionary.has(w.word) || names[w.word] === true)
  .map(({ name, ...w }) => dictionary.has(w.word) ? w : { ...w, name: true }).sort((a, b) => a.word.localeCompare(b.word));
// is this word a character's first or last name on AniList? (null: AniList not reachable)
async function isCharacterName(word) {
  try {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query ($w: String) { Page(perPage: 10) { characters(search: $w) { name { first last } } } }', variables: { w: word } }) });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 60000)); return isCharacterName(word); }
    if (!res.ok) return null;
    const list = (await res.json()).data?.Page?.characters || [];
    return list.some(c => [c.name?.first, c.name?.last].some(n => String(n || '').toUpperCase() === word));
  } catch { return null; }
  finally { await new Promise(r => setTimeout(r, 900)); }
}
// the 500 most popular anime on AniList (by members, no adult titles): extra answers for hard mode
async function popularTitles() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: 'query ($p: Int) { Page(page: $p, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { title { english } } } }', variables: { p: page } }) });
      if (!res.ok) throw new Error('AniList ' + res.status);
      for (const m of (await res.json()).data?.Page?.media || []) if (m.title?.english) out.push({ title: m.title.english, from: 'Top 500 auf AniList', english: true });
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) { console.log(`Top 500, Seite ${page}: ${e.message}`); return null; }
  }
  return out;
}
async function anilistTitles() {
  const profiles = await json('wrapped-profiles.json');
  const users = [...new Set(Object.values(profiles).flat().filter(a => a?.provider === 'anilist').map(a => a.name))];
  const out = [];
  for (const user of users) {
    try {
      const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: 'query ($u: String) { MediaListCollection(userName: $u, type: ANIME) { lists { entries { media { title { english } } } } } }', variables: { u: user } }) });
      if (!res.ok) throw new Error('AniList ' + res.status);
      for (const l of (await res.json()).data?.MediaListCollection?.lists || []) for (const e of l.entries || []) if (e.media?.title?.english) out.push({ title: e.media.title.english, from: 'AniList', english: true });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) { console.log(`${user}: ${e.message}`); }
  }
  return out;
}

async function main() {
  const guesses = await json('games-guesses.json');
  const dictionary = new Set(Object.values(guesses.words).flatMap(s => s.split(' ')).map(w => w.toUpperCase()));
  const catalog = await json('seasons.json'), streams = await json('streams-de.json');
  const titles = [
    ...await sheetTitles(),
    ...Object.entries(catalog.seasons || {}).flatMap(([season, shows]) => (shows || []).filter(s => s.english).map(s => ({ title: s.english, from: 'Season ' + season, english: true }))),
    ...Object.values(streams.status || {}).flatMap(s => (s.titles || []).map(title => ({ title, from: 'Streams' }))),
    ...(process.argv.includes('--offline') ? [] : await anilistTitles()),
  ];
  let before = [], names = {}, popularBefore = [];
  try { const file = await json('games-endless.json'); before = file.words || []; names = file.names || {}; popularBefore = file.popular || []; } catch {}
  // hard mode: the Top 500 (kept as it was when AniList can't be reached)
  const top = process.argv.includes('--offline') ? null : await popularTitles();
  const popularCandidates = top ? endlessWords(top, dictionary) : popularBefore;
  // words found once stay: a list that only grows, so a short AniList outage doesn't shrink it
  const merged = new Map([...before, ...endlessWords(titles, dictionary)].map(w => [w.word, w]));
  // a word that isn't English needs AniList's yes: a character with that name
  const offline = process.argv.includes('--offline');
  for (const w of [...merged.values(), ...popularCandidates]) if (!dictionary.has(w.word) && !(w.word in names) && !offline) {
    const verdict = await isCharacterName(w.word);
    if (verdict !== null) names[w.word] = verdict;
  }
  const words = selectWords(merged.values(), dictionary, names);
  const popular = selectWords(popularCandidates, dictionary, names);
  await writeFile(path('games-endless.json'), JSON.stringify({ about: 'Endless Titel-Rätsel answers, generated by tools/games-endless.mjs', words, popular, names }, null, 0) + '\n');
  console.log(`Schwer: ${popular.length} Wörter aus den Top 500 auf AniList`);
  const yes = Object.values(names).filter(Boolean).length;
  console.log(`${words.length} Wörter (${titles.length} Titel), davon ${words.filter(w => w.name).length} Namen; ${Object.keys(names).length} Namen geprüft, ${yes} bestätigt`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
