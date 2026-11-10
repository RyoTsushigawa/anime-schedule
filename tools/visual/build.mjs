import {mkdir,writeFile} from 'node:fs/promises';
import {openPage} from '../../tests/harness.mjs';
await mkdir(new URL('./fixtures/',import.meta.url),{recursive:true});
const p=await openPage({storage:{movesKey:'fixture-only',anilistAccounts:JSON.stringify([{name:'Tester',token:'fixture-only'}]),anilistActive:'Tester',anilistUser:'Tester',time:'watch',who:'1'},list:{1:{status:'CURRENT',progress:1}}});
async function save(name){
 const copy=p.document.documentElement.cloneNode(true);
 copy.querySelectorAll('script').forEach(e=>e.remove());
 copy.removeAttribute('data-theme');
 copy.querySelectorAll('.row > img').forEach(e=>e.src='visual-cover.svg');
 copy.querySelectorAll('[style]').forEach(e=>e.style.removeProperty('--art'));
 await writeFile(new URL('./fixtures/'+name+'.html',import.meta.url),'<!doctype html>'+copy.outerHTML);
}
p.document.querySelector('#list .title a').textContent='A Very Long Anime Title That Should Wrap Clearly Without Pushing Controls Off the Screen';
p.run(`document.querySelector('#list .links').innerHTML=linkButtons([{label:'Crunchyroll',url:'https://example.com/a',main:true,color:'#f47521'},{label:'Netflix',url:'https://example.com/b',main:true,color:'#e50914'}],1)`);
await save('week');
await p.click(p.document.querySelector('[data-stream-more]'));await save('services');
await p.click(p.$('settingsButton'));await save('settings');
await p.click(p.$('settingsButton'));
await p.click(p.$('list').querySelector('[data-delay]') || p.$('list').querySelector('.day-delay'));
await save('delay');p.$('delayDlg').close();
p.advance(10*3600000);await p.click(p.$('viewCatchup'));await save('catchup');
p.run(`{ const row = document.querySelector('#list .row'); row.outerHTML = explainSlot(row.outerHTML, {slot:{tag:'Fr.',time:'21:00',from:{tag:'Do.',time:'20:00'}},delay:30,later:30}); }`);
await p.click(p.document.querySelector('[data-slot-reasons]'));await save('reasons');
p.close();
await writeFile(new URL('./fixtures/visual-cover.svg',import.meta.url),'<svg xmlns="http://www.w3.org/2000/svg" width="50" height="70"><rect width="50" height="70" fill="#8171ab"/><circle cx="25" cy="28" r="15" fill="#d5c3fb"/></svg>');

