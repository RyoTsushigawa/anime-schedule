import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script=fileURLToPath(new URL('../scripts/season-preview-review.mjs',import.meta.url));
async function withCatalog(carryover,run){
 const cwd=await mkdtemp(join(tmpdir(),'season-review-'));
 await writeFile(join(cwd,'season-trailer-candidates.json'),JSON.stringify({
  seasons:{'winter-2027':{previousSeasonChecked:true,entries:[
   {key:'example show',title:'Example Show',carriedOver:carryover,sequelStatus:'unknown'}]}}
 }));
 await writeFile(join(cwd,'season-trailers.json'),JSON.stringify({schemaVersion:5,seasons:{}}));
 const execute=(...args)=>spawnSync(process.execPath,[script,'--season','winter-2027','--key','example show',...args],{cwd,encoding:'utf8'});
 try{await run(execute,async()=>JSON.parse(await readFile(join(cwd,'season-trailers.json'),'utf8')));}
 finally{await rm(cwd,{recursive:true,force:true});}
}
test('manual full trailer approval requires explicit official, footage and sequel checks',async()=>{
 await withCatalog(false,async(execute,catalog)=>{
  const partial=execute('--action','approve-full','--youtube','AAAAAAAAAAA');
  assert.notEqual(partial.status,0);
  const approved=execute('--action','approve-full','--youtube','AAAAAAAAAAA','--confirmed-official','--confirmed-footage','--confirmed-not-sequel','--subs','en');
  assert.equal(approved.status,0,approved.stderr);
  const video=(await catalog()).seasons['winter-2027'].trailers['example show'];
  assert.equal(video.youtubeId,'AAAAAAAAAAA');assert.equal(video.subtitles,'en');assert.equal(video.verified,true);
 });
});
test('missing YouTube status needs a review note and a checked full-trailer search',async()=>{
 await withCatalog(false,async(execute,catalog)=>{
  assert.notEqual(execute('--action','mark-missing').status,0);
  assert.equal(execute('--action','mark-missing','--confirmed-no-full','--reason','Checked LiveChart and YouTube').status,0);
  assert.equal((await catalog()).seasons['winter-2027'].trailers['example show'].youtubeStatus,'not_found');
 });
});
test('a carried-over show cannot receive a new trailer',async()=>{
 await withCatalog(true,async execute=>{
  assert.notEqual(execute('--action','approve-full','--youtube','AAAAAAAAAAA','--confirmed-official','--confirmed-footage','--confirmed-not-sequel').status,0);
 });
});
test('Okinawa and default are not part of manual video review',async()=>{
 await withCatalog(false,async execute=>{
  assert.notEqual(execute('--action','approve-teaser','--youtube','AAAAAAAAAAA','--confirmed-official','--confirmed-footage','--confirmed-not-sequel').status,0);
 });
});
