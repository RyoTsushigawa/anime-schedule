import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPage } from './harness.mjs';

test('"Drop-Button immer sichtbar" keeps the drop button visible, is remembered and travels with exported settings', async t => {
  const p = await openPage();
  t.after(() => p.close());
  assert.equal(p.document.body.classList.contains('drop-always'), false);
  p.$('dropAlways').checked = true;
  p.$('dropAlways').dispatchEvent(new p.window.Event('change'));
  assert.equal(p.document.body.classList.contains('drop-always'), true);
  assert.equal(p.window.localStorage.getItem('dropAlways'), '1');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /body\.drop-always \.row \.drop \{ opacity: 1;/);
  // one choice in the settings: off / on hover / always, over the two stored switches
  const modes = () => [...p.document.querySelectorAll('[data-drop-mode]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.dropMode);
  p.$('dropButtons').checked = true; p.document.querySelector('[data-drop-mode="hover"]').click();
  assert.deepEqual(modes(), ['hover']);
  p.document.querySelector('[data-drop-mode="off"]').click();
  assert.equal(p.window.localStorage.getItem('dropButtons'), '0');
  assert.equal(p.document.body.classList.contains('no-drop'), true);
  p.document.querySelector('[data-drop-mode="always"]').click();
  assert.deepEqual(modes(), ['always']);
  assert.equal(p.window.localStorage.getItem('dropButtons'), '1');
  assert.equal(p.window.localStorage.getItem('dropAlways'), '1');
  assert.match(readFileSync(new URL('../app-accounts.js', import.meta.url), 'utf8'), /'dropButtons', 'dropAlways'/);
});
test('the setting is restored on the next visit', async t => {
  const p = await openPage({ storage: { dropAlways: '1' } });
  t.after(() => p.close());
  assert.equal(p.$('dropAlways').checked, true);
  assert.equal(p.document.body.classList.contains('drop-always'), true);
});
