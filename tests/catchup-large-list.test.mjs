import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('40 anime and 100 pending episodes survive season grouping and bulk target calculation', async () => {
  const p = await openPage();
  try {
    const stats = p.run(`(() => {
      const rows = Array.from({length:40}, (_,i) => ({
        m: {id:1000+i, startDate:{year:2026, month:i<20?7:10, day:1}, nextAiringEpisode:null},
        first:1, out:i%2?3:2, progress:0, since:i, missing:false, links:[]
      }));
      const groups = catchupSeasonGroups(rows);
      return {
        groups:groups.length,
        totals:groups.map(g=>g.rows.reduce((n,r)=>n+r.out-r.first+1,0)),
        distinct:groups.map(g=>new Set(g.rows.map(r=>r.m.id)).size),
        targets:groups.map(g=>seasonWatchTargets(g.rows).length),
        allIds: [...new Set(groups.flatMap(g=>g.rows.map(r=>r.m.id)))].length
      };
    })()`);
    assert.equal(stats.groups,2);
    assert.deepEqual(Array.from(stats.totals),[50,50]);
    assert.deepEqual(Array.from(stats.distinct),[20,20]);
    assert.deepEqual(Array.from(stats.targets),[20,20]);
    assert.equal(stats.allIds,40);
  } finally { p.close(); }
});

test('search finds a show even inside folded overflow in a 40-series view', async () => {
  const p = await openPage();
  try {
    const cards = Array.from({length:40},(_,i)=>`<div class="row" data-search="series${i+1}">Series ${i+1}</div>`).join('');
    p.$('list').innerHTML = `<details class="day catchup-season" data-catchup-season="2026-3">
      <summary>Herbst 2026</summary><details class="catchup-overflow" data-catchup-overflow="2026-3">
      <summary>Weitere 32 Serien anzeigen</summary>${cards}</details></details>`;
    p.$('search').value = 'series 39';
    p.run('applySearch()');
    assert.equal(p.$('list').querySelector('.catchup-season').open,true);
    assert.equal(p.$('list').querySelector('.catchup-overflow').open,true);
    const visible = [...p.$('list').querySelectorAll('[data-search]:not(.hidden-by-search)')];
    assert.equal(visible.length,1);
    assert.equal(visible[0].textContent,'Series 39');
  } finally { p.close(); }
});

test('expanded season and overflow stay open even when their episode counts change', async () => {
  const p = await openPage();
  try {
    p.$('list').innerHTML = `<details class="day catchup-season" data-catchup-season="2026-3" open>
      <summary>Herbst 2026 · 100 Folgen</summary><details class="catchup-overflow" data-catchup-overflow="2026-3" open>
      <summary>Weitere 32 Serien anzeigen</summary><div class="row" data-search="series 39">Series 39</div>
      </details></details>`;
    const restore = p.run('preserveListPosition()');
    p.$('list').innerHTML = `<details class="day catchup-season" data-catchup-season="2026-3">
      <summary>Herbst 2026 · 99 Folgen</summary><details class="catchup-overflow" data-catchup-overflow="2026-3">
      <summary>Weitere 31 Serien anzeigen</summary><div class="row" data-search="series 39">Series 39</div>
      </details></details>`;
    restore();
    assert.equal(p.$('list').querySelector('.catchup-season').open,true);
    assert.equal(p.$('list').querySelector('.catchup-overflow').open,true);
  } finally { p.close(); }
});
