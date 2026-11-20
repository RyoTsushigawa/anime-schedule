import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Wrapped (group view): Troddl cards for the season, pen names only; not in a person's Wrapped
const source=readFileSync(new URL('../wrapped.js',import.meta.url),'utf8');
const part=source.slice(source.indexOf('const WRAPPED_SPLIT='),source.indexOf('async function wrappedRender('));
const load=troddl=>new Function('troddl',`
 const wrappedSafe=String, savedGroupCode=()=>'', config=async()=>({previewVotesUrl:'https://votes.test'});
 const wrappedRank=items=>items.map(([a,b])=>a+': '+b).join(' | '), wrappedMetrics=items=>items.map(([a,b])=>a+' '+b).join(' | ');
 const asked=[]; const fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/troddl')?troddl:{}};};
 ${part}
 return {cards:wrappedGroupCards, stats:wrappedTroddl, asked};
`)(troddl);
const r=(mediaId,title,pen,score,season='Herbst 2026')=>({mediaId,title,pen,score,season});
const reviews=[r(1,'Blue Box','Drachenhort',90),r(1,'Blue Box','Kurier',80),r(2,'Dark Machine','Drachenhort',85),r(2,'Dark Machine','Kurier',30),
 r(3,'Ranma','Terra Times',60),r(9,'Old Show','Kurier',10,'Sommer 2026')];
test('stats: best rated, critics by mean, the biggest disagreement; other seasons left out',()=>{
 const t=load({}).stats(reviews,'Herbst 2026');
 assert.equal(t.reviews,5);
 assert.deepEqual(t.rated.map(s=>[s.title,s.rating]),[['Blue Box',85],['Dark Machine',58]]);
 assert.deepEqual(t.critics.map(c=>[c.pen,c.mean]),[['Drachenhort',88],['Kurier',55]]);
 assert.deepEqual([t.debate.title,t.debate.gap],['Dark Machine',55]);
});
test('group Wrapped: three Troddl cards; a person\'s Wrapped asks nothing',async()=>{
 const g=load({reviews});
 const cards=await g.cards('Herbst 2026','',false);
 assert.deepEqual(cards.map(c=>c.title),['Blue Box','Drachenhort war am großzügigsten.','Dark Machine']);
 assert.match(cards[1].html,/Kurier/);
 const p=load({reviews});
 assert.equal((await p.cards('Herbst 2026','Rei',false)).length,0);
 assert.ok(!p.asked.some(u=>u.includes('/troddl')));
});
