import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, NOW } from './harness.mjs';
// N63 Discord-Zustellung: failed daily posts are shown to the plan owner, with one retry and no double post

const today = new Date(NOW).toISOString().slice(0, 10); // the harness clock: 28 Oct 2026, 12:00 German time
const run = (id, title, created, conclusion, extra = {}) => ({ id, display_title: title, event: 'repository_dispatch', created_at: created, status: 'completed', conclusion, run_attempt: 1, html_url: 'https://github.com/x/actions/runs/' + id, ...extra });
const encode = o => btoa(JSON.stringify(o));

async function owner(runs, post) {
  const p = await openPage({ storage: { movesKey: 'k' } });
  const calls = [], fetch0 = p.window.fetch;
  p.window.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('/actions/workflows/discord-daily.yml/runs')) return { ok: true, status: 200, json: async () => ({ workflow_runs: runs }) };
    if (url.includes('/contents/daily-post.json')) return { ok: true, status: 200, json: async () => ({ content: encode(post || {}) }) };
    if (url.includes('/rerun') || url.endsWith('/dispatches')) { calls.push({ url, body: options.body && JSON.parse(options.body) }); return { ok: true, status: 201, json: async () => ({}) }; }
    return fetch0(url, options);
  };
  await p.click(p.$('deliveryButton'), 300);
  return { p, calls };
}

test('only the owner sees it; a failed post today gets one retry, an older or retried one none', async () => {
  const guest = await openPage();
  try { assert.equal(guest.$('deliveryButton').hidden, true); } finally { guest.close(); }
  const { p, calls } = await owner([
    run(3, 'Tagespost', `${today}T07:50:00Z`, 'failure'),
    run(2, 'Tagespost', '2026-10-27T07:50:00Z', 'failure'),
    run(1, 'Aktualisierung', '2026-10-26T12:00:00Z', 'success', { event: 'push' }),
    run(9, 'Probe', `${today}T10:00:00Z`, 'failure'),
  ], { date: '2026-10-27', id: '1' });
  try {
    const items = [...p.$('deliveryList').querySelectorAll('li')];
    assert.equal(items.length, 3, 'rehearsals are left out');
    assert.match(p.$('deliveryToday').textContent, /noch nicht raus/);
    assert.equal(p.$('deliveryList').querySelectorAll('[data-delivery-retry]').length, 1);
    assert.equal(p.$('deliverySend').hidden, true, 'the retry covers it');
    await p.click(p.$('deliveryList').querySelector('[data-delivery-retry="3"]'), 300);
    assert.deepEqual(calls.map(c => c.url.split('/actions/')[1]), ['runs/3/rerun']);
  } finally { p.close(); }
});

test('no retry once the run was retried or the post went out anyway; "Jetzt senden" only when nothing ran', async () => {
  let { p } = await owner([run(3, 'Tagespost', `${today}T07:50:00Z`, 'failure', { run_attempt: 2 })], { date: '2026-10-27', id: '1' });
  try { assert.equal(p.$('deliveryList').querySelectorAll('[data-delivery-retry]').length, 0); assert.equal(p.$('deliverySend').hidden, true); } finally { p.close(); }
  ({ p } = await owner([run(3, 'Tagespost', `${today}T07:50:00Z`, 'failure')], { date: today, id: '5' }));
  try { assert.equal(p.$('deliveryList').querySelectorAll('[data-delivery-retry]').length, 0); assert.match(p.$('deliveryToday').textContent, /ist raus/); } finally { p.close(); }
  let calls;
  ({ p, calls } = await owner([run(2, 'Tagespost', '2026-10-27T07:50:00Z', 'success')], { date: '2026-10-27', id: '1' }));
  try {
    assert.equal(p.$('deliverySend').hidden, false);
    assert.equal(p.$('deliveryAlert').textContent, '⚠');
    await p.click(p.$('deliverySend'), 300);
    assert.deepEqual(calls, [{ url: 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/dispatches', body: { event_type: 'discord-daily', client_payload: { retry: true } } }]);
  } finally { p.close(); }
});

test('runs from before the workflow named them are sorted by trigger and time', async () => {
  const { p } = await owner([
    run(4, 'Daily Discord schedule', `${today}T07:50:00Z`, 'success'),
    run(5, 'Daily Discord schedule', `${today}T03:00:00Z`, 'success'),
    run(6, 'Daily Discord schedule', `${today}T09:00:00Z`, 'failure', { event: 'push' }),
  ], { date: today, id: '9' });
  try {
    const text = [...p.$('deliveryList').querySelectorAll('li b')].map(b => b.textContent);
    assert.deepEqual(text, ['✓ Tagespost', '✕ Aktualisierung']);
    assert.equal(p.$('deliveryList').querySelectorAll('[data-delivery-retry]').length, 1, 'a failed edit can be retried');
  } finally { p.close(); }
});
