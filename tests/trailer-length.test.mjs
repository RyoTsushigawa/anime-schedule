import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../season-preview.js',import.meta.url),'utf8');
const tool=readFileSync(new URL('../tools/trailers.mjs',import.meta.url),'utf8');
const slice=(from,to)=>{const a=source.indexOf(from),b=source.indexOf(to,a);assert.ok(a>=0&&b>a,from);return source.slice(a,b);};
const verified=new Function('clean',slice('function verifiedTrailer(','// Covers')+'\nreturn verifiedTrailer;')(v=>String(v??'').trim());
const length=new Function(slice('const trailerLength=','function trailerFor(')+'\nreturn trailerLength;')();

test('U52: a trailer keeps its runtime only when it is plausible',()=>{
 const base={auto:true,type:'full_trailer',sequelStatus:'not_sequel',youtubeId:'abcdefghijk'};
 assert.equal(verified({...base,seconds:92}).seconds,92);
 assert.equal(verified(base).seconds,0);
 assert.equal(verified({...base,seconds:'92'}).seconds,0);
 assert.equal(verified({...base,seconds:7200}).seconds,0);
});
test('U52: runtimes read as m:ss or h:mm:ss',()=>{
 assert.equal(length(92),'1:32');
 assert.equal(length(605),'10:05');
 assert.equal(length(3725),'1:02:05');
});
test('U52: the trailer tool stores the length and fills it in for older picks',()=>{
 assert.match(tool,/seconds: seconds\(v\.contentDetails\.duration\)/);
 assert.match(tool,/s\.seconds && \{ seconds: s\.seconds \}/);
 assert.ok(tool.indexOf('const noLength')<tool.indexOf('await writeFile(STATE'),'lengths are filled before the state is saved');
 assert.match(source,/'YouTube Playlist'\+\(total\?' · '/);
});
