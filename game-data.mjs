// AniList for the games: each answer is kept in this browser for a day, so a game asks AniList once a
// day instead of on every visit (AniList allows only a few requests a minute). A rate limit gets one
// retry; when AniList can't be reached at all, an older saved answer stands in, and otherwise the
// error says what to check (a blocker or the browser's tracking protection usually is the cause).
const PREFIX = 'anilistCache:', DAY = 24 * 60 * 60 * 1000, KEEP = 4 * DAY;
export const BLOCKED = 'AniList ist von diesem Browser aus nicht erreichbar. Meist ist ein Werbeblocker oder der Tracking-Schutz schuld: graphql.anilist.co und anilist.co erlauben, dann neu laden.';

const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
function write(key, data) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && !(Date.now() - (read(k)?.at || 0) < KEEP)) localStorage.removeItem(k);
    }
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {} // a full or blocked storage only costs the saved copy
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function anilist(query, variables = {}, { fetcher = fetch } = {}) {
  const key = PREFIX + hash(query + JSON.stringify(variables));
  const kept = read(key);
  if (kept && Date.now() - kept.at < DAY) return kept.data;
  try {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetcher('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
      if (response.status !== 429) break;
      await wait(Math.min(5, Number(response.headers?.get?.('Retry-After')) || 2) * 1000);
    }
    if (response.status === 429) throw new Error('AniList: zu viele Anfragen, bitte in einer Minute neu laden.');
    if (!response.ok) throw new Error('AniList antwortet ' + response.status);
    const body = await response.json();
    if (body.errors?.length) throw new Error('AniList hat die Anfrage abgelehnt');
    write(key, body.data);
    return body.data;
  } catch (error) {
    if (kept) return kept.data;
    throw error instanceof TypeError ? new Error(BLOCKED) : error;
  }
}
