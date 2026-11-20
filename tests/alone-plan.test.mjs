import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from './harness.mjs';
const csv = ['Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly',
  'Show Alpha,Alpha EN,C,Mi.,20:00,Allein,Ja',
  'Show Beta,Beta EN,C,Sa.,,Ja,Nein',
  'Show Gamma,Gamma EN,C,Do.,21:00,Ja,Ja'].join('\n');
const open = () => openPage({sheets:{csv:{111:csv,222:csv}},storage:{mode:'solo',soloPerson:'MaRyo',range:'week'}});
test('Allein appears on its sheet day without time, fade marker or group-edit button', async()=>{
 const p=await open();try{
  const row=p.document.querySelector('.alone-row'); assert.ok(row,p.rows().join(','));
  assert.match(row.textContent,/Alpha EN/); assert.equal(row.closest('.day').dataset.date,'2026-10-28');
  assert.equal(row.hasAttribute('data-watch-time'),false);assert.equal(row.hasAttribute('data-fade-at'),false);
  assert.equal(row.querySelector('.move'),null);assert.ok(row.querySelector('.links a'));
  assert.equal(row.closest('.day').classList.contains('empty'),false);
 }finally{p.close();}
});
test('without a sheet day the personal entry uses its release day, not the group clock',async()=>{
 const p=await openPage({sheets:{csv:{111:csv.replace('Mi.,20:00,Allein',',20:00,Allein'),222:csv}},storage:{mode:'solo',soloPerson:'MaRyo',range:'week'}});
 try{const row=p.document.querySelector('.alone-row');assert.ok(row);assert.equal(row.closest('.day').dataset.date,'2026-10-28');assert.equal(row.hasAttribute('data-watch-time'),false);}finally{p.close();}
});
test('group snapshot excludes private entries and retains the other viewer’s scheduled show',async()=>{
 const p=await open();try{
  const rows=p.run('render(...lastWeekRender,true).flatMap(d=>d.rows)');
  assert.equal(rows.some(r=>r.slot?.alone),false);
  const alpha=rows.find(r=>r.show?.english==='Alpha EN');assert.ok(alpha);
  assert.deepEqual(Array.from(alpha.who),['Belly']);
  await p.click(p.$('modeGroup'));assert.equal(p.document.querySelector('.alone-plan'),null);
 }finally{p.close();}
});
test('personal entries consume no free slot and are unaffected by delays',async()=>{
 const p=await open();try{
  const result=p.run(`(()=>{const day={date:new Date('2026-10-28T12:00:00'),rows:[{show:{romaji:'personal'},slot:{alone:true,time:''},when:new Date()},{show:{romaji:'group'},slot:{time:''},when:new Date()}]}; assignWatchTimes(day); delays=[{day:'2026-10-28',show:'@19:00',minutes:30}];applyDelays(day);return day.rows.map(r=>({name:r.show.romaji,at:r.watchAt,delay:r.delay}));})()`);
  const personal=result.find(r=>r.name==='personal'),group=result.find(r=>r.name==='group');
  assert.equal(personal.at,undefined);assert.equal(personal.delay,undefined);
  assert.equal(new Date(group.at).getHours(),19);assert.equal(new Date(group.at).getMinutes(),30);
 }finally{p.close();}
});
test('hidden entries are excluded and Allein matching tolerates case and whitespace',async()=>{
 const p=await open();try{
  const result=p.run(`alonePicks({shows:[{tag:'Fr.',time:'21:00',votes:{Rei:' ALLEIN '}},{hidden:true,votes:{Rei:'Allein'}},{votes:{Rei:'Nein'}}]},'Rei')`);
  assert.equal(result.size,1);assert.equal([...result.values()][0].time,'');
 }finally{p.close();}
});
