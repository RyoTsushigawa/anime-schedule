import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SOURCE } from './app-source.mjs';
import { openPage } from './harness.mjs';

test('Belly-sized cancellation shows only confirmed writes and unattempted remaining series', () => {
  const start = APP_SOURCE.indexOf('function bulkSaveSummary(');
  const end = APP_SOURCE.indexOf('function remember(', start);
  assert.ok(start >= 0 && end > start);
  const saved = [], notices = [];
  const {bulkSaveSummary,finishBulkSave} = new Function('remember','notice', APP_SOURCE.slice(start,end) +
    '\nreturn {bulkSaveSummary,finishBulkSave};')(
      (records,text)=>saved.push({records,text}), text=>notices.push(text));
  const records = Array.from({length:7},(_,i)=>({mediaId:1000+i}));
  const status = bulkSaveSummary(7,40,'Serien','',true);
  assert.match(status,/7 von 40 Serien bestätigt gespeichert/);
  assert.match(status,/33 noch nicht versucht/);
  assert.match(status,/Auf Wunsch gestoppt/);
  assert.doesNotMatch(status,/nicht bestätigt/);
  finishBulkSave(records,40,'Serien','',true);
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].records,records);
  assert.equal(saved[0].text,status);
  assert.equal(notices.length,0);
});

test('a failed request stays unconfirmed even if a stop was requested', () => {
  const start=APP_SOURCE.indexOf('function bulkSaveSummary('), end=APP_SOURCE.indexOf('function remember(',start);
  const {bulkSaveSummary}=new Function(APP_SOURCE.slice(start,end)+'\nreturn {bulkSaveSummary};')();
  const text=bulkSaveSummary(7,40,'Serien','Rate limit',true);
  assert.match(text,/1 Änderung nicht bestätigt/);
  assert.match(text,/32 noch nicht versucht/);
  assert.doesNotMatch(text,/Auf Wunsch gestoppt/);
});

test('Stoppen remains visible during long saves and closes cleanly afterwards', async () => {
  const p = await openPage();
  try {
    p.run('beginBulkSave(40)');
    assert.equal(p.$('noticeStop').hidden,false);
    assert.equal(p.$('noticeStop').disabled,false);
    assert.match(p.$('noticeText').textContent,/0\/40/);
    p.$('noticeStop').click();
    assert.equal(p.$('noticeStop').disabled,true);
    assert.match(p.$('noticeText').textContent,/nach der laufenden Serienänderung/);
    assert.equal(p.run('bulkStopRequested'),true);
    assert.equal(p.run('endBulkSave()'),true);
    p.run("notice('7 von 40 gespeichert', true)");
    assert.equal(p.$('noticeStop').hidden,true);
    assert.equal(p.$('noticeUndo').hidden,false);
  } finally { p.close(); }
});

test('all three bulk loops stop before starting the next series', () => {
  const action=APP_SOURCE.slice(APP_SOURCE.indexOf("const b = e.target.closest('#markAll');"),
    APP_SOURCE.indexOf('function dueAt('));
  assert.equal((action.match(/if \(bulkStopRequested\) break;/g)||[]).length,3);
  assert.equal((action.match(/const cancelled = endBulkSave\(\);/g)||[]).length,3);
  assert.equal((action.match(/beginBulkSave\(/g)||[]).length,3);
});
