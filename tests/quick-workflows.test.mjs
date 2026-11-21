import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from './harness.mjs';

test('search accepts words in any order without automatically calling AniList',async()=>{
 const p=await openPage({lookup:[]});try{
  p.$('search').value='EN Alpha';p.$('search').dispatchEvent(new p.window.Event('input'));await p.settle(900);
  const hits=[...p.document.querySelectorAll('#list .row[data-search]:not(.hidden-by-search)')];
  assert.ok(hits.some(r=>r.textContent.includes('Alpha EN')));assert.ok(!hits.some(r=>r.textContent.includes('Beta EN')));
  assert.ok(p.$('lookupMore'));assert.equal(p.calls.filter(c=>c.query.includes('search: Page')).length,0);
  await p.click(p.$('lookupMore'),900);assert.equal(p.calls.filter(c=>c.query.includes('search: Page')).length,1);
 }finally{p.close();}
});
test('search Enter focuses the first match without opening a stream or writing progress',async()=>{
 const p=await openPage();try{
  p.$('search').value='alpha';p.$('search').dispatchEvent(new p.window.Event('input'));await p.settle();
  let opened=0;p.document.querySelectorAll('.links a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();opened++;}));
  p.$('search').focus();p.$('search').dispatchEvent(new p.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.ok(p.document.activeElement.classList.contains('row'));assert.match(p.document.activeElement.textContent,/Alpha/);
  assert.equal(opened,0);assert.equal(p.calls.filter(c=>c.query.includes('SaveMediaListEntry')).length,0);
 }finally{p.close();}
});
test('unknown titles still trigger automatic external search',async()=>{
 const p=await openPage({lookup:[]});try{
  p.$('search').value='unknown show';p.$('search').dispatchEvent(new p.window.Event('input'));await p.settle(950);
  assert.equal(p.calls.filter(c=>c.query.includes('search: Page')).length,1);
 }finally{p.close();}
});
test('time entry accepts shorthand and rejects impossible times',async()=>{
 const p=await openPage();try{
  for(const [raw,want] of [['1930','19:30'],['19','19:00'],['930','09:30'],['9.30','09:30'],['24:00','00:00'],['',''],['99:00',null],['12:60',null],['19:30x',null]])
   assert.equal(p.run(`normalizeMoveTime(${JSON.stringify(raw)})`),want,raw);
 }finally{p.close();}
});
test('time nudges cross midnight in the same evening and respect its bounds',async()=>{
 const p=await openPage();try{
  p.$('moveTime').value='2330';await p.click(p.$('moveLater'));assert.equal(p.$('moveTime').value,'00:00');
  await p.click(p.$('moveEarlier'));assert.equal(p.$('moveTime').value,'23:30');
  p.$('moveTime').value='05:30';p.run('syncMoveTimeSteps()');assert.equal(p.$('moveLater').disabled,true);
  p.$('moveTime').value='';p.run('syncMoveTimeSteps()');assert.equal(p.$('moveEarlier').disabled,true);assert.equal(p.$('moveLater').disabled,true);
 }finally{p.close();}
});
test('saving uses the normalized time and invalid input makes no change',async()=>{
 const p=await openPage();try{
  p.run(`globalThis.savedMove=null;storeMoves=next=>{savedMove=next};moving={key:'alpha',name:'Alpha'};`);
  p.$('moveTime').value='1930';await p.click(p.$('moveSave'));assert.equal(p.run('savedMove.at(-1).time'),'19:30');
  p.run('savedMove=null');p.$('moveTime').value='29:77';await p.click(p.$('moveSave'));assert.equal(p.run('savedMove'),null);assert.match(p.$('moveMsg').textContent,/Gültige/);
 }finally{p.close();}
});
test('save shortcut works only in the intended editor and never repeats a pending save',async()=>{
 const p=await openPage();try{
  let saves=0;p.$('moveSave').onclick=()=>saves++;p.$('moveDlg').showModal();
  const send=(opts={})=>p.$('moveTime').dispatchEvent(new p.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true,...opts}));
  send();assert.equal(saves,1);send({repeat:true});assert.equal(saves,1);
  p.$('moveDlg').saveToken='pending';send();assert.equal(saves,1);delete p.$('moveDlg').saveToken;
  send({ctrlKey:false,metaKey:true});assert.equal(saves,2);p.$('moveDlg').close();send();assert.equal(saves,2);
  p.$('daySave').onclick=()=>saves++;p.$('dayDlg').showModal();
  p.$('dayText').dispatchEvent(new p.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));assert.equal(saves,3);
 }finally{p.close();}
});
