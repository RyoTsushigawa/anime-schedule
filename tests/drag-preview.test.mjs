import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
// Dragging a show: a preview card shows where it would land (the shows after it make room), with the time that
// will be saved; "daneben" sits next to the show it would share the slot with; Escape removes it, nothing is saved.
const script = readFileSync(new URL('../drag-moves.js', import.meta.url), 'utf8');
const row = (title, time) => `<div class="row" data-watch-time="${time}"><span>${title}</span><button class="move" data-move-title="${title}"></button></div>`;
function page() {
  const dom = new JSDOM(`<!doctype html><body><div id="dragHint" hidden></div><div id="list">
    <section class="day" data-move-day="Mo"><h2>Montag</h2>${row('Alpha', '19:30')}${row('Beta', '20:00')}${row('Gamma', '20:30')}</section>
    <section class="day" data-move-day="Di"><h2>Dienstag</h2>${row('Delta', '21:00')}</section></div></body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, saved = [];
  // every row is 40px high, stacked in document order (enough for the quarter rule of the drop target)
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    const all = [...w.document.querySelectorAll('.row, .drop-ghost, h2')], i = all.indexOf(this);
    return { top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, width: 300 };
  };
  Object.assign(w, { $: id => w.document.getElementById(id), canMove: () => true, view: 'week', weekOffset: 0, NIGHT_UNTIL: 6,
    parseTime: t => (t || '').match(/^(\d{1,2})[:.](\d{2})/)?.slice(1).map(Number),
    esc: s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`), placeByDrag: (b, to) => saved.push([b.dataset.moveTitle, to]) });
  w.eval(script);
  const fire = (type, el, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { clientY: y, dataTransfer: { setData() {} } }); el.dispatchEvent(e); };
  const byTitle = t => [...w.document.querySelectorAll('.row')].find(r => r.textContent.includes(t));
  const ghost = () => w.document.querySelector('.drop-ghost');
  const order = day => [...w.document.querySelector(`[data-move-day="${day}"]`).children].map(e => e.matches('.drop-ghost') ? 'GHOST' : e.textContent.trim()).slice(1);
  return { w, fire, byTitle, ghost, order, saved };
}
const yOf = (p, el, f) => el.getBoundingClientRect().top + 40 * f;

test('before a show: the preview opens space there, with the time that is saved', () => {
  const p = page();
  p.fire('dragstart', p.byTitle('Delta'));
  const beta = p.byTitle('Beta');
  p.fire('dragover', beta, yOf(p, beta, 0.1));
  assert.deepEqual(p.order('Mo'), ['Alpha', 'GHOST', 'Beta', 'Gamma']);
  // halfway between 19:30 and 20:00 is taken by Alpha already, so it would share that slot
  assert.equal(p.ghost().querySelector('.drop-ghost-time').textContent, '19:30 · daneben');
  // over the preview itself nothing moves
  p.fire('dragover', p.ghost(), yOf(p, p.ghost(), 0.5));
  assert.deepEqual(p.order('Mo'), ['Alpha', 'GHOST', 'Beta', 'Gamma']);
  p.fire('drop', p.ghost(), yOf(p, p.ghost(), 0.5));
  assert.equal(p.ghost(), null);
  assert.deepEqual(p.saved.map(([t, to]) => [t, to.tag, to.time]), [['Delta', 'Mo', '19:30']]);
});
test('"daneben": the preview sits next to the show it would share the slot with', () => {
  const p = page();
  p.fire('dragstart', p.byTitle('Delta'));
  const beta = p.byTitle('Beta');
  p.fire('dragover', beta, yOf(p, beta, 0.5));
  assert.deepEqual(p.order('Mo'), ['Alpha', 'Beta', 'GHOST', 'Gamma']);
  assert.ok(p.ghost().classList.contains('beside'));
  assert.equal(p.ghost().querySelector('.drop-ghost-time').textContent, '20:00 · daneben');
  assert.ok(beta.classList.contains('drop-slot'));
});
test('on an empty part of a day: after its last show; Escape removes the preview and saves nothing', () => {
  const p = page();
  p.fire('dragstart', p.byTitle('Alpha'));
  const day = p.w.document.querySelector('[data-move-day="Di"]');
  p.fire('dragover', day, 9999);
  assert.deepEqual(p.order('Di'), ['Delta', 'GHOST']);
  assert.equal(p.ghost().querySelector('.drop-ghost-time').textContent, '21:30');
  p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(p.ghost(), null);
  assert.equal(p.w.document.querySelector('.move-dragging'), null);
  assert.deepEqual(p.saved, []);
});
