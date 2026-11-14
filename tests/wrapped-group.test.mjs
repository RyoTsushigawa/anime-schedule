import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../wrapped.js',import.meta.url),'utf8');
const start=source.indexOf('const WRAPPED_SPLIT=');
const end=source.indexOf('async function wrappedRender(',start);
assert.ok(start>=0&&end>start,'Wrapped Börse/Awards helpers exist');
const load=(stocks,awards)=>new Function('stocks','awards',`
 const wrappedSafe=String, savedGroupCode=()=>'', config=async()=>({previewVotesUrl:'https://votes.test'});
 const wrappedRank=items=>items.map(([a,b])=>a+': '+b).join(' | '), wrappedMetrics=items=>items.map(([a,b])=>a+' '+b).join(' | ');
 const fetch=async url=>({ok:true,json:async()=>url.includes('/stocks')?stocks:awards});
 ${source.slice(start,end)}
 return {cards:wrappedGroupCards, winners:wrappedAwardWinners};
`)(stocks,awards);
const stocks={over:false,ranking:[{person:'Rei',value:1180},{person:'Marvin',value:1043.2},{person:'Ryo',value:990},{person:'Belly',value:912}]};
const ballots=[{person:'Marvin',picks:{best:['Frieren','Dandadan'],villain:['Zeta']}},{person:'Ryo',picks:{best:['Dandadan','Frieren']}},{person:'Rei',picks:{best:['Frieren'],villain:['Omega']}}];
test('Awards winners: points 12/10/8, ties by more 12s',()=>{
 const won=load(stocks,{}).winners(ballots);
 assert.deepEqual(won.get('best'),{title:'Frieren',points:34});
 assert.equal(won.get('villain').title,'Omega');
});
test('group: the Börse ranking and the Anime der Season',async()=>{
 const cards=await load(stocks,{revealed:true,ballots}).cards('Herbst 2026','',false);
 assert.equal(cards.length,2);
 assert.equal(cards[0].title,'Rei hatte das beste Depot.');
 assert.match(cards[0].html,/Rei: 1\.180 Taler/);
 assert.equal(cards[1].title,'Frieren');
 assert.match(cards[1].html,/34 Punkten/);
});
test('a person: their place and value; their 12-point picks that won',async()=>{
 const cards=await load(stocks,{revealed:true,ballots}).cards('Herbst 2026','Rei',false);
 assert.equal(cards[0].title,'Platz 1 an der Börse.');
 assert.match(cards[0].html,/1\.180.*\+18 %/s);
 assert.equal(cards[1].title,'2 Mal lag die 12 richtig.');
 // MaRyo: both depots, both ballots
 const maryo=await load(stocks,{revealed:true,ballots}).cards('Herbst 2026','MaRyo',true);
 assert.equal(maryo[0].title,'Zwei Depots, ein Plan.');
 assert.match(maryo[0].html,/Marvin · Platz 2.*Ryo · Platz 3/s);
 assert.match(maryo[1].html,/von 3 euren 12-Punkte-Tipps/);
 assert.equal(maryo[1].title,'Eine 12 lag richtig.');
});
test('nothing before Auflösen, no ranking, or without the helper',async()=>{
 assert.deepEqual(await load({ranking:[]},{revealed:false,voters:['Rei']}).cards('Herbst 2026','',false),[]);
 assert.deepEqual(await load(null,null).cards('Herbst 2026','Rei',false),[]);
});
