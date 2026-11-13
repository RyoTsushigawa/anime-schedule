import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('schedule diagnostics preview and copy only the selected show data', async t => {
  const p = await openPage();
  t.after(() => p.close());
  const button = p.$('list').querySelector('[data-plan-diagnostic]');
  assert.ok(button);
  const menu = button.closest('.day-more');
  await p.click(menu.querySelector('[data-day-more]'));
  await p.click(button);
  assert.equal(p.$('planDiagnosticDlg').open, true);
  const text = p.$('planDiagnosticText');
  assert.match(text.value, /AniList-ID: [0-9]+/);
  assert.match(text.value, /Quelle im Plan: AniList/);
  assert.doesNotMatch(text.value, /MaRyo|Belly|fixture-only/);
  let copied;
  Object.defineProperty(p.window.navigator, 'clipboard', {
    configurable: true, value: { writeText: async value => { copied = value; } }
  });
  await p.click(p.$('planDiagnosticCopy'));
  assert.equal(copied, text.value);
  assert.match(p.$('planDiagnosticStatus').textContent, /kopiert/);
  p.window.navigator.clipboard.writeText = async () => { throw Error('Denied'); };
  await p.click(p.$('planDiagnosticCopy'));
  assert.equal(text.selectionEnd, text.value.length);
  assert.match(p.$('planDiagnosticStatus').textContent, /manuell kopieren/);
});