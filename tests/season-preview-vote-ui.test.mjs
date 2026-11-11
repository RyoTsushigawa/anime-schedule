import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const src=readFileSync(fileURLToPath(new URL('../season-preview.js',import.meta.url)),'utf8');
function extract(name){
 const start=src.indexOf('function '+name+'(');
 if(start<0)throw Error('Function not found: '+name);
 let open=src.indexOf('{',start),depth=0;
 for(let i=open;i<src.length;i++){
  if(src[i]==='{')depth++;
  else if(src[i]==='}'){
   depth--;
   if(depth===0)return src.slice(start,i+1);
  }
 }
 throw Error('Function incomplete: '+name);
}
const implementation=['voteValue','validChoices','currentVoter','votingControls'].map(extract).join('\n');
const setup=[
 "const PV_OPTIONS=['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist','Okinawa 3'];",
 "const member={person:'Quecks'};",
 "const current={gid:'123'};",
 "const saving=new Set();",
 "const pendingVotes=new Map();",
 "const voteFeedback=new Map();",
 "const voteFeedbackKey=(gid,key,person)=>gid+'|'+key+'|'+person;",
 "const clean=x=>String(x||'').trim();",
 "const safeText=x=>clean(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;');",
 "const pv=id=>({value:'Quecks'});"
].join('\n');
const run=new Function('show','feedback','busy',setup+'\n'+implementation+'\n'+
 "if(feedback)voteFeedback.set(voteFeedbackKey('123',show.key,'Quecks'),feedback);"+
 "if(busy)saving.add(show.key);"+
 "return {html:votingControls(show),value:voteValue(show,'Quecks'),allowed:validChoices('Quecks'),ordinary:validChoices('MaRyo')};");
const show=value=>({key:'example',title:'Example',english:'Example',votes:value?[{name:'Quecks',value}]:[]});

test('all regular choices are available, Okinawa 3 is restricted, Default is a reset only',()=>{
 const result=run(show(),null,false);
 for(const value of ['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist'])
  assert.ok(result.ordinary.includes(value));
 assert.equal(result.ordinary.includes('Okinawa 3'),false);
 assert.equal(result.ordinary.includes('Default'),false);
 assert.equal(result.allowed.includes('Okinawa 3'),true);
});
test('selected votes indicate pressed state and allow reset',()=>{
 const result=run(show('Ja'),null,false);
 assert.equal(result.value,'Ja');
 assert.match(result.html,/data-vote="Ja"[^>]*aria-pressed="true"/);
 assert.match(result.html,/data-vote="Default"/);
});
test('unselected vote says it is open and offers no reset',()=>{
 const result=run(show('Default'),null,false);
 assert.equal(result.value,'Default');
 assert.match(result.html,/Noch offen/);
 assert.doesNotMatch(result.html,/data-vote="Default"/);
});
test('saving state disables controls and is visible on the card',()=>{
 const result=run(show(),null,true);
 assert.match(result.html,/Wird gespeichert/);
 assert.match(result.html,/data-vote="Ja"[^>]*disabled/);
});
test('failed save is shown on the corresponding anime card',()=>{
 const result=run(show(),{error:true,message:'Nicht gespeichert'},false);
 assert.match(result.html,/preview-vote error/);
 assert.match(result.html,/Nicht gespeichert/);
});
test('special options remain available behind a compact "…" menu',()=>{
 const result=run(show(),null,false);
 for(const value of ['Ja','Nein','Vielleicht','Demons','Allein','Wenn Belly dabei ist','Okinawa 3'])
  assert.match(result.html,new RegExp('data-vote="'+value+'"'));
 assert.match(result.html,/<span class="preview-more-menu" hidden>/);
});
test('a selected special vote shows on the menu button',()=>{
 const result=run(show('Demons'),null,false);
 assert.match(result.html,/class="on" data-more[^>]*>Demons</);
 assert.match(result.html,/data-vote="Demons"[^>]*aria-pressed="true"/);
});
