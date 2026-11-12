// Pure, deterministic daily Anime Cover Quiz helpers.
export const MAL_IDS = [21,1535,5114,9253,16498,20583,31240,31964,37999,38000,40748,44511,47917,49596,50265,52034,52299,52701,52991,54492];
export function berlinDay(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function hashSeed(value) {
  let h = 2166136261;
  for (const ch of value) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function shuffle(items, seed) {
  let x = seed >>> 0;
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function buildRounds(items, day, count = 5) {
  const unique = new Map();
  for (const item of items) {
    const id = Number(item.idMal);
    const name = (item.title?.english || item.title?.romaji || '').trim();
    const image = item.coverImage?.extraLarge || item.coverImage?.large;
    if (Number.isInteger(id) && id > 0 && name && /^https:\/\//.test(image || '') && !unique.has(id))
      unique.set(id, { id, name, image });
  }
  const pool = [...unique.values()].sort((a,b) => a.id - b.id);
  if (pool.length < 4) return [];
  const chosen = shuffle(pool, hashSeed(day + ':targets')).slice(0, Math.min(count, pool.length));
  return chosen.map((target, index) => {
    const decoys = shuffle(pool.filter(x => x.id !== target.id), hashSeed(day + ':decoys:' + index)).slice(0, 3);
    return { target, options: shuffle([target, ...decoys], hashSeed(day + ':options:' + index)) };
  });
}
export function scoreAnswers(rounds, answers) {
  return rounds.reduce((total, round, i) => total + (answers[i] === round.target.id ? 100 : 0), 0);
}
