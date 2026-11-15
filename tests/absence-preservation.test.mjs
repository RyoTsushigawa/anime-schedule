import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const moves = fs.readFileSync(new URL('../app-moves.js', import.meta.url), 'utf8');
const absence = fs.readFileSync(new URL('../app-absence.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(moves.slice(moves.indexOf('function mergeAwayState('), moves.indexOf('function saveMoves(')), ctx);
vm.runInContext(absence.slice(absence.indexOf('function withAway('), absence.indexOf('// What `days`')), ctx);
const copy = x => JSON.parse(JSON.stringify(x));
const row = (person, day = '2026-12-01', reason = '') => ({ day, people: [person], ...(reason && {reason}) });
const state = (days = [], rules = []) => ({days, rules});
const merge = (remote, base, next) => copy(ctx.mergeAwayState(remote, {...next, base}));
test('new absence preserves an entry added by another browser on the same day', () => {
  const result = merge({absent:[row('Belly')]}, state(), state([row('Rei')]));
  assert.deepEqual(result.days, [row('Belly'), row('Rei')]);
});
test('new absence preserves remote entries on other dates and weekly rules', () => {
  const rule = {id:'other',person:'Belly',weekdays:[0],start:'2026-12-01'};
  const result = merge({absent:[row('Belly','2026-12-02')],absentRules:[rule]}, state(), state([row('Rei')]));
  assert.deepEqual(result.days,[row('Rei'),row('Belly','2026-12-02')]);
  assert.deepEqual(result.rules,[rule]);
});
test('removing one person preserves others in the same grouped entry', () => {
  const shared = {day:'2026-12-01',people:['Belly','Rei']};
  assert.deepEqual(merge({absent:[shared,row('Terra')]},state([shared]),state([row('Rei')])).days,[row('Rei'),row('Terra')]);
});
test('simultaneous changes to the same person are rejected instead of silently overwritten', () => {
  assert.throws(() => merge({absent:[row('Rei','2026-12-01','new')]},state([row('Rei')]),state([row('Rei','2026-12-01','mine')])), /inzwischen geändert/);
});
test('a retry of an already saved operation is safe', () => {
  assert.deepEqual(merge({absent:[row('Rei')]},state(),state([row('Rei')])).days,[row('Rei')]);
});
test('weekly additions and removals preserve unrelated remote rules', () => {
  const a = {id:'a',person:'Rei'}, b = {id:'b',person:'Belly'}, c = {id:'c',person:'Terra'};
  assert.deepEqual(merge({absentRules:[a,b]},state([], [a]),state([], [c])).rules,[b,c]);
});
test('adding someone leaves existing reasons and timed absences alone', () => {
  const old = [row('Belly','2026-12-01','Work'), {...row('Terra'),from:'21:00'}];
  assert.deepEqual(copy(ctx.withAway(old,['2026-12-01'],['Rei'],'day',null,[])),[...old,row('Rei')]);
});
test('calendar save only removes explicitly deselected people', () => {
  const source = absence.slice(absence.indexOf("$('awaySave').onclick"), absence.indexOf("$('repPeople').addEventListener"));
  const elements = {
    awayPeople:{querySelectorAll:()=>[
      {dataset:{away:'Belly',awayOriginal:'false'},getAttribute:()=> 'false'},
      {dataset:{away:'Rei',awayOriginal:'false'},getAttribute:()=> 'true'}
    ]},awayReason:{value:''},awayMsg:{textContent:''}
  };
  let saved;
  const sandbox = vm.createContext({$:id=>elements[id] ||= {},selectedDays:()=>['2026-12-01'],awayCal:{mode:'day'},
    absencesForDay:()=>[row('Belly')],withAway:ctx.withAway,splitAway:x=>x,storeAway:x=>saved=copy(x),cleanReason:x=>x,hasLink:()=>false});
  vm.runInContext(source,sandbox);
  elements.awaySave.onclick();
  assert.deepEqual(saved,[row('Belly'),row('Rei')]);
});
test('successful save keeps service response instead of stale requested snapshot', async () => {
  const source = absence.slice(absence.indexOf('async function storeAway('),absence.indexOf("$('awayButton').onclick"));
  const sandbox=vm.createContext({$:()=>({textContent:'',querySelectorAll:()=>[]}),awayCal:{tab:'calendar'},
    saveAway:async()=>vm.runInContext("absentDays = ['remote', 'mine']",sandbox),drawAway:()=>{},lastWeekRender:null});
  vm.runInContext("let absentDays = [];"+source,sandbox);
  await sandbox.storeAway({days:['mine'],rules:[]},[],'Saved');
  assert.deepEqual(copy(vm.runInContext('absentDays',sandbox)),['remote','mine']);
});
