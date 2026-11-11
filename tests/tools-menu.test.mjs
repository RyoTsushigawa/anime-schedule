import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const games=readFileSync(new URL('../games.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const menu=html.match(/<nav id="miscMenu"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
const primary=html.match(/<nav class="header-primary"[^>]*>([\s\S]*?)<div class="misc-tools">/)?.[1];

test('main header exposes Schedule and Games, with More and existing Settings',()=>{
 assert.ok(primary,'primary nav exists');
 const direct=[...primary.matchAll(/<a class="header-nav-link[^"]*" href="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(direct,['./?view=week','games.html']);
 assert.match(html,/id="miscButton"[^>]*aria-controls="miscMenu"/);
 assert.match(html,/id="settingsButton"/);
});
test('More keeps all planning, recap and extra links without duplicating Games',()=>{
 assert.ok(menu,'More menu exists');
 const headings=[...menu.matchAll(/<h3 class="misc-section-title">([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(headings,['Zeitplan','Planung','Rückblick & Sammlung','Extras']);
 const hrefs=[...menu.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(hrefs,[
  'season-preview.html','planner.html','wrapped.html','masterset/','https://mcdelivery.de/'
 ]);
 assert.ok(!menu.includes('href="games.html"'));
 assert.ok(!menu.includes('href="ranker/"'));
 assert.equal(new Set(hrefs).size,hrefs.length);
});
test('schedule actions remain wired by ID inside More; Games links to Higher/Lower',()=>{
 for(const id of ['awayButton','overviewButton']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  assert.match(menu,new RegExp('id="'+id+'"'));
 }
 assert.match(games,/href="ranker\//);
});
test('compact navigation preserves mobile controls and accessible menu focus',()=>{
 assert.match(css,/\.header-primary\{display:flex/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/body\.searching \.header-primary\{display:none\}/);
 assert.match(css,/\.misc-menu\.site-tools\{[^}]*overflow:auto/);
 assert.match(css,/\.misc-menu \.misc-section-title/);
});
