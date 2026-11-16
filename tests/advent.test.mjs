import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {calendarState,readOpened,writeOpened} from '../advent-core.mjs';
import {doors,sample} from '../advent-content.mjs';
test('Berlin midnight unlocks only the correct door; past doors remain available',()=>{
 for(const [iso,n] of [['2026-11-30T22:59:59Z',0],['2026-11-30T23:00:00Z',1],['2026-12-02T23:00:00Z',3],['2026-12-23T23:00:00Z',24],['2027-01-10T12:00:00Z',24],['2025-12-24T12:00:00Z',0]])assert.equal(calendarState(new Date(iso)).available,n);
});
test('24 unique doors, valid quiz answers, and an independent sample',()=>{
 assert.equal(doors.length,24);assert.equal(new Set(doors.map(d=>d.title)).size,24);assert.ok(!doors.includes(sample));
 for(const d of doors){assert.ok(['quiz','challenge','prompt'].includes(d.type));if(d.type==='quiz'){assert.ok(d.options[d.answer]);assert.ok(d.explanation);}}
});
test('saved progress tolerates corrupt or unavailable storage',()=>{
 assert.deepEqual([...readOpened({getItem:()=>'{bad'})],[]);
 assert.deepEqual([...readOpened({getItem:()=> '[1,1,24,25,-1,"2"]'})],[1,24]);
 assert.equal(writeOpened(undefined,new Set([1])),false);
});
test('locked doors, sample, quizzes, and December snow use the page controls',async()=>{
 const html=readFileSync(new URL('../advent.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test/advent.html',runScripts:'outside-only'}),w=dom.window;
 let now='2026-11-15T12:00:00Z';const RealDate=Date;w.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}};
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.setInterval=()=>0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 Object.assign(w,{mountAnswers:()=>{},CALENDAR_YEAR:2026,calendarState:()=>calendarState(new Date(now)),readOpened,writeOpened,doors,sample});
 w.eval(readFileSync(new URL('../advent.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 const $=id=>w.document.getElementById(id);
 w.document.querySelector('[data-day="1"]').click();assert.equal($('adventDialog').open,false);
 $('adventSample').click();assert.equal($('adventDialog').open,true);assert.match($('adventDoorTitle').textContent,/Nebenquest/);$('adventDone').click();
 assert.equal(w.localStorage.getItem('advent-opened-2026'),null);assert.equal(w.document.querySelector('.advent-snow').hidden,true);
 now='2026-12-02T12:00:00Z';w.document.dispatchEvent(new w.Event('visibilitychange'));w.eval('render()');
 assert.equal(w.document.querySelector('.advent-snow').hidden,false);
 w.document.querySelector('[data-day="2"]').click();assert.equal($('adventDialog').open,true);
 w.document.querySelector('.advent-choices button').click();assert.match(w.document.querySelector('.advent-answer').textContent,/Richtig/);
 assert.deepEqual(JSON.parse(w.localStorage.getItem('advent-opened-2026')),[2]);
 $('adventDone').click();assert.equal(w.document.activeElement.dataset.day,'2');
 $('adventSnow').click();assert.equal(w.document.querySelector('.advent-snow').hidden,true);
 dom.window.close();
});


test('editor preview opens every door without saving progress or publishing answers',()=>{
 const dom=new JSDOM(readFileSync(new URL('../advent.html',import.meta.url),'utf8'),{url:'https://example.test/advent.html?preview=1',runScripts:'outside-only'}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.setInterval=()=>0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let mounts=0,reviews=[];const review={doors:{3:{status:'ok'},5:{status:'change',note:'andere Frage'}}};
 Object.assign(w,{mountAnswers:()=>mounts++,CALENDAR_YEAR:2026,calendarState:()=>({available:0,today:null}),readOpened,writeOpened,doors,sample,
  review,loadReview:async()=>review,mountReview:(box,n)=>reviews.push(n),summary:()=>'1 freigegeben · 1 Änderungswünsche · 22 offen'});
 w.eval(readFileSync(new URL('../advent.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 w.document.querySelector('[data-day="24"]').click();assert.equal(w.document.getElementById('adventDialog').open,true);assert.equal(w.document.getElementById('adventNext').disabled,true);
 w.document.getElementById('adventPrev').click();assert.match(w.document.getElementById('adventDoorType').textContent,/23/);
 assert.equal(mounts,0);assert.equal(w.localStorage.getItem('advent-opened-2026'),null);
 // the owner's review: each door shows its verdict, and an opened door gets the ✓ / ✎ controls
 assert.deepEqual(reviews,[24,23]);
 assert.equal(w.document.querySelector('[data-day="3"]').dataset.review,'ok');
 assert.match(w.document.querySelector('[data-day="5"]').textContent,/Ändern/);
 assert.match(w.document.getElementById('adventReviewSummary').textContent,/1 freigegeben/);
 dom.window.close();
});
