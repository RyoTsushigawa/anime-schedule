// Reads LiveChart's pages. Only here, so that when LiveChart changes its markup (as it did on
// 2026-10-30) there is one file to fix, and tests/livechart-pages.test.mjs to show what's expected.
export const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Titles compared without case, marks and spacing; "2nd Season" = "Season 2", "Cour 2" = "Part 2"
export const norm = s => String(s || '').normalize('NFKD').toLowerCase()
  .replace(/½/g, '12').replace(/\b(\d+)(st|nd|rd|th) season\b/g, 'season $1')
  .replace(/\b(\d+)(st|nd|rd|th) cour\b|\bcour (\d+)\b/g, (m, a, b, c) => `part ${a || c}`) // LiveChart "Cour 2" = Guckplan "Part 2"
  .replace(/[^a-z0-9]/g, '');

// 2: the same title, 1: one starts with the other (8+ letters), 0: different
export function titleScore(a, b) {
  const A = a.map(norm).filter(Boolean), B = b.map(norm).filter(Boolean);
  if (A.some(x => B.includes(x))) return 2;
  return A.some(x => B.some(y => Math.min(x.length, y.length) >= 8 && (x.startsWith(y) || y.startsWith(x)))) ? 1 : 0;
}

// The part, cour or season a title names at its end ("Part 2", "2nd Cour", "Season 3"), or 0
const partOf = title => Number(norm(title).match(/(?:part|season)(\d+)$/)?.[1]) || 0;
const SUFFIX = /\s*(?:[:\-–]\s*)?(?:(?:part|cour|season)\s*\d+|\d+(?:st|nd|rd|th)\s+(?:season|cour))\s*$/i;

// AniList searches to try for a sheet title, best first: as written, without its Part/Cour/Season,
// with two neighbouring words joined ("Lulutto Lilly" → "LuluttoLilly"), then its first words.
// A search by first words only counts for a card whose title starts with them.
export function searchVariants(title) {
  const full = title.trim().replace(/\s+/g, ' ');
  const base = full.replace(SUFFIX, '');
  const suffix = full.slice(base.length);
  const words = base.split(' ');
  const out = [{ search: full }, { search: base }];
  for (let i = 0; i < words.length - 1; i++)
    if (/^[a-z]{2}/i.test(words[i]) && /^[a-z]{2}/i.test(words[i + 1]))
      out.push({ search: [...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(' ') + suffix });
  for (let n = words.length - 1; n >= 2; n--) {
    const prefix = words.slice(0, n).join(' ');
    if (norm(prefix).length >= 10) out.push({ search: prefix, prefix: norm(prefix) });
  }
  return out.filter((v, i) => v.search && out.findIndex(w => w.search.toLowerCase() === v.search.toLowerCase()) === i);
}

// Of this season's cards that AniList's ids lead to: the one for the same part (Part 2 → the Part 2
// card); else AniList's best hit, but after a search by first words only when it is the one card.
export function pickCard(sheetTitles, variant, ids, cards) {
  const found = ids.map(id => cards.find(c => c.anilist === id)).filter(Boolean)
    .filter(c => !variant.prefix || c.titles.some(x => norm(x).startsWith(variant.prefix)));
  const part = Math.max(0, ...sheetTitles.filter(Boolean).map(partOf));
  const same = found.find(c => Math.max(0, ...c.titles.map(partOf)) === part);
  return same || (!variant.prefix || found.length === 1 ? found[0] : null) || null;
}

// A season's page (/fall-2026/tv). Besides what the schedule needs, each card keeps what the season
// list in the sheet needs: premiere time and how exact it is, the rough start when not exact
// ("January 2027"), short form or not, the MyAnimeList link and LiveChart's "※ NOTE" lines.
export function parseSeason(html) {
  const cards = [];
  for (const [, attrs, body] of html.matchAll(/<article\b([^>]*\bdata-anime-id="\d+"[^>]*)>([\s\S]*?)<\/article>/g)) {
    const attr = name => decode((attrs.match(new RegExp(`\\bdata-${name}="([^"]*)"`)) || [])[1] || '');
    let alternate = [];
    try { alternate = JSON.parse(attr('anime-item-alternate-titles') || '[]'); } catch {}
    const romaji = attr('anime-item-romanized-native-title'), english = attr('anime-item-english-title');
    // Some cards only have it on their premiere line. Attributes there contain ">" ("click->…").
    const [, time = '', shown = ''] = body.match(/lc-anime-details-card__premiere[^>]*>\s*<time\b((?:[^>"]|"[^"]*")*)>([^<]*)</) || [];
    const precision = Number(attr('anime-item-premiere-precision') || time.match(/precision="(\d+)"/)?.[1]) || 0;
    const premiere = Number(attr('anime-item-premiere-value')) || Date.parse(time.match(/datetime="([^"]+)"/)?.[1]) / 1000 || null;
    cards.push({
      id: attr('anime-id'),
      anilist: (body.match(/anilist\.co\/anime\/(\d+)/) || [])[1],
      titles: [romaji, english, ...alternate],
      list: {
        romaji, english, livechartId: attr('anime-id'),
        premiere, precision,
        rough: precision >= 3 ? '' : decode(shown), // 3 is a whole date, 4 also has the time
        short: /__badge[^>]*>\s*Short-form\s*</.test(body),
        mal: (body.match(/href="(https:\/\/myanimelist\.net\/anime\/[^"]+)"/) || [])[1] || '',
        notes: [...body.matchAll(/>\s*※\s*NOTE:\s*([^<]*)</gi)].map(m => decode(m[1]).trim()).filter(Boolean),
      },
    });
  }
  return cards;
}

// A show's streams (/anime/1/streams), for the visitor's region: each with its service name and
// link, plus `extra` when LiveChart notes an add-on subscription (e.g. Prime Video titles that
// need the "aniverse" channel).
export function parseStreams(html) {
  const out = [];
  for (const [item] of html.matchAll(/<div class="lc-stream-list-item[\s\S]*?(?=<div class="lc-stream-list-item|\/edit"|$)/g)) {
    const url = item.match(/<a href="(https?:\/\/[^"]+)"/)?.[1];
    const name = item.match(/lcm3-text--body-lg[^"]*"[^>]*>([^<]+)</)?.[1];
    if (!url || !name) continue;
    const extra = decode(item.match(/lcm3-text--body-md[^"]*"[^>]*>([^<]*)</)?.[1] || '').match(/(?:※\s*)?(.+?)\s+subscription required/i)?.[1];
    out.push({ name: decode(name).trim(), url: decode(url), ...(extra && { extra }) });
  }
  return out;
}

// A show's release schedules (/anime/1/schedules).
export function parseSchedules(html) {
  return [...html.matchAll(/<article\b[^>]*data-controller="release-schedule"[\s\S]*?<\/article>/g)].map(([card]) => ({
    time: Number(card.match(/data-timestamp="(\d+)"/)?.[1]),
    episode: Number(card.match(/data-label="EP(\d+)"/)?.[1]),
    title: decode(card.match(/<div title="([^"]+)"/)?.[1] || ''),
    service: decode(card.match(/lc-text-contextual-accent[^"]*"[^>]*>([^<]+)</)?.[1] || ''),
    readable: /textualTracklist"[^>]*(&quot;|")(de|en)(&quot;|")/i.test(card),
  })).filter(s => s.time && s.episode);
}

// A show's headlines (/anime/1/headlines), newest first.
export function parseHeadlines(html) {
  const grid = html.slice(Math.max(0, html.indexOf('lc-headline-card-grid')));
  return [...grid.matchAll(/<a href="([^"]+)"[^>]*interaction-delegate[^>]*><\/a>[\s\S]*?lcm3-text--title-md"[^>]*>([^<]+)<\/div>[\s\S]*?<time datetime="([^"]+)"/g)]
    .map(([, url, title, date]) => ({ title: decode(title).trim(), url: decode(url), date }));
}

// Notes on the timetable ("There will be no episode today due to unrelated special programming."):
// [{ id: LiveChart id, at: the slot's time, text }].
export function parseTimetableNotes(html) {
  const notes = [];
  for (const [, at, slot] of html.matchAll(/data-controller="timeslot" data-timestamp="(\d+)"([\s\S]*?)(?=data-controller="timeslot"|$)/g))
    for (const [, id, body] of slot.matchAll(/lc-timetable-timeslot__note[\s\S]*?href="\/anime\/(\d+)"[\s\S]*?lc-markdown-html[^>]*>([\s\S]*?)<\/div>/g)) {
      const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (text) notes.push({ id, at: Number(at), text });
    }
  return notes;
}

// YouTube pages for shows streaming on a YouTube channel (LiveChart links its playlist): the
// episode uploads they list, as { id, episode, title }. Reads a playlist page (only its first
// videos) and a search page sorted by upload date (the newest), whose data is JSON in a script.
// "Episode 16", "Ep. 1", "Ep 3"
const EPISODE = /\b(?:Episode|Ep\.?)\s*(\d+)/i;
export function parseYouTube(html) {
  const data = html.replace(/\\"/g, '"').replace(/\\u0026/g, '&');
  const found = [
    // A playlist entry has several labels (length, channels, title): the one naming an episode
    ...data.split('"contentId":"').slice(1).filter(part => /^[\w-]{11}","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/.test(part))
      .map(part => [part.slice(0, 11), [...part.matchAll(/"accessibilityContext":\{"label":"([^"]*)"/g)].map(m => m[1]).find(l => EPISODE.test(l))
        ?.replace(/\s+\d+ (?:minutes?|seconds?|hours?)\b.*$/, '')]),
    ...data.split('"videoRenderer":{"videoId":').slice(1)
      .map(part => [part.match(/^"([\w-]{11})"/)?.[1], part.match(/"title":\{"runs":\[\{"text":"([^"]*)"/)?.[1]]),
  ];
  const videos = [];
  for (const [id, title] of found) {
    const episode = Number(title?.match(EPISODE)?.[1]);
    if (id && episode && !videos.some(v => v.id === id)) videos.push({ id, episode, title: decode(title) });
  }
  return videos;
}

// What the uploads of one series share before their number ("【Magical Sisters LuluttoLilly】Episode"),
// and the newest of them, preferring subtitled ones
export const episodeStem = title => title.replace(/(\b(?:Episode|Ep\.?))\s*\d+[\s\S]*$/i, '$1').trim().toLowerCase();
export function newestEpisode(videos, stem) {
  const same = videos.filter(v => episodeStem(v.title) === stem);
  const subbed = same.filter(v => /subtitle|english|\beng\b/i.test(v.title));
  return (subbed.length ? subbed : same).sort((a, b) => b.episode - a.episode)[0] || null;
}
