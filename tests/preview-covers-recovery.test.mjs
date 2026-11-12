import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../season-preview.js',import.meta.url),'utf8');
const begin=source.indexOf('let covers=new Map();');
const end=source.indexOf('function malLink(show){',begin);
assert.ok(begin>=0&&end>begin,'covers module exists');
const logic=source.slice(begin,end);

function harness({cached=null,answer,malLinks={}}={}) {
  const storage=new Map();
  if(cached)storage.set('previewCovers:123',JSON.stringify(cached));
  const calls=[];
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const anilist=async(query,vars)=>{
    calls.push({query,vars});
    return answer(query,vars,calls.length);
  };
  const malLink=show=>({url:malLinks[show.key]||'https://myanimelist.net/anime.php?q='+encodeURIComponent(show.english||show.title)});
  const api=new Function('localStorage','anilist','malLink',logic+'\nreturn {loadCovers, getCovers:()=>new Map(covers)};')(localStorage,anilist,malLink);
  return {api,calls,storage};
}
const show=(key,english='Anime Title')=>({key,title:english,english});
const tab={gid:'123'};

test('empty cached URLs must be rechecked instead of trusted for a week',async()=>{
  const h=harness({
    cached:{time:Date.now(),covers:[['a','']]},
    answer:()=>({s0:{media:[{coverImage:{medium:'https://images.test/a.jpg'}}]}})
  });
  await h.api.loadCovers(tab,[show('a')]);
  assert.equal(h.calls.length,1);
  assert.equal(h.api.getCovers().get('a'),'https://images.test/a.jpg');
  const stored=JSON.parse(h.storage.get('previewCovers:123'));
  assert.deepEqual(stored.covers,[['a','https://images.test/a.jpg']]);
});

test('missing MAL ID match falls back to title lookup',async()=>{
  const h=harness({
    malLinks:{a:'https://myanimelist.net/anime/12345/example'},
    answer:query=>query.includes('idMal_in')
      ?{Page:{media:[]}}:{s0:{media:[{coverImage:{medium:'https://images.test/fallback.jpg'}}]}}
  });
  await h.api.loadCovers(tab,[show('a','The Example')]);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].vars.t0,'The Example');
  assert.equal(h.api.getCovers().get('a'),'https://images.test/fallback.jpg');
});

test('one failed title batch does not stop later batches or cache misses',async()=>{
  const entries=Array.from({length:13},(_,i)=>show('k'+i,'Title '+i));
  const h=harness({
    answer:(_query,_vars,n)=>{
      if(n===1)throw new Error('Temporary AniList outage');
      return Object.fromEntries(Array.from({length:3},(_,j)=>['s'+j,{media:[{coverImage:{medium:'https://images.test/'+j+'.jpg'}}]}]));
    }
  });
  await h.api.loadCovers(tab,entries);
  assert.equal(h.calls.length,2);
  assert.equal(h.api.getCovers().has('k0'),false);
  assert.equal(h.api.getCovers().get('k10'),'https://images.test/0.jpg');
  const stored=JSON.parse(h.storage.get('previewCovers:123'));
  assert.ok(stored.covers.every(([_,url])=>url.startsWith('https://')));
  await h.api.loadCovers(tab,entries);
  assert.ok(h.calls.length>2,'missing entries retry on next load');
});

test('different seasons cannot inherit an unrelated season cover map',async()=>{
  const h=harness({answer:()=>({s0:{media:[{coverImage:{medium:'https://images.test/a.jpg'}}]}})});
  await h.api.loadCovers(tab,[show('same')]);
  assert.equal(h.api.getCovers().has('same'),true);
  await h.api.loadCovers({gid:'other'},[show('elsewhere')]);
  assert.equal(h.api.getCovers().has('same'),false);
  assert.equal(h.api.getCovers().has('elsewhere'),true);
});
