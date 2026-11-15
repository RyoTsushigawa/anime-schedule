import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const src = fs.readFileSync(new URL('../app-dayedit.js',import.meta.url),'utf8').split('// Quick multi-skip:')[1];
function page(allowed=true){
 const dom=new JSDOM('<body><main id="list"><section class="day" data-date="2099-01-01">'+['Alpha','Beta','Gamma'].map(x=>`<div class="row"><button class="move" data-move-title="${x}" data-move-name="${x}"></button></div>`).join('')+'</section></main></body>',{runScripts:'outside-only'});
 const w=dom.window;let saved,fail=false;
 Object.assign(w,{$:id=>w.document.getElementById(id),canMove:()=>allowed,view:'week',weekOffset:0,isoDay:d=>typeof d==='string'?d:'2026-11-15',weekStart:n=>'2099-01-'+(n?'08':'01'),norm:x=>x.toLowerCase(),moves:[{show:'other',week:'2099-01-01'},{show:'alpha',tag:'Di.',time:'21:00'}],saveMoves:async x=>{if(fail)throw Error('offline');saved=x;},notice:()=>{},load:async()=>{}});
 w.eval('// Quick multi-skip:'+src);
 return {w,dom,get saved(){return saved&&JSON.parse(JSON.stringify(saved));},fail:()=>fail=true,q:s=>w.document.querySelector(s),all:s=>[...w.document.querySelectorAll(s)]};
}
test('select multiple different shows and save once, preserving other moves and permanent slots',async()=>{
 const p=page();try{p.q('[data-bulk-toggle]').click();p.all('.bulk-skip-pick').slice(0,2).forEach(b=>b.click());await p.q('[data-bulk-save]').onclick();assert.equal(p.saved.length,4);assert.equal(p.saved.filter(x=>x.skip).length,2);assert.equal(p.saved.find(x=>x.skip&&x.show==='alpha').time,'21:00');assert.ok(!p.saved.find(x=>x.skip).keepTime);}finally{p.dom.window.close();}
});
test('keep-times option applies to every selected show',async()=>{const p=page();try{p.q('[data-bulk-toggle]').click();p.all('.bulk-skip-pick').forEach(b=>b.click());p.q('[data-bulk-keep]').checked=true;await p.q('[data-bulk-save]').onclick();assert.ok(p.saved.filter(x=>x.skip).every(x=>x.keepTime));}finally{p.dom.window.close();}});
test('cancel writes nothing',()=>{const p=page();try{p.q('[data-bulk-toggle]').click();p.q('.bulk-skip-pick').click();p.q('[data-bulk-cancel]').click();assert.equal(p.saved,undefined);assert.equal(p.all('.bulk-skip-pick').length,0);}finally{p.dom.window.close();}});
test('no permission means no selection controls',()=>{const p=page(false);try{assert.ok(p.q('.bulk-skip-bar').hidden);assert.equal(p.all('.bulk-skip-pick').length,0);}finally{p.dom.window.close();}});
test('changing weeks cannot apply the old selection',async()=>{const p=page();try{p.q('[data-bulk-toggle]').click();p.q('.bulk-skip-pick').click();p.w.weekOffset=1;await p.q('[data-bulk-save]').onclick();assert.equal(p.saved,undefined);}finally{p.dom.window.close();}});
test('failed save keeps the selection and offers retry',async()=>{const p=page();try{p.q('[data-bulk-toggle]').click();p.q('.bulk-skip-pick').click();p.fail();await p.q('[data-bulk-save]').onclick();assert.match(p.q('[data-bulk-error]').textContent,/offline/);assert.equal(p.q('.bulk-skip-pick').getAttribute('aria-pressed'),'true');assert.equal(p.q('[data-bulk-save]').disabled,false);}finally{p.dom.window.close();}});
