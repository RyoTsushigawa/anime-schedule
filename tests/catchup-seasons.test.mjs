import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SOURCE } from './app-source.mjs';

const source = APP_SOURCE;
function extract(name) {
 const start = source.indexOf('function ' + name + '(');
 assert.ok(start >= 0, name + ' exists');
 const begin = source.indexOf('{', start);
 let depth = 0;
 for (let i = begin; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
 }
 throw Error('Unclosed function: ' + name);
}
const implementation = ['catchupSeasonKey','catchupSeasonLabel','catchupSeasonGroups'].map(extract).join('\n');
const group = new Function('rows','offset','lag',`
 const streamsDe = {release: {1: {offset}}};
 const lagOf = () => lag;
 ${implementation}
 return catchupSeasonGroups(rows);
`);
const at = (year, month, day) => Date.UTC(year, month - 1, day, 16) / 1000;
const show = (id, first, out, next, started) => ({
 m: {id, startDate: started, nextAiringEpisode: next},
 first, out, since: 0, nextAt: 0, progress: first - 1, missing: false, links: []
});

test('splits unwatched episodes at the summer/autumn boundary, newest season first', () => {
 const next = {episode: 4, airingAt: at(2026, 10, 21)};
 const result = group([show(1, 1, 3, next, {year: 2026, month: 9, day: 30})], 0, 0);
 assert.deepEqual(result.map(s => [s.label,s.rows.map(r => [r.first,r.out])]), [
  ['Herbst 2026', [[2,3]]],
  ['Sommer 2026', [[1,1]]]
 ]);
 assert.equal(result.reduce((n,g) => n + g.rows.reduce((a,r) => a+r.out-r.first+1,0),0),3);
});

test('finished anime without airing timestamps falls back to its start season', () => {
 const result = group([
  show(2, 6, 8, null, {year: 2026, month: 7, day: 12}),
  show(3, 1, 2, null, {year: 2026, month: 10, day: 5})
 ],0,0);
 assert.deepEqual(result.map(x => x.label),['Herbst 2026','Sommer 2026']);
 assert.deepEqual(result[1].rows.map(x => [x.first,x.out]),[[6,8]]);
});

test('a Berlin midnight boundary uses local time and unknown seasons sort last', () => {
 const next = {episode: 2, airingAt: Date.UTC(2026,8,30,22,30) / 1000 + 7*86400};
 const result = group([
  show(1,1,1,next,{year:2026,month:9}),
  show(4,1,1,null,null)
 ],0,0);
 assert.deepEqual(result.map(g=>g.label),['Herbst 2026','Season unbekannt']);
});

test('keeps each anime independent and never modifies the original backlog rows', () => {
 const row = show(1,1,3,{episode:4,airingAt:at(2026,10,21)},{year:2026,month:9,day:30});
 const original = structuredClone(row);
 const result = group([row],0,0);
 assert.deepEqual(row,original);
 assert.equal(result[0].rows[0].m,row.m);
 assert.equal(result[0].rows[0].out,3);
 assert.equal(result[1].rows[0].out,1);
});

test('season bulk action stops at that season’s final episode, not a newer one', () => {
 const sourceFns = ['seasonWatchTargets'].map(extract).join('\n');
 const targets = new Function('rows',sourceFns+'\nreturn seasonWatchTargets(rows);');
 const autumn = show(1,4,7,null,{year:2026,month:10,day:1});
 autumn.progress=1;
 const summer = show(1,2,3,null,{year:2026,month:7,day:1});
 summer.progress=1;
 assert.deepEqual(targets([summer]),[{mediaId:1,progress:3,add:false}]);
 assert.deepEqual(targets([autumn]),[{mediaId:1,progress:7,add:false}]);
 assert.deepEqual(targets([summer,summer]),[{mediaId:1,progress:3,add:false}]);
});

test('season bulk action includes not-listed anime and ignores already-watched ones',()=>{
 const fn = new Function('rows',extract('seasonWatchTargets')+'\nreturn seasonWatchTargets(rows);');
 const a=show(2,1,4,null,{year:2026,month:7});
 a.missing=true;
 const b=show(3,2,3,null,{year:2026,month:7});
 b.progress=3;
 assert.deepEqual(fn([a,b]),[{mediaId:2,progress:4,add:true}]);
});

test('only the current season has no header; older or multiple seasons retain headers',()=>{
 const fn = new Function('groups','now',extract('catchupSeasonKey')+'\n'+extract('showCatchupSeasonHeaders')+
  '\nreturn showCatchupSeasonHeaders(groups,now);');
 const now=at(2026,11,11);
 assert.equal(fn([{key:'2026-3'}],now),false);
 assert.equal(fn([{key:'2026-2'}],now),true);
 assert.equal(fn([{key:'2026-3'},{key:'2026-2'}],now),true);
 assert.equal(fn([{key:'unknown'}],now),true);
 assert.equal(fn([],now),true);
});

test('per-season action and ungrouped view retain watched controls',()=>{
 assert.match(source,/data-mark-season=/);
 assert.match(source,/seasonWatchTargets\(g\.rows\)/);
 assert.match(source,/if \(hideSeasonHeader\) return/);
 assert.match(source,/const content = listedHtml \+/);
 assert.match(source,/remaining\.map\(show\)\.join\(''\)/);
 assert.match(source,/change\(mediaId, \{progress, status: add \? 'CURRENT' : undefined\}\)/);
});
