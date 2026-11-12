import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf('function bulkSaveSummary(');
const end = source.indexOf('function remember(', start);
assert.ok(start > 0 && end > start, 'bulk outcome helpers exist');
const helpers = source.slice(start, end);
const create = (remember, notice) =>
  new Function('remember', 'notice', helpers + '\nreturn {bulkSaveSummary,finishBulkSave};')(remember, notice);

test('Belly cleanup: 40 series, 100 open episodes, request 8 fails after 7 confirmed saves', () => {
  const saved = [], notices = [];
  const {bulkSaveSummary, finishBulkSave} = create((records, text) => saved.push({records,text}), text => notices.push(text));
  const progress = Array.from({length:40}, (_,i) => ({mediaId:1000+i, open:i%2===0?2:3}));
  assert.equal(progress.reduce((sum, r) => sum+r.open, 0), 100);
  const confirmed = progress.slice(0,7).map(row => ({mediaId:row.mediaId, after:{progress:row.open}}));
  const text = bulkSaveSummary(confirmed.length, progress.length, 'Serien', 'Rate limit');
  assert.match(text,/7 von 40 Serien bestätigt gespeichert/);
  assert.match(text,/1 Änderung nicht bestätigt/);
  assert.match(text,/32 noch nicht versucht/);
  assert.doesNotMatch(text,/40.*als gesehen markiert/);
  finishBulkSave(confirmed,40,'Serien','Rate limit');
  assert.equal(saved.length,1,'only the successful records go to Undo');
  assert.deepEqual(saved[0].records,confirmed);
  assert.equal(saved[0].text,text);
  assert.equal(notices.length,0,'do not replace Undo notice with a second error toast');
});

test('when the first save fails, show uncertainty without offering an empty Undo', () => {
  const saved = [], notices = [];
  const {finishBulkSave} = create((records,text)=>saved.push({records,text}), text=>notices.push(text));
  finishBulkSave([],40,'Serien','Zeitüberschreitung');
  assert.equal(saved.length,0);
  assert.equal(notices.length,1);
  assert.match(notices[0],/0 von 40 Serien bestätigt gespeichert/);
  assert.match(notices[0],/39 noch nicht versucht/);
});

test('all confirmed writes retain Undo and do not claim any failure', () => {
  const saved = [], notices = [];
  const {finishBulkSave} = create((records,text)=>saved.push({records,text}), text=>notices.push(text));
  const records = Array.from({length:40}, (_,i)=>({mediaId:1000+i}));
  finishBulkSave(records,40,'Serien');
  assert.equal(saved.length,1);
  assert.equal(saved[0].records.length,40);
  assert.match(saved[0].text,/40 von 40 Serien bestätigt gespeichert/);
  assert.doesNotMatch(saved[0].text,/nicht bestätigt|nicht versucht/);
  assert.equal(notices.length,0);
});

test('global, season and day bulk actions share the same outcome handling', () => {
  assert.equal((source.match(/finishBulkSave\(records, /g)||[]).length,4); // helper and three actions
  const bulk = source.slice(source.indexOf("const b = e.target.closest('#markAll');"),source.indexOf("// \"Alle gesehen\" for one catch-up season."));
  assert.doesNotMatch(bulk,/notice\(\x60\$\{records\.length\} von/);
  assert.match(bulk,/finishBulkSave\(records, targets\.length, 'Serien', stopped\)/);
  assert.match(source,/finishBulkSave\(records, targets\.length, 'Serien in ' \+ catchupSeasonLabel\(season\), stopped\)/);
  assert.match(source,/finishBulkSave\(records, all\.length, 'heutigen Serien', stopped\)/);
});
