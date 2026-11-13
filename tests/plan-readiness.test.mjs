import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('Plan-Check shows an absence pause and opens the existing move editor', async t => {
  const p = await openPage({
    storage: { movesKey: 'fixture-only' },
    movesFile: { moves: [], absent: [{ day: '2026-10-28', people: ['MaRyo'] }] }
  });
  t.after(() => p.close());
  await p.click(p.$('planReadinessButton'), 650);
  assert.equal(p.$('planReadinessDlg').open, true);
  const issue = [...p.$('planReadinessList').children].find(row => /Alpha EN.*Zu wenige Zuschauer/.test(row.textContent));
  assert.ok(issue, p.$('planReadinessList').textContent);
  await p.click(issue.querySelector('button'), 550);
  assert.equal(p.$('moveDlg').open, true);
  assert.equal(p.$('moveName').textContent, 'Alpha EN');
});
test('Plan-Check lists an aired show without a watch day', async t => {
  const csv = [
    'Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly',
    'Show Alpha,Alpha EN,C,,,Ja,Ja'
  ].join('\n');
  const p = await openPage({ sheets: { csv: { 111: csv, 222: csv } } });
  t.after(() => p.close());
  await p.click(p.$('planReadinessButton'), 650);
  assert.match(p.$('planReadinessList').textContent, /Alpha EN.*Kein Guck-Tag eingetragen/);
});
