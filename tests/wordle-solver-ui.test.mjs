import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,10));
test('owner UI cycles colors, submits clues, clears stale results and can remove attempts',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../wordle-solver.html',import.meta.url),'utf8'),{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;let submitted;
 w.localStorage.setItem('movesKey','fake');w.confirm=()=>true;w.fetch=async(url,init)=>{
  if(url==='config.json')return Response.json({previewVotesUrl:'https://anime-season-preview-votes.shigeruhagano.workers.dev'});
  if(url.endsWith('/access'))return Response.json({ok:true});submitted=JSON.parse(init.body);return Response.json({total:1,candidates:[{word:'APPLE',title:'Apple anime'}]});
 };
 w.eval(readFileSync(new URL('../wordle-solver.mjs',import.meta.url),'utf8'));await tick();assert.equal(w.document.getElementById('solverApp').hidden,false);
 const input=w.document.querySelector('.solver-row input');input.value='alley';input.dispatchEvent(new w.Event('input'));
 const tiles=w.document.querySelectorAll('.solver-tile');tiles[0].click();tiles[0].click();tiles[1].click();tiles[3].click();
 w.document.getElementById('solverFind').click();await tick();assert.deepEqual(submitted.rows[0],{word:'ALLEY',marks:['hit','near','miss','near','miss']});assert.match(w.document.getElementById('solverResults').textContent,/APPLE/);
 tiles[2].click();assert.equal(w.document.getElementById('solverResults').textContent,'');
 w.document.getElementById('solverAdd').click();assert.equal(w.document.querySelectorAll('.solver-row').length,2);w.document.querySelector('.solver-row-head button').click();assert.equal(w.document.querySelectorAll('.solver-row').length,1);
 dom.window.close();
});
test('without an editor key the solver never exposes its controls or sends a request',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../wordle-solver.html',import.meta.url),'utf8'),{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;w.fetch=()=>{throw Error('Unexpected request');};
 w.eval(readFileSync(new URL('../wordle-solver.mjs',import.meta.url),'utf8'));await tick();assert.equal(w.document.getElementById('solverApp').hidden,true);assert.match(w.document.getElementById('solverAuthStatus').textContent,/Nur für Ryo/);dom.window.close();
});
