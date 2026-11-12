import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const games=readFileSync(new URL('../games.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const menu=html.match(/<nav id="miscMenu"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
const primary=html.match(/<nav class="header-primary"[^>]*>([\s\S]*?)<div class="misc-tools">/)?.[1];

test('main header exposes Schedule and More with existing Settings',()=>{
 assert.ok(primary,'primary nav exists');
 const direct=[...primary.matchAll(/<a class="header-nav-link[^"]*" href="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(direct,['./?view=week']);
 assert.match(html,/id="miscButton"[^>]*aria-controls="miscMenu"/);
 assert.match(html,/id="settingsButton"/);
});
test('More keeps all planning, recap and extra links without duplicating Games',()=>{
 assert.ok(menu,'More menu exists');
 const headings=[...menu.matchAll(/<h3 class="misc-section-title">([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(headings,['Planung','Rückblick &amp; Spiele','Extras']);
 const hrefs=[...menu.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(hrefs,[
  'season-preview.html','planner.html','wrapped.html','tierlist.html','games.html','masterset/','https://mcdelivery.de/'
 ]);
 assert.equal((menu.match(/href="games.html"/g)||[]).length,1);
 assert.ok(!menu.includes('href="ranker/"'));
 assert.equal(new Set(hrefs).size,hrefs.length);
});
test('schedule actions stay wired by ID: Abwesend in the header, Wochenübersicht in More; Games links to Higher/Lower',()=>{
 for(const id of ['awayButton','overviewButton'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 // Abwesend is one of the most used functions: a header button, not inside More
 assert.doesNotMatch(menu,/id="awayButton"/);
 assert.match(html,/<nav class="header-primary"[\s\S]*id="awayButton"[\s\S]*id="miscButton"/);
 assert.match(menu,/id="overviewButton"/);
 assert.match(games,/href="ranker\//);
});
test('compact navigation preserves mobile controls and accessible menu focus',()=>{
 assert.match(css,/\.header-primary\s*\{\s*display:\s*flex/);
 assert.match(css,/@media\s*\(max-width:\s*560px\)/);
 assert.match(css,/body\.searching \.header-primary\s*\{\s*display:\s*none;?\s*\}/);
 assert.match(css,/\.misc-menu\.site-tools\s*\{[^}]*overflow:\s*auto/);
 assert.match(css,/\.misc-menu \.misc-section-title/);
});
