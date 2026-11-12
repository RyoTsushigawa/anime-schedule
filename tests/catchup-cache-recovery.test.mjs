import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Catch-up AniList cache recovers through the same title repair as fresh cache', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function anilistList(');
  const end = app.indexOf("$('refreshCatchup').onclick", start);
  assert.ok(start >= 0 && end > start);
  const list = app.slice(start, end);
  assert.match(list, /Array\.isArray\(saved\?\.entries\)/);
  assert.match(list, /if \(fresh \|\| !Array\.isArray\(saved\?\.entries\)\) throw e;/);
  assert.match(list, /setNote\(key, \x60\$\{unreachable\('AniList'\)\}/);
  assert.match(list, /return fixTitles\(saved\.entries\);/);
});

test('Catch-up local error messages disappear after successful recovery', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /extra = await localCatalog\(person\);\s*setNote\('catchup:local', null\)/);
  assert.match(app, /notesHtml\(\['list:' \+ user\.toLowerCase\(\), 'catchup:plan', 'catchup:missing', 'catchup:local'\]\)/);
});
