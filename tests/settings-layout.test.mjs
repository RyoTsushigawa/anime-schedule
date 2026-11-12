import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css = readFileSync(new URL('../style.css',import.meta.url),'utf8');
const menu = html.match(/<div id="settingsMenu"[^>]*>([\s\S]*?)\n<\/div>\n<\/div>\n<div class="settings">/)?.[1] || '';
const quick = menu.match(/<div class="settings-primary"[^>]*>([\s\S]*?)<div class="settings-secondary">/)?.[1] || '';

test('Settings shows only Time, Density and Design before the extra options',()=>{
 assert.ok(menu,'settings menu found');
 const headings=[...quick.matchAll(/<div class="menu-label">([^<]+)<\/div>/g)].map(m=>m[1]);
 assert.deepEqual(headings,['Zeit','Dichte','Design']);
 assert.match(quick,/data-set="time"/);
 assert.match(quick,/data-set="density"/);
 assert.match(quick,/data-theme-choice="dark"/);
 assert.match(quick,/class="swatches"/);
});

test('Less-used settings live in three native disclosure panels',()=>{
 const summary=[...menu.matchAll(/<details class="settings-fold"><summary>([^<]+)/g)].map(m=>m[1]);
 assert.deepEqual(summary,['Streaming','Anzeige &amp; Listen','Weitere Optionen']);
 assert.doesNotMatch(menu,/<details class="settings-fold" open/);
 assert.match(css,/#settingsMenu \.settings-fold>summary:focus-visible/);
 assert.match(css,/#settingsMenu \.settings-fold\[open\]/);
});

test('Every existing setting and help action remains available once, with existing IDs',()=>{
 for(const id of ['markOnOpen','who','behind','dropButtons','servicePriority','settingsNicknames','movesSetup','helpButton','notesButton','settingsExport','settingsImport','settingsFile','feedbackLink']){
  const count=[...menu.matchAll(new RegExp('id="'+id+'"','g'))].length;
  assert.equal(count,1,id+' must still exist exactly once');
 }
 for(const selector of ['data-fallback-source="aniworld"','data-fallback-source="torrent"','data-prime-choice="prime"','data-prime-choice="torrent"','data-set="sort"']){
  assert.ok(menu.includes(selector),selector+' must remain available');
 }
});
