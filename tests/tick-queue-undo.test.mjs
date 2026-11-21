import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// A tick AniList can't take right now is kept and sent on its own later; an expired login or a refused change
// asks to try again; right after a tick, ↩ next to it takes it back.
const auth = { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' };
const list = { 1: { status: 'CURRENT', progress: 2 }, 2: { status: 'CURRENT', progress: 0 } };
// AniList's save fails while globalThis.saveDown is set (everything else answers)
const breakSaves = p => p.run(`{ const real = anilist; anilist = (q, ...rest) => globalThis.saveDown && q.includes('SaveMediaListEntry') ? Promise.reject(globalThis.saveDown) : real(q, ...rest); }`);
const tickOf = (p, id) => p.$('list').querySelector(`.watch[data-media="${id}"]`);
const wait = ms => new Promise(r => setTimeout(r, ms));

test('AniList unreachable: the tick is queued (⏳) and sent once it answers again', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    breakSaves(p);
    await p.click(p.$('viewCatchup'));
    p.run(`globalThis.saveDown = new Error('AniList antwortet gerade nicht')`);
    await p.click(tickOf(p, 1), 300);
    await wait(100);
    assert.match(p.$('noticeText').textContent, /wird automatisch gesendet/);
    assert.equal(JSON.parse(p.storage().tickQueueV1).length, 1);
    assert.ok(tickOf(p, 1).classList.contains('queued'));
    p.run('globalThis.saveDown = null');
    await p.run('flushTickQueue()');
    await wait(300);
    assert.equal(p.storage().tickQueueV1, undefined, 'queue empty');
    assert.match(p.$('noticeText').textContent, /Ein Haken wurde nachgetragen/);
    assert.equal(p.run('myProgress.get(1)'), 3);
  } finally { p.close(); }
});

test('changed elsewhere before it could be sent: the queued tick is dropped, not overwritten', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    breakSaves(p);
    await p.click(p.$('viewCatchup'));
    p.run(`globalThis.saveDown = new Error('AniList antwortet gerade nicht')`);
    await p.click(tickOf(p, 1), 300);
    p.run(`globalThis.saveDown = null; entryForAccount = async () => ({ onList: true, progress: 1, status: 'CURRENT' })`);
    await p.run('flushTickQueue()');
    await wait(200);
    assert.equal(p.storage().tickQueueV1, undefined);
    assert.match(p.$('noticeText').textContent, /nicht nachgetragen/);
  } finally { p.close(); }
});

test('a refused change is not queued: "Versuchs in einer Minute nochmal"', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    breakSaves(p);
    await p.click(p.$('viewCatchup'));
    p.run(`globalThis.saveDown = Object.assign(new Error('validation'), { status: 400 })`);
    await p.click(tickOf(p, 1), 300);
    assert.match(p.$('noticeText').textContent, /Versuchs in einer Minute nochmal/);
    assert.equal(p.storage().tickQueueV1, undefined);
  } finally { p.close(); }
});

test('↩ in place of a fresh tick (the show left Catch-up) takes it back', async () => {
  const p = await openPage({ storage: auth, list });
  try {
    await p.click(p.$('viewCatchup'));
    await p.click(tickOf(p, 1), 300);
    await wait(1500);
    const back = p.$('list').querySelector('[data-tick-undo]');
    assert.ok(back, 'undo button shown');
    assert.match(back.closest('.tick-gone').textContent, /Folge 3 gesehen/);
    await p.click(back, 300);
    await wait(500);
    assert.equal(p.run('myProgress.get(1)'), 2);
  } finally { p.close(); }
});

test('Zeitplan: the card stays, ↩ sits next to its tick', async () => {
  const p = await openPage({ storage: auth, list: { 1: { status: 'CURRENT', progress: 3 } } });
  try {
    const tick = tickOf(p, 1);
    assert.ok(tick, 'Alpha has a tick in the week');
    await p.click(tick, 300);
    await wait(1500);
    const back = tickOf(p, 1).previousElementSibling;
    assert.ok(back?.matches('.tick-undo'), 'undo next to the tick');
    assert.ok(tickOf(p, 1).classList.contains('done'));
    await p.click(back, 300);
    await wait(500);
    assert.equal(p.run('myProgress.get(1)'), 3);
  } finally { p.close(); }
});
