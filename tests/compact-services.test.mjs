import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from './harness.mjs';
// One streaming button per show: the preferred service first, the others behind "+N"
test('one service stays visible and alternatives expand without changing the list', async()=>{
 const p=await openPage();
 p.run(`$('list').innerHTML='<div class="links">'+linkButtons([{label:'Crunchyroll',main:true,color:'#f47521',url:'https://example.com/a'},{label:'Netflix',main:true,color:'#e50914',url:'https://example.com/b'}],1)+'</div>'`);
 const more=p.$('list').querySelector('[data-stream-more]'), alternatives=more.nextElementSibling;
 assert.equal(alternatives.hidden,true);assert.equal(more.textContent,'+1');
 assert.match(p.$('list').querySelector('.links > a').textContent,/Crunchyroll/);
 await p.click(more);assert.equal(alternatives.hidden,false);assert.equal(more.getAttribute('aria-expanded'),'true');
 await p.click(more);assert.equal(alternatives.hidden,true);
 assert.equal(p.calls.some(c=>/SaveMediaListEntry/.test(c.query)),false);p.close();
});
test('the preferred service from the settings comes first', async()=>{
 const p=await openPage({storage:{servicePriority:'Netflix'}});
 p.run(`$('list').innerHTML='<div class="links">'+linkButtons([{label:'Crunchyroll',main:true,color:'#f47521',url:'https://example.com/a'},{label:'Netflix',main:true,color:'#e50914',url:'https://example.com/b'}],1)+'</div>'`);
 assert.match(p.$('list').querySelector('.links > a').textContent,/Netflix/);
 assert.match(p.$('list').querySelector('[data-stream-more]').title,/Crunchyroll/);
 p.close();
});
