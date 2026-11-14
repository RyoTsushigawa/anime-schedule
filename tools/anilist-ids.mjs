// The AniList user IDs of the accounts in "Wer ist wer" (wrapped-profiles.json) → anilist-ids.json, { id: name }.
// The votes helper needs them: AniList blocks requests from Cloudflare (403), so the helper can't ask AniList who
// a login belongs to. It reads the user ID from the login itself (AniList logins carry it) and looks it up here.
// User IDs are public on AniList. Runs in the daily Anime-Börse job (GitHub can reach AniList).
//   node tools/anilist-ids.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = file => fileURLToPath(new URL('../' + file, import.meta.url));
async function userId(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query ($n: String) { User(name: $n) { id name } }', variables: { n: name } }) });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 30000)); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('AniList ' + res.status);
    const user = (await res.json()).data?.User;
    return user?.id ? { id: user.id, name: user.name } : null;
  }
  throw new Error('AniList: too many requests');
}
export async function main() {
  const profiles = JSON.parse(await readFile(path('wrapped-profiles.json'), 'utf8'));
  const names = [...new Set(Object.values(profiles).flat().filter(a => a?.provider === 'anilist' && /^[\w-]{2,40}$/.test(a.name)).map(a => a.name))];
  let before = {};
  try { before = JSON.parse(await readFile(path('anilist-ids.json'), 'utf8')).ids || {}; } catch {}
  const ids = {};
  for (const name of names) {
    // an ID found once stays (an account's ID never changes); only new names are looked up
    const known = Object.entries(before).find(([, n]) => n.toLowerCase() === name.toLowerCase());
    if (known) { ids[known[0]] = known[1]; continue; }
    try { const u = await userId(name); if (u) ids[u.id] = u.name; else console.log(`${name}: not found on AniList`); }
    catch (e) { console.log(`${name}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1000));
  }
  await writeFile(path('anilist-ids.json'), JSON.stringify({ about: 'AniList user ID → account name for the accounts in wrapped-profiles.json (tools/anilist-ids.mjs)', ids }, null, 1) + '\n');
  console.log(`${Object.keys(ids).length} of ${names.length} AniList accounts have an ID.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
