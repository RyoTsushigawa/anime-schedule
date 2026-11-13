import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('Plan changes keep a baseline until acknowledged', async t => {
  const fail = new Set();
  const p = await openPage({ fail, config: { sheetsKey: 'fixture-only' } });
  t.after(() => p.close());
  const open = () => p.click(p.$('scheduleInboxButton'), 500);
  await open();
  assert.match(p.$('scheduleInboxStatus').textContent, /Erster Vergleichspunkt/);
  p.$('scheduleInboxDlg').close();
  fail.add('sheets');
  await open();
  assert.match(p.$("scheduleInboxStatus").textContent, /letzte Vergleichspunkt bleibt erhalten/);
  p.$("scheduleInboxDlg").close();
  fail.delete('sheets');
  p.run("moves.push({show: norm('Show Alpha'), tag: 'Mi.', time: '22:00'})");
  await open();
  assert.match(p.$('scheduleInboxList').textContent, /Alpha EN · Verschoben.*22:00/);
  p.$('scheduleInboxDlg').close();
  await open();
  assert.match(p.$('scheduleInboxList').textContent, /Verschoben/);
  await p.click(p.$('scheduleInboxRead'));
  p.$('scheduleInboxDlg').close();
  await open();
  assert.match(p.$('scheduleInboxStatus').textContent, /Keine Änderungen/);
});