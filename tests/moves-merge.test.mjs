import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U: a save writes only this browser's own changes. Someone else's change in the meantime stays; the same entry
// changed by both is a conflict that is explained, never silently replaced. A small save status shows it all.

const mine = { show: 'alpha', title: 'Alpha EN', tag: 'Do.', time: '21:00', week: '' };
const theirs = { show: 'beta', title: 'Beta EN', tag: 'Fr.', time: '22:00', week: '' };

test('another person\'s change saved in the meantime is kept, not overwritten', async () => {
  const p = await openPage({ storage: { movesKey: 'k' }, movesFile: { moves: [] }, githubFile: { moves: [theirs] } });
  try {
    await p.run(`saveMoves([...moves, ${JSON.stringify(mine)}])`);
    await p.settle();
    const saved = p.state.movesSaved.moves.map(m => m.show).sort();
    assert.deepEqual(saved, ['alpha', 'beta']);
    assert.match(p.$('saveState').textContent, /Gespeichert/);
  } finally { p.close(); }
});

test('the same entry changed by someone else: explained, nothing overwritten, "Meine Fassung speichern" can still win', async () => {
  const before = { ...mine, tag: 'Mi.', time: '20:00' };
  const p = await openPage({ storage: { movesKey: 'k' }, movesFile: { moves: [before] }, githubFile: { moves: [{ ...before, tag: 'Fr.', time: '22:00' }] } });
  try {
    const error = await p.run(`saveMoves(moves.map(m => m.show === 'alpha' ? { ...m, tag: 'Sa.', time: '19:00' } : m)).then(() => null, e => e.message)`);
    assert.match(error, /„Alpha EN“ \(dauerhaft\) hat inzwischen jemand anders geändert: jetzt Fr 22:00, du wolltest Sa 19:00/);
    assert.equal(p.state.movesSaved, undefined, 'nothing written');
    assert.equal(p.run(`moves.find(m => m.show === 'alpha').tag`), 'Fr.', 'the page shows their version now');
    const box = p.$('saveState');
    assert.match(box.textContent, /jemand anders geändert/);
    const force = [...box.querySelectorAll('button')].find(b => b.textContent === 'Meine Fassung speichern');
    await p.click(force);
    await p.settle();
    assert.equal(p.state.movesSaved.moves.find(m => m.show === 'alpha').tag, 'Sa.');
  } finally { p.close(); }
});

test('both wanting the same is no conflict; a failed save offers "Erneut versuchen"', async () => {
  const p = await openPage({ storage: { movesKey: 'k' }, movesFile: { moves: [] }, githubFile: { moves: [mine] } });
  try {
    await p.run(`saveMoves([${JSON.stringify(mine)}])`);
    assert.deepEqual(p.state.movesSaved.moves.map(m => m.show), ['alpha']);
    // GitHub refuses the next write: the status keeps it with "Erneut versuchen", which then saves it
    p.run(`globalThis.__realFetch = fetch; fetch = (u, i) => i?.method === 'PUT' && !globalThis.__putOk ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : __realFetch(u, i)`);
    const error = await p.run(`saveMoves([${JSON.stringify({ ...mine, time: '21:30' })}]).then(() => null, e => e.message)`);
    assert.match(error, /GitHub antwortet 500/);
    const box = p.$('saveState');
    assert.match(box.textContent, /Nicht gespeichert: GitHub antwortet 500/);
    p.run('globalThis.__putOk = true');
    await p.click([...box.querySelectorAll('button')].find(b => b.textContent === 'Erneut versuchen'));
    await p.settle();
    assert.equal(p.state.movesSaved.moves[0].time, '21:30');
  } finally { p.close(); }
});

test('back from a streaming service after the page was dropped: same week and the show highlighted again', async () => {
  const first = await openPage({});
  let key, week;
  try {
    const row = first.$('list').querySelector('.row .links a')?.closest('.row');
    assert.ok(row, 'a show with a streaming link');
    first.$('next').click(); await first.settle();
    const later = first.$('list').querySelector('.row .links a');
    (later || row.querySelector('.links a')).dispatchEvent(new first.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const saved = JSON.parse(first.window.sessionStorage.getItem('streamReturn'));
    assert.equal(saved.weekOffset, 1);
    key = saved.key; week = first.$('week').textContent;
  } finally { first.close(); }
  const back = await openPage({ session: { streamReturn: JSON.stringify({ key, view: 'week', weekOffset: 1, range: 'week', pickedDay: null, y: 0, time: Date.now() }) } });
  try {
    assert.equal(back.$('week').textContent, week);
    assert.ok(back.$('list').querySelector('.row.stream-return'), 'the show is highlighted');
    assert.equal(back.window.sessionStorage.getItem('streamReturn'), null, 'used once');
  } finally { back.close(); }
});
