import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// N55 Link-Meldungen: the owner's queue of wrong-link reports; a taken fix lands in link-fixes.json and the week's link

const REPORTS = [
  { id: 'aaaaaa1', at: '2026-10-27T10:00:00Z', status: 'pending', anilistId: 1, title: 'Alpha EN', service: 'Crunchyroll', url: 'https://www.crunchyroll.com/alpha', suggestion: 'https://www.crunchyroll.com/series/alpha-right' },
  { id: 'aaaaaa2', at: '2026-10-27T09:00:00Z', status: 'pending', anilistId: 1, title: 'Alpha EN', service: 'Crunchyroll', url: 'https://www.crunchyroll.com/alpha' },
  { id: 'bbbbbb1', at: '2026-10-26T09:00:00Z', status: 'pending', anilistId: 2, title: 'Beta EN', service: 'Crunchyroll', url: 'https://www.crunchyroll.com/beta', suggestion: 'https://evil.example/beta' },
];
function votesHelper(p) {
  const resolved = [], fetch0 = p.window.fetch;
  p.window.fetch = async (url, options = {}) => {
    url = String(url);
    if (!url.startsWith('https://votes.test')) return fetch0(url, options);
    if (url.includes('/reports/resolve')) { resolved.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    return { ok: true, status: 200, json: async () => ({ reports: REPORTS }) };
  };
  return resolved;
}

test('the queue is only for the owner and checks a proposed link against the service', async () => {
  const guest = await openPage({ config: { previewVotesUrl: 'https://votes.test' } });
  try { assert.equal(guest.$('repairButton').hidden, true); } finally { guest.close(); }
  const p = await openPage({ config: { previewVotesUrl: 'https://votes.test' }, storage: { movesKey: 'k' } });
  try {
    votesHelper(p);
    assert.equal(p.$('repairButton').hidden, false);
    await p.click(p.$('repairButton'), 200);
    const items = [...p.$('repairList').querySelectorAll('[data-report]')];
    assert.equal(items.length, 3);
    assert.match(items[0].textContent, /Passt zu Crunchyroll/);
    assert.match(items[2].textContent, /Andere Seite als Crunchyroll: evil\.example/);
    assert.equal(items[1].querySelector('[data-repair="take"]'), null, 'nothing to take without a suggestion');
  } finally { p.close(); }
});

test('Übernehmen saves the fix, closes both reports about that link, and the week shows the new link', async () => {
  const p = await openPage({ config: { previewVotesUrl: 'https://votes.test' }, storage: { movesKey: 'k' } });
  try {
    const resolved = votesHelper(p);
    await p.click(p.$('repairButton'), 200);
    await p.click(p.$('repairList').querySelector('[data-report="aaaaaa1"] [data-repair="take"]'), 300);
    const saved = p.state.linkFixesSaved;
    assert.equal(saved.fixes.length, 1);
    assert.deepEqual({ ...saved.fixes[0], at: undefined }, { anilistId: 1, title: 'Alpha EN', service: 'Crunchyroll', from: 'https://www.crunchyroll.com/alpha', to: 'https://www.crunchyroll.com/series/alpha-right', report: 'aaaaaa1', at: undefined });
    assert.deepEqual(resolved.map(r => [r.id, r.status]), [['aaaaaa1', 'fixed'], ['aaaaaa2', 'fixed']]);
    assert.equal(p.$('repairList').querySelectorAll('[data-report]').length, 1);
    assert.ok(p.$('list').querySelector('a[href="https://www.crunchyroll.com/series/alpha-right"]'), 'the week uses the fixed link');
    assert.equal(p.$('list').querySelector('a[href="https://www.crunchyroll.com/alpha"]'), null);
  } finally { p.close(); }
});

test('a saved fix applies for everyone on load; Ablehnen closes only that report', async () => {
  const p = await openPage({ config: { previewVotesUrl: 'https://votes.test' }, storage: { movesKey: 'k' },
    linkFixes: { fixes: [{ anilistId: 1, service: 'Crunchyroll', from: 'https://www.crunchyroll.com/alpha', to: 'https://www.crunchyroll.com/series/fixed' }] } });
  try {
    assert.ok(p.$('list').querySelector('a[href="https://www.crunchyroll.com/series/fixed"]'));
    const resolved = votesHelper(p);
    await p.click(p.$('repairButton'), 200);
    await p.click(p.$('repairList').querySelector('[data-report="bbbbbb1"] [data-repair="rejected"]'), 200);
    assert.deepEqual(resolved.map(r => [r.id, r.status]), [['bbbbbb1', 'rejected']]);
    assert.equal(p.state.linkFixesSaved, undefined, 'nothing written for a rejection');
  } finally { p.close(); }
});
