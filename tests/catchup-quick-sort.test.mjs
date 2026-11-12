import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('quick Catch-up sort is optional and does not replace the old default', () => {
  assert.match(html, /data-set="sort" data-value="quick"[^>]*>Schnell<\/button>/);
  assert.match(app, /sort: 'oldest'/);
  assert.match(app, /sort: v => \['oldest', 'behind', 'quick', 'next', 'az'\]/);
});

test('quick sort puts fewer unwatched episodes first, then older releases', () => {
  const match = app.match(/: choices\.sort === 'quick' \? (\(a, b\) => [^\n]+)/);
  assert.ok(match, 'quick comparator exists');
  const compare = new Function('return ' + match[1])();
  const entries = [
    {first:1,out:6,since:1},
    {first:1,out:1,since:9},
    {first:2,out:3,since:5},
    {first:1,out:1,since:3},
  ];
  assert.deepEqual(entries.sort(compare).map(r => [r.first,r.out,r.since]), [
    [1,1,3],[1,1,9],[2,3,5],[1,6,1]
  ]);
});

test('quick sort also works for Non-seasonal while preserving other choices', () => {
  assert.match(app, /ownPace\.sort\(choices\.sort === 'behind'/);
  assert.match(app, /: choices\.sort === 'quick' \? \(a, b\) => \(a\.out - a\.first\) - \(b\.out - b\.first\) \|\| byTitle\(a, b\)/);
});
