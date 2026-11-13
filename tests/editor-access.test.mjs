import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openPage } from './harness.mjs';
// N61 Bearbeiter-Zugang: a trusted member moves shows with their own code through the delays helper;
// the owner creates and removes the codes; only their SHA-256 is in moves.json

const CODE = 'mia-code-0123456789abcdefghij';
const hash = text => createHash('sha256').update(text).digest('hex');
const file = (editors = [{ name: 'Mia', hash: hash(CODE), at: '2026-10-20T10:00:00Z' }]) => ({ moves: [], editors });
const helper = { delaysUrl: 'https://delays.test' };
const reply = op => ({ updated: new Date().toISOString(), moves: op.moves, editors: file().editors });

test('a valid editor code shows the move buttons and saves a move through the helper, with the code', async () => {
  const p = await openPage({ config: helper, movesFile: file(), storage: { editorCode: CODE }, delaysReply: reply });
  try {
    const move = p.$('list').querySelector('button.move');
    assert.ok(move, 'move buttons for the editor');
    await p.click(move);
    assert.equal(p.$('moveDlg').open, true);
    p.$('moveTag').value = 'Fr.';
    await p.click(p.$('moveSave'), 300);
    const post = p.state.delayPosts?.at(-1);
    assert.equal(post?.editor, CODE);
    assert.equal(post.moves.length, 1);
    assert.equal(post.moves[0].tag, 'Fr.');
    assert.equal(p.state.movesSaved, undefined, 'nothing written with a GitHub key');
    assert.equal(p.$('repairButton').hidden, true, 'management stays owner-only');
    assert.equal(p.$('deliveryButton').hidden, true);
  } finally { p.close(); }
});

test('no code, or a removed one: no move buttons, and the access dialog says the link is no longer valid', async () => {
  let p = await openPage({ config: helper, movesFile: file() });
  try { assert.equal(p.$('list').querySelector('button.move'), null); assert.equal(p.$('movesSetup').hidden, true); } finally { p.close(); }
  p = await openPage({ config: helper, movesFile: file([]), storage: { editorCode: CODE } });
  try {
    assert.equal(p.$('list').querySelector('button.move'), null);
    assert.equal(p.$('movesSetup').hidden, false);
    await p.click(p.$('movesSetup'));
    assert.equal(p.$('editorSelf').hidden, false);
    assert.match(p.$('editorSelfText').textContent, /gilt nicht/);
    await p.click(p.$('editorLeave'));
    assert.equal(p.window.localStorage.getItem('editorCode'), null);
  } finally { p.close(); }
});

test('the link "#editor=…" stores the code and leaves the address', async () => {
  const p = await openPage({ config: helper, movesFile: file(), hash: '#editor=' + CODE });
  try {
    assert.equal(p.window.localStorage.getItem('editorCode'), CODE);
    assert.equal(p.window.location.hash, '');
    assert.ok(p.$('list').querySelector('button.move'));
  } finally { p.close(); }
});

test('the owner creates a link (only the hash is saved) and removes it; the owner\'s own saves keep the list', async () => {
  const p = await openPage({ config: helper, movesFile: file([]), storage: { movesKey: 'k' } });
  try {
    await p.click(p.$('movesSetup'));
    assert.equal(p.$('editorAdmin').hidden, false);
    p.$('editorNameInput').value = 'Rei';
    await p.click(p.$('editorAdd'), 300);
    const saved = p.state.movesSaved;
    assert.equal(saved.editors.length, 1);
    assert.equal(saved.editors[0].name, 'Rei');
    const link = p.$('editorMsg').textContent.match(/#editor=(\S+)/)?.[1];
    assert.ok(link, p.$('editorMsg').textContent);
    assert.equal(saved.editors[0].hash, hash(decodeURIComponent(link)));
    assert.ok(!JSON.stringify(saved).includes(decodeURIComponent(link)), 'the code itself is never saved');
    // a regular move by the owner keeps the editors
    p.$('keyDlg').close();
    await p.click(p.$('list').querySelector('button.move'));
    await p.click(p.$('moveSkip'), 300);
    assert.equal(p.state.movesSaved.editors.length, 1);
    assert.ok(p.state.movesSaved.moves.some(m => m.skip));
    await p.click(p.$('movesSetup'));
    await p.click(p.$('editorList').querySelector('[data-editor-remove]'), 300);
    assert.equal(p.state.movesSaved.editors, undefined);
    assert.ok(p.state.movesSaved.moves.some(m => m.skip), 'removing an editor keeps the moves');
  } finally { p.close(); }
});
