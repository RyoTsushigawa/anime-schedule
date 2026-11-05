// Reads LiveChart's pages. Only here, so that when LiveChart changes its markup (as it did on
// 2026-10-30) there is one file to fix, and tests/livechart-pages.test.mjs to show what's expected.
export const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

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
        romaji, english,
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
