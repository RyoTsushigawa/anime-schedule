import { writeFile } from 'node:fs/promises';
// A blocked/challenged response is unknown, not evidence of an outage.
async function probe() {
  try {
    const r=await fetch('https://aniworld.to/animes',{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0'}});
    if(r.status>=500)return 'down';
    if(!r.ok)return 'unknown';
    const text=await r.text();
    return text.includes('/anime/stream/')?'up':'unknown';
  } catch { return 'down'; }
}
const first=await probe();
const state=first==='down'?await probe():first;
await writeFile(new URL('../source-health.json',import.meta.url),JSON.stringify({checked:new Date().toISOString(),aniworld:state})+'\n');
console.log('AniWorld:',state);
