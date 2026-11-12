import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../tierlist.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../tierlist.html',import.meta.url),'utf8');
const begin=source.indexOf('function seasonInfo(');
const end=source.indexOf('function loadTiers()',begin);
assert.ok(begin>=0 && end>begin,'seasonal AniList helpers exist');
const covers=new Map();
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const keyOf=s=>s.rankKey||s.romaji||s.english;
const helpers=new Function('norm','covers','keyOf',
  source.slice(begin,end)+'\nreturn {seasonInfo,seasonalAniMedia,mergeSeasonalShows};')(norm,covers,keyOf);
const media=(id,romaji,english,season='FALL',seasonYear=2026)=>({
  id,season,seasonYear,title:{romaji,english},coverImage:{medium:'https://images.test/'+id+'.jpg'}
});
const tab={name:'Guckplan Herbst 2026',gid:'123'};

test('only selected premiere season and year from the person’s AniList are included',()=>{
  assert.deepEqual(helpers.seasonInfo(tab),{season:'FALL',year:2026});
  assert.deepEqual(helpers.seasonInfo({name:'Guckplan Frühling 2027'}),{season:'SPRING',year:2027});
  const entries=[media(1,'Alpha','Alpha'),media(2,'Older','Older','SUMMER',2026),
    media(3,'Future','Future','FALL',2027),media(1,'Alpha','Alpha'),media(4,'Bad','Bad')];
  assert.deepEqual(helpers.seasonalAniMedia(entries,tab).map(e=>e.id),[1,4]);
});

test('AniList anime not in Guckplan appear with stable keys and covers',()=>{
  covers.clear();
  const plan=[{romaji:'Existing Plan',english:'Existing Plan',hidden:false}];
  const merged=helpers.mergeSeasonalShows(plan,[media(1001,'Solo Series','Solo Series')]);
  assert.equal(merged.added,1);
  assert.equal(merged.shows.length,2);
  assert.equal(merged.shows[1].rankKey,'anilist:1001');
  assert.ok(merged.own.has('anilist:1001'));
  assert.equal(covers.get('anilist:1001'),'https://images.test/1001.jpg');
});

test('a show shared by sheet and AniList appears only once with its old rank key',()=>{
  covers.clear();
  const plan=[{romaji:'Black Clover',english:'Black Clover',hidden:false}];
  const merged=helpers.mergeSeasonalShows(plan,[media(4,'Black Clover','Black Clover')]);
  assert.equal(merged.shows.length,1);
  assert.equal(merged.added,0);
  assert.ok(merged.own.has('Black Clover'));
  assert.equal(covers.get('Black Clover'),'https://images.test/4.jpg');
});

test('missing list data must not discard saved AniList-only rankings',()=>{
  const start=source.indexOf('function prepareTierState('),end=source.indexOf('function removeTierFromRanking(',start);
  const prepare=new Function('keyOf','POOL',source.slice(start,end)+'\nreturn prepareTierState;')(keyOf,'pool');
  const ranked=prepare({S:['anilist:1001','Black Clover'],pool:[]},['S','A'],[{romaji:'Black Clover'}]);
  assert.deepEqual(ranked.S,['anilist:1001','Black Clover']);
  const refreshed=prepare(ranked,['S','A'],[{romaji:'Black Clover'},{rankKey:'anilist:1001'}]);
  assert.deepEqual(refreshed.S,['anilist:1001','Black Clover']);
});

test('profile selection, pagination, filter and export include AniList results without extra buttons',()=>{
  assert.match(html,/id="tierAniStatus"/);
  assert.match(source,/wrapped-profiles\.json/);
  assert.match(source,/mediaList\(userName:\$user,type:ANIME\)/);
  assert.match(source,/pageInfo\{hasNextPage\}/);
  assert.match(source,/aniOwnKeys\.has\(keyOf\(s\)\)/);
  assert.match(source,/const byKey = new Map\(allTierShows\(\)\.map/);
  assert.match(source,/if\(request!==aniRequest \|\| \$\('tierPerson'\)\.value!==person/);
  assert.doesNotMatch(html,/id="tierAniButton"/);
});
