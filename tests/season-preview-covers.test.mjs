import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../season-preview.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../season-preview.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../season-preview.css',import.meta.url),'utf8');
const start=script.indexOf('function previewCoverUrl(');
const end=script.indexOf('function coverForPreview(',start);
assert.ok(start>=0&&end>start);
const coverUrl=new Function('value',script.slice(start,end)+'\nreturn previewCoverUrl(value);');
test('accepts only expected AniList cover image hosts',()=>{
 assert.equal(coverUrl('https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium.jpg'),'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium.jpg');
 assert.equal(coverUrl('https://img.anili.st/123'),'https://img.anili.st/123');
 for(const url of ['http://s4.anilist.co/image.png','https://example.com/image.png','https://img.anili.st.evil.test/x','javascript:alert(1)'])
  assert.equal(coverUrl(url),'');
});
test('preview matches by MAL id, loads images lazily, and preserves image-free layout',()=>{
 assert.match(script,/const ids=catalogIds\(current,show\)/);
 assert.match(script,/ids\.length===1\?previewCovers\.get/);
 assert.match(script,/loading="lazy" decoding="async"/);
 assert.match(script,/cover\?' has-cover':''/);
 assert.match(css,/\.preview-item\.has-cover/);
 assert.match(css,/\.preview-cover\{width:50px;height:70px/);
 assert.match(html,/img-src[^"]*https:\/\/img\.anili\.st/);
});
