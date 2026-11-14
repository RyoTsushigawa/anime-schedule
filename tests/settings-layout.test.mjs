import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { APP_SOURCE } from './app-source.mjs';

const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css = readFileSync(new URL('../style.css',import.meta.url),'utf8');
const menu = html.match(/<div id="settingsMenu"[^>]*>([\s\S]*?)\n<\/div>\n<\/div>\n<div class="settings">/)?.[1] || '';
const quick = menu.match(/<div class="settings-primary"[^>]*>([\s\S]*?)<section class="settings-shown">/)?.[1] || '';

test('Settings shows only Time, Density and Design before the extra options',()=>{
 assert.ok(menu,'settings menu found');
 const headings=[...quick.matchAll(/<div class="menu-label">([^<]+)<\/div>/g)].map(m=>m[1]);
 assert.deepEqual(headings,['Zeit','Design','Farben']);
 assert.match(quick,/data-set="time"/);
 assert.match(quick,/data-set="density"/);
 assert.match(quick,/data-theme-choice="dark"/);
 assert.match(quick,/class="swatches"/);
});

test('Less-used settings live in native disclosure panels by topic; help, patch notes and feedback stay at the bottom',()=>{
 const summary=[...menu.matchAll(/<details class="settings-fold"><summary>([^<]+)/g)].map(m=>m[1]);
 assert.deepEqual(summary,['Streaming','Lesbarkeit','Einstellungen sichern']);
 // the on/off options are visible right away, not folded
 assert.match(menu,/<section class="settings-shown">\n<div class="menu-label">Anzeigen<\/div>/);
 assert.match(menu,/<div class="settings-footer"><button id="helpButton"[\s\S]*id="notesButton"[\s\S]*id="feedbackLink"/);
 // the old global "details" margin must not reach the menu, and a fold with no visible tools is not shown
 assert.match(css,/#settingsMenu details \{ margin: 0;/);
 assert.match(css,/#settingsMenu \.settings-fold:not\(:has\(/);
 assert.doesNotMatch(menu,/<details class="settings-fold" open/);
 assert.match(css,/#settingsMenu \.settings-fold\s*>\s*summary:focus-visible/);
 assert.match(css,/#settingsMenu \.settings-fold\[open\]/);
});

test('Every existing setting and help action remains available once, with existing IDs',()=>{
 for(const id of ['markOnOpen','who','behind','dropButtons','servicePriority','helpButton','notesButton','settingsExport','settingsImport','settingsFile','feedbackLink']){
  const count=[...menu.matchAll(new RegExp('id="'+id+'"','g'))].length;
  assert.equal(count,1,id+' must still exist exactly once');
 }
 // the tools moved: list tools to the account menu, plan and Discord tools to "Mehr"
 const account=html.match(/<div id="accountMenu"[\s\S]*?<\/section>\n<section id="listSyncSection"/)?.[0]||'';
 for(const id of ['accountCheckButton','transferButton','healthButton','syncButton']) assert.match(account,new RegExp('id="'+id+'"'),id);
 const more=html.match(/<nav id="miscMenu"[\s\S]*?<\/nav>/)?.[0]||'';
 for(const id of ['settingsNicknames','deliveryButton','episodeCrosswalkButton','dataButton','repairButton','movesSetup']) assert.match(more,new RegExp('id="'+id+'"'),id);
 for(const id of ['accountCheckButton','settingsNicknames','movesSetup','deliveryAlert']){
  const count=[...html.matchAll(new RegExp('id="'+id+'"','g'))].length;
  assert.equal(count,1,id+' must still exist exactly once');
 }
 for(const selector of ['data-fallback-source="aniworld"','data-fallback-source="torrent"','data-prime-choice="prime"','data-prime-choice="torrent"','data-set="sort"']){
  assert.ok(menu.includes(selector),selector+' must remain available');
 }
});

test('mixed person choices never highlight two opposing streaming pills',()=>{
 const js = APP_SOURCE;
 assert.match(menu,/data-fallback-group/);
 assert.match(menu,/data-prime-group/);
 for(const id of ['fallbackMixed','primeMixed']) assert.match(menu,new RegExp('id="'+id+'"[^>]*hidden'));
 assert.match(js,/String\(!mixed && selected\.has\(b\.dataset\.fallbackSource\)\)/);
 assert.match(js,/String\(!mixed && selected\.has\(b\.dataset\.primeChoice\)\)/);
 assert.match(js,/note\.hidden = !mixed/);
});
