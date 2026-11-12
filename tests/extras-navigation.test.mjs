import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPage} from './harness.mjs';

const source = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const miscSource = source.slice(source.indexOf('<nav id="miscMenu"'),source.indexOf('</nav></div></nav>',source.indexOf('<nav id="miscMenu"')));

test('daily essentials remain direct and games are grouped under Mehr', () => {
  assert.match(source,/id="awayButton"[^>]*aria-label="Abwesenheiten"/);
  assert.match(source,/id="viewWeek">Zeitplan<\/button>/);
  assert.match(source,/id="viewCatchup">Catch-up/);
  assert.match(source,/id="miscButton"/);
  assert.doesNotMatch(source,/header-nav-link header-games/);
  assert.equal((miscSource.match(/href="games\.html"/g)||[]).length,1);
  assert.equal((miscSource.match(/href="wrapped\.html"/g)||[]).length,1);
  assert.equal((miscSource.match(/href="https:\/\/mcdelivery\.de\/"/g)||[]).length,1);
});

test('Mehr groups existing features without adding new top-level controls or dead links', async () => {
  const page = await openPage();
  try {
    const root = page.$('miscMenu');
    assert.ok(root.hidden);
    await page.click(page.$('miscButton'));
    assert.equal(root.hidden,false);
    const headings = [...root.querySelectorAll('h3.misc-section-title')].map(h=>h.textContent);
    assert.deepEqual(headings,['Planung','Rückblick & Spiele','Extras']);
    const sections = headings.map((_,idx)=>{
      const h=root.querySelectorAll('h3.misc-section-title')[idx];
      const nodes=[];
      for(let el=h.nextElementSibling;el && el.tagName !== 'H3';el=el.nextElementSibling)nodes.push(el);
      return nodes;
    });
    assert.deepEqual(sections.map(x=>x.length),[3,3,2]);
    assert.equal(sections[1].some(x=>x.getAttribute('href')==='games.html'),true);
    assert.equal(sections[2].some(x=>x.textContent.includes('McRib bestellen')),true);
    assert.equal(page.$('awayButton').hidden,false);
    assert.equal(page.$('viewCatchup').hidden,false);
    await page.click(page.$('miscButton'));
    assert.equal(root.hidden,true);
  } finally { page.close(); }
});
