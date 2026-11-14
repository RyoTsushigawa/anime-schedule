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
