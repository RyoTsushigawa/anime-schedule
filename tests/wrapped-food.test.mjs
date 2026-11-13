import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../wrapped.js',import.meta.url),'utf8');
const start=source.indexOf('function wrappedFoodTaste(');
const end=source.indexOf('function wrappedShow(',start);
assert.ok(start>=0&&end>start,'Wrapped food helpers exist');
const load=new Function('person','people',`
 const wrappedSafe = String;
 ${source.slice(start,end)}
 return {taste:wrappedFoodTaste(person,people),cards:wrappedFoodCards('Herbst 2026',person,person,people)};
`);
test('personal and group cards use distinct full recipes',()=>{
 const people=Array.from({length:12},(_,i)=>'Person '+i);
 const variants=['',...people].map(person=>load(person,people));
 for(const field of ['title','bread','protein','sauce']){
  assert.equal(new Set(variants.map(({taste})=>taste[field])).size,variants.length,field);
 }
 for(const [i,{taste,cards}] of variants.entries()){
  assert.deepEqual(taste,load(['',...people][i],[...people].reverse()).taste);
  assert.match(cards[0].title,/ Sub$/);
  assert.match(cards[1].title,/ Wrap$/);
  for(const card of cards){
   assert.ok(card.html.includes(taste.protein));
   assert.ok(card.html.includes(taste.sauce));
  }
 }
});
test('both list paths add the recipe cards',()=>{
 assert.equal(source.split('cards.push(...wrappedFoodCards(season,name,person,wrappedPlan.people))').length,3);
});
