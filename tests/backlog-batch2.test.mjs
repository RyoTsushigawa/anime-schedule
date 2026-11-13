import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Backlog batch 2: Discord "Kurz" (U34), "Nur Text" layout (U32), Datenstand (N39)

test('U34: the Discord dialog has a short format with time, title and episode, and remembers it', async () => {
  const p = await openPage({ storage: { movesKey: 'fixture-only' } });
  try {
    await p.click(p.$('viewWeek'));
    await p.click(p.$('list').querySelector('[data-day-discord]'));
    assert.match(p.$('discordText').value, /stehen an/);
    await p.click(p.$('discordFormat').querySelector('[data-format="short"]'));
    assert.match(p.$('discordText').value, /^Mi 28\. Okt\.\n\d\d:\d\d .+ · Folge \d+/);
    assert.doesNotMatch(p.$('discordText').value, /Passt\?/);
    assert.equal(p.window.localStorage.getItem('discordFormat'), 'short');
  } finally { p.close(); }
});

test('U32: "Nur Text" is a third layout and hides covers via a body class', async () => {
  const p = await openPage();
  try {
    const b = p.document.querySelector('[data-set="density"][data-value="text"]');
    assert.ok(b);
    await p.click(b);
    assert.ok(p.document.body.classList.contains('text-only'));
    assert.ok(p.document.body.classList.contains('dense'));
    assert.equal(p.window.localStorage.getItem('density'), 'text');
  } finally { p.close(); }
});

test('N39: Datenstand lists every source, with a saved copy flagged', async () => {
  const p = await openPage({ fail: new Set(['sheets']) });
  try {
    await p.click(p.$('settingsButton'));
    await p.click(p.$('dataButton'), 300);
    const rows = [...p.$('dataList').querySelectorAll('li')].map(li => li.textContent);
    assert.equal(rows.length, 6);
    assert.match(rows[0], /Guckplan/);
    assert.match(rows.join('\n'), /Pausen & Stream-Status/);
    assert.match(rows.join('\n'), /Trailer-Listen/);
  } finally { p.close(); }
});

test('N85: text size and contrast are settings that stay, without reloading the plan', async () => {
  const p = await openPage();
  try {
    const root = p.document.documentElement, calls = p.calls.length;
    await p.click(p.document.querySelector('[data-set="textsize"][data-value="xl"]'));
    await p.click(p.document.querySelector('[data-set="contrast"][data-value="high"]'));
    assert.equal(root.dataset.textsize, 'xl');
    assert.equal(root.dataset.contrast, 'high');
    assert.equal(p.window.localStorage.getItem('textsize'), 'xl');
    assert.equal(p.calls.length, calls, 'no new requests');
    await p.click(p.document.querySelector('[data-set="textsize"][data-value="normal"]'));
    assert.equal(root.dataset.textsize, undefined);
  } finally { p.close(); }
});
