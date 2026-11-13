import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U45: "Falschen Link melden" in the day menu sends the chosen show, link and suggestion to the votes helper
test('the report dialog sends one report with the chosen link and the suggestion', async () => {
  const p = await openPage({ config: { previewVotesUrl: 'https://votes.test' } });
  try {
    const sent = [], fetch0 = p.window.fetch;
    p.window.fetch = async (url, options) => String(url).startsWith('https://votes.test') ? (sent.push({ url, body: JSON.parse(options.body) }), { ok: true, status: 200, json: async () => ({ ok: true }) }) : fetch0(url, options);
    const button = p.$('list').querySelector('[data-link-report]');
    assert.ok(button, 'in the day menu');
    await p.click(button.closest('.day-more').querySelector('[data-day-more]'));
    await p.click(button);
    assert.equal(p.$('linkReportDlg').open, true);
    assert.ok(p.$('linkReportLink').options.length >= 1);
    p.$('linkReportSuggestion').value = 'ftp://nope';
    await p.click(p.$('linkReportSend'));
    assert.match(p.$('linkReportStatus').textContent, /https/);
    p.$('linkReportSuggestion').value = 'https://www.crunchyroll.com/series/right';
    p.$('linkReportNote').value = 'falsche Staffel';
    await p.click(p.$('linkReportSend'), 300);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://votes.test/reports');
    assert.match(sent[0].body.url, /^https:\/\//);
    assert.equal(sent[0].body.suggestion, 'https://www.crunchyroll.com/series/right');
    assert.equal(sent[0].body.note, 'falsche Staffel');
    assert.match(p.$('linkReportStatus').textContent, /Gemeldet/);
  } finally { p.close(); }
});
