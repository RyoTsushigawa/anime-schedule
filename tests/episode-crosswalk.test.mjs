import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('Crosswalk uses a known offset and leaves other numbering unconfirmed', async t => {
  const p = await openPage({ streams: {
    release: { 1: { lag: 4 } }, status: { 1: { titles: ['Show Alpha'] } }
  } });
  t.after(() => p.close());
  await p.click(p.$('settingsButton'));
  await p.click(p.$('episodeCrosswalkButton'));
  assert.equal(p.$('episodeCrosswalkDlg').open, true);
  assert.match(p.$('episodeCrosswalkResults').textContent, /Keine Zuordnung/);
  const input = p.$('episodeCrosswalkNumber');
  input.value = '5';
  input.dispatchEvent(new p.window.Event('input'));
  assert.match(p.$('episodeCrosswalkResults').textContent, /AniList: Folge 5Guckplan: Folge 1/);
  assert.match(p.$('episodeCrosswalkResults').textContent, /MyAnimeList: Nummerierung nicht bestätigt/);
  input.value = '2.5';
  input.dispatchEvent(new p.window.Event('input'));
  assert.match(p.$('episodeCrosswalkResults').textContent, /ganze Folgennummer/);
});