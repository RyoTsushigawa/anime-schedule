// Anime-Quiz: pure helpers. Five questions a day, the same for everyone, about the shows in your Guckplan
// (from AniList: genres, studio, characters, episodes) and about the group (who watches what).
// A question is only asked when its wrong answers are known to be wrong.
import { hashSeed, shuffle } from './cover-core.mjs';

export const QUESTIONS = 5;
export const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sorted = list => [...new Set(list.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'de'));

// media: [{ id, title, alt?, genres, studios, episodes, characters: [names] }]
// plan: { people: [...], watchers: Map(norm(title) → [people]) } or null
export function questionsFor(media, day, plan = null) {
  const pool = [...media].filter(m => m && m.title).sort((a, b) => a.id - b.id);
  const seed = key => hashSeed(day + ':trivia:' + key);
  const pick = (list, key) => shuffle(sorted(list), seed(key));
  const make = (kind, m, prompt, answer, wrong, explain) =>
    wrong.length >= 3 ? [{ kind, show: m.id, prompt, answer, options: shuffle([answer, ...wrong.slice(0, 3)], seed('opts:' + kind + m.id)), explain }] : [];
  const out = [];
  for (const m of pool) {
    const others = pool.filter(x => x.id !== m.id);
    if (m.genres?.length) {
      const answer = pick(m.genres, 'g' + m.id)[0];
      out.push(...make('genre', m, `Welches Genre hat „${m.title}“?`, answer,
        pick(others.flatMap(x => x.genres || []).filter(g => !m.genres.includes(g)), 'gw' + m.id), `${m.title}: ${m.genres.join(', ')}`));
    }
    if (m.studios?.length) {
      out.push(...make('studio', m, `Welches Studio animiert „${m.title}“?`, m.studios[0],
        pick(others.flatMap(x => x.studios || []).filter(s => !m.studios.includes(s)), 'sw' + m.id), `${m.title}: ${m.studios.join(', ')}`));
    }
    const name = pick(m.characters || [], 'c' + m.id)[0];
    if (name) {
      out.push(...make('character', m, `Aus welcher Serie stammt ${name}?`, m.title,
        pick(others.filter(x => !(x.characters || []).includes(name)).map(x => x.title), 'cw' + m.id), `${name} ist eine Figur aus ${m.title}.`));
    }
    if (Number.isInteger(m.episodes) && m.episodes > 0) {
      out.push(...make('episodes', m, `Wie viele Folgen hat „${m.title}“?`, String(m.episodes),
        pick(others.map(x => x.episodes).filter(n => Number.isInteger(n) && n > 0 && n !== m.episodes).map(String), 'ew' + m.id), `${m.title} hat ${m.episodes} Folgen.`));
    }
    const watching = plan?.watchers.get(norm(m.title)) || plan?.watchers.get(norm(m.alt)) || [];
    if (watching.length) {
      out.push(...make('watcher', m, `Wer von euch schaut „${m.title}“?`, pick(watching, 'w' + m.id)[0],
        pick(plan.people.filter(p => !watching.includes(p)), 'ww' + m.id), `${m.title} schauen: ${watching.join(', ')}.`));
    }
  }
  // five questions, about five different shows, with the kinds taking turns
  const byKind = new Map();
  for (const q of shuffle(out, seed('order'))) byKind.set(q.kind, [...byKind.get(q.kind) || [], q]);
  // rarer kinds choose their show first, so each kind gets a turn when it can
  const kinds = shuffle([...byKind.keys()].sort(), seed('kinds')).sort((a, b) => byKind.get(a).length - byKind.get(b).length);
  const chosen = [], shows = new Set();
  for (let round = 0; chosen.length < QUESTIONS && round < 50; round++) {
    let added = false;
    for (const kind of kinds) {
      if (chosen.length >= QUESTIONS) break;
      const q = byKind.get(kind).find(x => !shows.has(x.show));
      if (q) { chosen.push(q); shows.add(q.show); byKind.set(kind, byKind.get(kind).filter(x => x !== q)); added = true; }
    }
    if (!added) break;
  }
  return chosen;
}

export const scoreOf = (questions, answers) => questions.filter((q, i) => answers[i] === q.answer).length;
