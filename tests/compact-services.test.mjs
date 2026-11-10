import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from './harness.mjs';
test('one service stays visible and alternatives expand without changing the list', async()=>{
 const p=await openPage();
 p.run(`$('list').innerHTML='<div class="links">'+linkButtons([{label:'Crunchyroll',main:true,color:'#f47521',url:'https://example.com/a'},{label:'Netflix',main:true,color:'#e50914',url:'https://example.com/b'}],1)+'</div>'`);
 const more=p.$('list').querySelector('[data-stream-more]'), alternatives=more.nextElementSibling;
 assert.equal(alternatives.hidden,true);assert.equal(more.textContent,'+1');
 await p.click(more);assert.equal(alternatives.hidden,false);assert.equal(more.getAttribute('aria-expanded'),'true');
 await p.click(more);assert.equal(alternatives.hidden,true);
 assert.equal(p.calls.some(c=>/SaveMediaListEntry/.test(c.query)),false);p.close();
});
test('slot explanations show cumulative changes and escape source names',async()=>{
 const p=await openPage();
 const notes=p.run(`slotReasons({slot:{tag:'Fr.',time:'21:00',from:{tag:'Do.',time:'20:00'},keepTime:true},delay:30,later:30})`);
 assert.equal(notes.length,4);assert.match(notes.join(' '),/Do\. 20:00 → Fr\. 21:00/);
 p.run(`$('list').innerHTML=explainSlot('<div class="ep">Folge 4</div>',{skipped:true,missing:['<img src=x onerror=alert(1)>']})`);
 await p.click(p.$('list').querySelector('[data-slot-reasons]'));
 assert.equal(p.$('slotReasonDlg').open,true);assert.equal(p.$('slotReasonText').querySelector('img'),null);
 assert.match(p.$('slotReasonText').textContent,/<img/);p.close();
});
