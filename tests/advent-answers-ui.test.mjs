import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountAnswers} from '../advent-answers.mjs';
test('shared answer UI saves text safely, retains failed drafts, and edits the existing answer',async()=>{
 const dom=new JSDOM('<section id="host"></section>',{url:'https://example.test'}),w=dom.window;globalThis.Option=w.Option;globalThis.savedGroupCode=()=> 'group-code';
 let fail=false,posted;const saved=[];const identity={draw(){},canAct:()=>true,myPeople:()=>['Ryo'],headers:()=>({'X-AniList-Token':'fake'}),askGroupCode(){}};
 const deps={identity,storage:w.localStorage,setup:async()=>({api:'https://example.test',people:['Ryo','Marvin']}),fetch:async(url,opts)=>{
  if(opts.method==='GET')return new Response(JSON.stringify({answers:saved}));if(fail)throw Error('offline');posted=JSON.parse(opts.body);const answer={person:posted.person,text:posted.text};saved.splice(0,saved.length,answer);return new Response(JSON.stringify({answer}));
 }};
 const host=w.document.getElementById('host');await mountAnswers(host,0,deps);
 const input=host.querySelector('textarea');input.value='<img src=x onerror=alert(1)>';input.dispatchEvent(new w.Event('input'));
 host.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert.equal(posted.person,'Ryo');assert.equal(host.querySelector('.advent-group-answer p').textContent,input.value);assert.equal(host.querySelector('.advent-group-answer img'),null);
 fail=true;input.value='Mein Entwurf';input.dispatchEvent(new w.Event('input'));host.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert.match(host.querySelector('[role="status"]').textContent,/Nicht gespeichert/);assert.equal(w.localStorage.getItem('advent-draft:2026:0:Ryo'),'Mein Entwurf');
 host.replaceChildren();await mountAnswers(host,0,deps);assert.equal(host.querySelector('textarea').value,'Mein Entwurf');dom.window.close();
});

test('a chain door shows the parts in the order they were saved, as one text', async () => {
 const dom=new JSDOM('<section id="host"></section>',{url:'https://example.test'}),w=dom.window;globalThis.Option=w.Option;globalThis.savedGroupCode=()=> 'group-code';
 const identity={draw(){},canAct:()=>true,myPeople:()=>['Ryo'],headers:()=>({}),askGroupCode(){}};
 const saved=[{person:'Belly',text:'und alle Snacks sind weg.',updatedAt:'2026-12-12T20:02:00Z'},{person:'Ryo',text:'Ich wurde als Guckplan wiedergeboren',updatedAt:'2026-12-12T20:00:00Z'}];
 const deps={identity,storage:w.localStorage,chain:true,setup:async()=>({api:'https://example.test',people:['Ryo','Belly']}),fetch:async()=>new Response(JSON.stringify({answers:saved}))};
 const host=w.document.getElementById('host');await mountAnswers(host,12,deps);
 assert.equal(host.querySelector('.advent-chain-text').textContent,'Ich wurde als Guckplan wiedergeboren und alle Snacks sind weg.');
 assert.match(host.textContent,/Von Ryo → Belly/);
 dom.window.close();
});
