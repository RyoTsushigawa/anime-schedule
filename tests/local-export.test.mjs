import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportRows, localBackup, malImportXml, malImportInfo} from '../local-export.mjs';
import {openPage} from './harness.mjs';

const sample = [
 {id:100,idMal:200,title:{romaji:'Anime & Friends <Test>'},episodes:12,format:'TV'},
 {id:101,idMal:201,title:{english:'Anime Movie'},episodes:1,format:'MOVIE'},
 {id:102,idMal:null,title:{english:'AniList only'},episodes:0,format:'ONA'}
];

test('MAL XML includes the correct MAL IDs, escaped titles and precise progress',()=>{
 const rows = exportRows(sample, {'100':4,'101':1,'102':0});
 const xml = malImportXml(rows,'Matthias');
 assert.match(xml,/<myanimelist>/);
 assert.match(xml,/<series_animedb_id>200<\/series_animedb_id>/);
 assert.match(xml,/<series_animedb_id>201<\/series_animedb_id>/);
 assert.doesNotMatch(xml,/<series_animedb_id>100<\/series_animedb_id>/);
 assert.match(xml,/Anime &amp; Friends &lt;Test&gt;/);
 assert.match(xml,/<my_watched_episodes>4<\/my_watched_episodes>/);
 assert.match(xml,/<my_watched_episodes>1<\/my_watched_episodes>/);
 assert.match(xml,/<series_type>Movie<\/series_type>/);
 assert.match(xml,/<my_status>2<\/my_status>/);
 assert.match(xml,/<my_status>1<\/my_status>/);
 assert.match(xml,/<update_on_import>0<\/update_on_import>/);
 assert.equal((xml.match(/<anime>/g)||[]).length,2);
 assert.deepEqual(malImportInfo(rows),{exported:2,omitted:1});
});

test('JSON backup preserves the raw per-person progress, including anime without MAL IDs',()=>{
 const rows=exportRows(sample,{'100':4,'101':1,'102':2,'999':8});
 const data=localBackup('Matthias',[100,102,102],{'100':4,'101':1,'102':2,'999':8},rows);
 assert.equal(data.version,1);
 assert.equal(data.person,'Matthias');
 assert.equal(data.progress['999'],8);
 assert.deepEqual(data.shows,[100,102]);
 assert.ok(data.media.some(x=>x.id===102 && x.idMal===null));
 assert.doesNotMatch(JSON.stringify(data),/token|password/i);
});

test('invalid progress and missing MAL IDs cannot become import records',()=>{
 const rows=exportRows([{id:10,idMal:0,title:{romaji:'No MAL'},episodes:13},{id:12,idMal:88,title:{romaji:'Valid'},episodes:12}],
  {'10':-5,'12':-99});
 assert.equal(rows[0].progress,0);
 assert.equal(rows[1].progress,0);
 const xml=malImportXml(rows,'M & M');
 assert.match(xml,/M &amp; M/);
 assert.match(xml,/<series_animedb_id>88<\/series_animedb_id>/);
 assert.doesNotMatch(xml,/<series_animedb_id>0<\/series_animedb_id>/);
 assert.equal((xml.match(/<anime>/g)||[]).length,1);
});

test('local profiles expose one Exportieren entry and an accessible file chooser',async()=>{
 const p=await openPage({storage:{soloPerson:'Matthias'}});
 try {
  await p.click(p.$('viewCatchup'),650);
  const open=p.$('localExportOpen');
  assert.ok(open,'export button is shown only for local tracker');
  await p.click(open,100);
  assert.equal(p.$('localExportDialog').open,true);
  assert.equal(p.$('localExportDialog').dataset.person,'Matthias');
  assert.ok(p.$('localExportBackup'));
  assert.ok(p.$('localExportXml'));
  assert.match(p.$('localExportPerson').textContent,/Matthias/);
 } finally { p.close(); }
});

test('export UI only exposes file downloads and explicitly warns about existing entries',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="localExportDialog"/);
 assert.match(html,/Bestehende Einträge vor dem Import prüfen/);
 assert.match(app,/import\('\.\/local-export\.mjs'\)/);
 assert.match(app,/localExportCatalog\(snapshot\)/);
 assert.match(app,/downloadLocalFile\(/);
});
