import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const menu=html.match(/<nav id="miscMenu"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
test('Tools are organized into four accessible sections with links preserved',()=>{
 assert.ok(menu,'existing Tools menu found');
 const headings=[...menu.matchAll(/<h3 class="misc-section-title">([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(headings,['Planung','Rückblick & Sammlung','Spiele','Extras']);
 const hrefs=[...menu.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(hrefs,[
  'season-preview.html','planner.html','wrapped.html','masterset/',
  'games.html','ranker/','https://mcdelivery.de/'
 ]);
 assert.equal(new Set(hrefs).size,hrefs.length);
});
test('Tools retain keyboard and compact scrolling behavior',()=>{
 assert.match(html,/id="miscButton"/);
 assert.match(css,/\.misc-menu\.site-tools\{[^}]*overflow:auto/);
 assert.match(css,/\.misc-menu \.misc-section-title/);
});
