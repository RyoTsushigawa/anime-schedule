import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../tools/discord-daily.mjs', import.meta.url), 'utf8');
const guard = source.slice(source.indexOf('const posted = readRecordedPost();'), source.indexOf('if (!dryRun && !webhook)'));
const run = new Function('post', 'update', 'dryRun', `
  const todayIso = '2026-11-13';
  const readRecordedPost = () => post;
  const console = { log() {} };
  const process = { exit: () => { throw new Error('skip'); } };
  ${guard}
  return true;
`);
const today = { date: '2026-11-13', id: '123' };

test('a recorded daily post blocks a repeat send and allows edit and preview', () => {
  assert.throws(() => run(today, false, false), /skip/);
  assert.equal(run(today, true, false), true);
  assert.equal(run(today, false, true), true);
  assert.equal(run({ ...today, date: '2026-11-12' }, false, false), true);
  assert.equal(run(null, false, false), true);
  assert.throws(() => run(null, true, false), /skip/);
});