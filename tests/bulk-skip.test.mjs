import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const src = fs.readFileSync(new URL('../app-dayedit.js',import.meta.url),'utf8').split('// Quick multi-skip:')[1];
function page(allowed=true){
 const dom=new JSDOM('<body><input type="checkbox" id="moveButtons"><main id="list"><section class="day" data-date="2099-01-01">'+['Alpha','Beta','Gamma'].map(x=>`<div class="row"><button class="move" data-move-title="${x}" data-move-name="${x}"></button></div>`).join('')+'</section></main></body>',{runScripts:'outside-only'});
 const w=dom.window;let saved,fail=false;
 Object.assign(w,{$:id=>w.document.getElementById(id),canMove:()=>allowed,view:'week',weekOffset:0,isoDay:d=>typeof d==='string'?d:'2026-11-15',weekStart:n=>'2099-01-'+(n?'08':'01'),norm:x=>x.toLowerCase(),moves:[{show:'other',week:'2099-01-01'},{show:'alpha',tag:'Di.',time:'21:00'}],saveMoves:async x=>{if(fail)throw Error('offline');saved=x;},notice:()=>{},load:async()=>{},lastWeekRender:null,movesUndo:null,SLOT_MINUTES:30,shortDayName:d=>'Mi',render:()=>[]});
 w.eval('// Quick multi-skip:'+src);
 const edit=()=>{const b=w.document.getElementById('moveButtons');b.checked=true;b.dispatchEvent(new w.Event('change'));};
 return {w,dom,edit,get saved(){return saved&&JSON.parse(JSON.stringify(saved));},fail:()=>fail=true,q:s=>w.document.querySelector(s),all:s=>[...w.document.querySelectorAll(s)]};
}
test('select multiple different shows and save once, preserving other moves and permanent slots',async()=>{
 const p=page();try{p.edit();p.all('.bulk-skip-pick').slice(0,2).forEach(b=>b.click());await p.q('[data-bulk-save]').onclick();assert.equal(p.saved.length,4);assert.equal(p.saved.filter(x=>x.skip).length,2);assert.equal(p.saved.find(x=>x.skip&&x.show==='alpha').time,'21:00');assert.ok(!p.saved.find(x=>x.skip).keepTime);}finally{p.dom.window.close();}
});
test('keep-times option applies to every selected show',async()=>{const p=page();try{p.edit();p.all('.bulk-skip-pick').forEach(b=>b.click());p.q('[data-bulk-keep]').checked=true;await p.q('[data-bulk-save]').onclick();assert.ok(p.saved.filter(x=>x.skip).every(x=>x.keepTime));}finally{p.dom.window.close();}});
test('cancel writes nothing',()=>{const p=page();try{p.edit();p.q('.bulk-skip-pick').click();p.q('[data-bulk-cancel]').click();assert.equal(p.saved,undefined);assert.equal(p.all('.bulk-skip-pick[aria-pressed="true"]').length,0);assert.equal(p.q('.bulk-skip-options').hidden,true);}finally{p.dom.window.close();}});
test('no permission means no selection controls',()=>{const p=page(false);try{assert.ok(p.q('.bulk-skip-bar').hidden);assert.equal(p.all('.bulk-skip-pick').length,0);}finally{p.dom.window.close();}});
test('changing weeks cannot apply the old selection',async()=>{const p=page();try{p.edit();p.q('.bulk-skip-pick').click();p.w.weekOffset=1;await p.q('[data-bulk-save]').onclick();assert.equal(p.saved,undefined);}finally{p.dom.window.close();}});
test('failed save keeps the selection and offers retry',async()=>{const p=page();try{p.edit();p.q('.bulk-skip-pick').click();p.fail();await p.q('[data-bulk-save]').onclick();assert.match(p.q('[data-bulk-error]').textContent,/offline/);assert.equal(p.q('.bulk-skip-pick').getAttribute('aria-pressed'),'true');assert.equal(p.q('[data-bulk-save]').disabled,false);}finally{p.dom.window.close();}});

test('one click undoes the whole bulk skip and reopens the same selection',async()=>{
 const p=page();try{
  p.edit();p.all('.bulk-skip-pick').slice(0,2).forEach(b=>b.click());await p.q('[data-bulk-save]').onclick();
  assert.equal(typeof p.w.movesUndo,'function');
  // someone else added a move meanwhile: undo keeps it and restores only the skipped entries
  const now=[...p.saved,{show:'delta',tag:'Fr.',time:'20:00'}];
  const back=p.w.movesUndo(now);
  assert.equal(back.filter(x=>x.skip).length,0);
  assert.ok(back.some(x=>x.show==='delta'));assert.ok(back.some(x=>x.show==='other'));
  p.w.movesUndo.after();
  assert.equal(p.all('.bulk-skip-pick[aria-pressed="true"]').length,2);
 }finally{p.dom.window.close();}
});
test('the preview shows when the evening ends and what moves up, parallel slots included',()=>{
 const p=page();try{
  const at=(h,m=0)=>new Date(2099,0,1,h,m).getTime();
  const row=(t,h,m)=>({show:{english:t,romaji:t},watchAt:at(h,m),episodes:[1]});
  p.w.lastWeekRender=[[],'2099-01-01',new Map()];
  p.w.render=()=>{const skip=new Set(p.w.moves.filter(x=>x.skip&&x.week==='2099-01-01').map(x=>x.show));
   const rows=[row('Alpha',20),row('Beta',20),row('Gamma',21)].map(r=>skip.has(r.show.english.toLowerCase())?{...r,pause:true}:r);
   if(skip.has('alpha')&&skip.has('beta'))rows[2].watchAt=at(20);
   return [{date:new Date(2099,0,1),rows}];};
  p.edit();
  p.all('.bulk-skip-pick')[0].click();
  assert.match(p.q('[data-bulk-preview]').textContent,/endet weiter um 21:30.*20:00 bleibt belegt \(Beta parallel\)/);
  p.all('.bulk-skip-pick')[1].click();
  assert.match(p.q('[data-bulk-preview]').textContent,/endet 20:30 statt 21:30 · Gamma 21:00 → 20:00/);
 }finally{p.dom.window.close();}
});

test('skipping is part of Edit: no Skip buttons until Edit is on, the bar only once something is picked',()=>{
 const p=page();try{
  assert.equal(p.all('.bulk-skip-pick').length,0);
  p.edit();
  assert.equal(p.all('.bulk-skip-pick').length,3);
  assert.equal(p.q('.bulk-skip-options').hidden,true);
  p.q('.bulk-skip-pick').click();
  assert.equal(p.q('.bulk-skip-options').hidden,false);
  const b=p.w.document.getElementById('moveButtons');b.checked=false;b.dispatchEvent(new p.w.Event('change'));
  assert.equal(p.all('.bulk-skip-pick').length,0,'Edit off: the Skip buttons go');
 }finally{p.dom.window.close();}
});
