import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Catch-up refresh is scoped to the account, person and view that started it', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf("$('refreshCatchup').onclick = async () => {");
  const end = source.indexOf('async function anilistAsMe(', start);
  assert.ok(start >= 0 && end > start, 'refresh handler exists');
  const handler = source.slice(start, end);
  assert.match(handler, /friend = friendList\.value, account = auth, selectedView = view/);
  assert.match(handler, /auth === account && view === selectedView/);
  assert.match(handler, /listUser\(\) === user && friendList\.value === friend/);
  assert.match(handler, /await anilistList\(user, true, !!friend\);\s*if \(!stillSelected\(\)\) return;/);
  assert.match(handler, /await loadMe\(\);\s*if \(!stillSelected\(\)\) return;/);
  assert.match(handler, /if \(stillSelected\(\)\) notice\('Liste aktualisiert\.'\)/);
  assert.match(handler, /if \(stillSelected\(\)\) notice\('Liste konnte nicht aktualisiert werden:/);
});
