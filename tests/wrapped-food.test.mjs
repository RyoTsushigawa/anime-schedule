import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../wrapped.js',import.meta.url),'utf8');
const start=source.indexOf('function wrappedFoodTaste(');
const end=source.indexOf('function wrappedShow(',start);
assert.ok(start>=0&&end>start,'Wrapped food helpers exist');
const load=new Function('stats','genre','person','people',`
 const wrappedSafe = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 ${source.slice(start,end)}
 return {taste:wrappedFoodTaste(stats,genre,person,people),cards:wrappedFoodCards(stats,genre,'Winter 2027',person || 'Person',person,people)};
`);
const basic=()=>({shows:8,parallel:0,exclusive:[],night:null});
test('action anime yields a chicken sub and a matching wrap recipe',()=>{
 const {taste,cards}=load(basic(),'Action');
 assert.equal(taste.protein,'gegartes Hähnchen');
 assert.equal(cards.length,2);
 assert.match(cards[0].html,/gegartes Hähnchen/);
 assert.match(cards[1].html,/gegartes Hähnchen/);
 assert.match(cards[1].html,/Tortilla/);
 assert.match(cards[1].html,/vollständig durchgaren/);
});
test('fantasy taste yields a vegetarian falafel version',()=>{
 const {taste,cards}=load(basic(),'Fantasy');
 assert.equal(taste.protein,'Falafel');
 assert.match(cards[1].html,/Falafel/);
});
test('without list metadata, the recipe still derives from the plan',()=>{
 const stats={shows:15,parallel:2,exclusive:[],night:null};
 const {taste,cards}=load(stats,'');
 assert.equal(taste.bread,'Vollkornbrot');
 assert.equal(taste.title,'Multiverse Sub');
 assert.equal(cards.length,2);
 assert.match(cards[0].note,/Keine offizielle Bestellung/);
});
test('taste strings are safely escaped in the generated story cards',()=>{
 const {cards}=load(basic(),'Action <img src=x>');
 assert.doesNotMatch(cards[0].html,/<img/);
 assert.match(cards[0].html,/&lt;img/);
});
test('both no-list and list paths add the food cards',()=>{
 assert.match(source,/cards\.push\(\.\.\.wrappedFoodCards\(stats,'',season,name,person,wrappedPlan\.people\)\)/);
 assert.match(source,/cards\.push\(\.\.\.wrappedFoodCards\(stats,foodGenre,season,name,person,wrappedPlan\.people\)\)/);
});

test('ten people with identical viewing tastes get distinct fillings in both cards',()=>{
 const people=Array.from({length:10},(_,i)=>'Person '+i);
 for (const genre of ['', 'Action']) {
  const variants=people.map(person=>load(basic(),genre,person,people));
  assert.equal(new Set(variants.map(({taste})=>taste.vegetables)).size,people.length);
  assert.equal(new Set(variants.map(({cards})=>cards[0].html)).size,people.length);
  assert.equal(new Set(variants.map(({cards})=>cards[1].html)).size,people.length);
  for (const [i,{taste,cards}] of variants.entries()) {
   assert.deepEqual(taste,load(basic(),genre,people[i],[...people].reverse()).taste);
   for (const card of cards) {
    assert.ok(card.html.includes(taste.vegetables));
    assert.ok(card.html.includes(taste.cheese));
   }
  }
 }
});
