import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, sec, MEDIA, NOW } from './harness.mjs';

// the week of Wed 28 Oct 2026: Alpha (Wed), Beta (Sat), Gamma (Thu 21:00) in the Guckplan
const streams = gamma => ({
  generated: new Date(NOW).toISOString(), byAnilist: {}, release: {},
  status: {
    1: { titles: ['Show Alpha', 'Alpha EN'], next: { episode: 5, at: sec(2026, 10, 4, 14) } },
    2: { titles: ['Show Beta', 'Beta EN'], next: { episode: 3, at: sec(2026, 10, 6, 16) } },
    3: { titles: ['Show Gamma', 'Gamma EN'], ...gamma },
  },
});
const warnings = p => p.$('airingWarnings')?.textContent || '';
const gammaShown = p => /Gamma EN/.test(p.$('list').textContent);

test('a show whose last episode aired last week is left out quietly, before AniList says FINISHED', async t => {
  const p = await openPage({ streams: streams({ next: null, airings: [{ episode: 12, at: sec(2026, 9, 22, 20) }], airingStatus: { status: 'RELEASING', episodes: 12 } }) });
  t.after(() => p.close());
  await p.settle(600);
  assert.equal(gammaShown(p), false, p.$('list').textContent);
  assert.doesNotMatch(warnings(p), /unbestätigt/);
  await p.click(p.$('planReadinessButton'), 650);
  assert.doesNotMatch(p.$('planReadinessList').textContent, /Gamma/);
});

test('nothing more announced after the last episode (end of a cour, episode count unknown): no warning either', async t => {
  const p = await openPage({ media: { 3: { episodes: null } }, streams: streams({ next: null, airings: [{ episode: 8, at: sec(2026, 9, 22, 20) }] }) });
  t.after(() => p.close());
  await p.settle(600);
  assert.equal(gammaShown(p), false);
  assert.doesNotMatch(warnings(p), /unbestätigt/);
});

test('a show with nothing known at all still gets the warning', async t => {
  const p = await openPage({ streams: streams({ next: null, airings: [] }) });
  t.after(() => p.close());
  await p.settle(600);
  assert.match(warnings(p), /1 unbestätigt/);
});

test('two episodes in one broadcast: one row, "Doppel-Premiere" and two slots; in the Discord message (x2)', async t => {
  const alpha = { ...MEDIA[1] };
  const p = await openPage({ airings: [
    { airingAt: sec(2026, 9, 28, 14), episode: 1, media: alpha }, { airingAt: sec(2026, 9, 28, 14), episode: 2, media: alpha },
    { airingAt: sec(2026, 9, 30, 16), episode: 2, media: MEDIA[2] }, { airingAt: sec(2026, 9, 21, 16), episode: 1, media: MEDIA[2] },
  ] });
  t.after(() => p.close());
  await p.settle(600);
  const row = [...p.$('list').querySelectorAll('.row')].find(r => /Alpha EN/.test(r.textContent));
  assert.match(row.textContent, /Folgen 1–2/);
  assert.match(row.textContent, /Doppel-Premiere/);
  const msg = p.run(`discordMessage(discordDay('2026-10-28'))`);
  assert.match(msg, /\(x2\)/);
});

test('episodes of 40 minutes or more count as long (two slots), like LiveChart\'s "Lang"', async t => {
  const alpha = { ...MEDIA[1], duration: 46 };
  const p = await openPage({ airings: [{ airingAt: sec(2026, 9, 28, 14), episode: 4, media: alpha }, { airingAt: sec(2026, 9, 30, 16), episode: 2, media: MEDIA[2] }] });
  t.after(() => p.close());
  await p.settle(600);
  const row = [...p.$('list').querySelectorAll('.row')].find(r => /Alpha EN/.test(r.textContent));
  assert.match(row.textContent, /Lang/);
});
