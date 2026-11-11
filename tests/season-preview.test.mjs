import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,parseShows,seasonId,isCarryover,likelySequel,normalizeCandidate} from '../scripts/season-preview-discover.mjs';
import {chooseVideo,desiredVideos} from '../scripts/season-preview-playlist.mjs';

test('CSV parser preserves quotes and show ordering',()=>{
 const rows=parseCSV('Anime Titel,Eng Anime Titel,Uhrzeit,MaRyo\n"Foo, Bar",Foo Bar,19:00,Ja\nNext,Next,20:00,Default\n');
 const shows=parseShows(rows);
 assert.equal(shows[0].title,'Foo, Bar');assert.equal(shows[0].order,1);
 assert.equal(shows[1].key,'next');assert.equal(shows[1].order,2);
});
test('season names recognize Winter and German seasons',()=>{
 assert.equal(seasonId('Winter 2027'),'winter-2027');
 assert.equal(seasonId('Frühling 2027'),'spring-2027');
 assert.equal(seasonId('Guckplan Winter 2027'),null);
});
test('AniList discovery marks media with a PREQUEL as sequel',()=>{
 assert.equal(likelySequel({relations:{edges:[{relationType:'PREQUEL'}]}},'New Show'),'sequel');
 assert.equal(likelySequel({},'New Show'),'unknown');
 const matched=normalizeCandidate({id:99,title:{romaji:'Example'},trailer:{site:'youtube',id:'AAAAAAAAAAA'}},{title:'Example',english:'',order:1,key:'example'});
 assert.equal(matched.review,'pending');assert.equal(matched.youtubeId,'AAAAAAAAAAA');
 assert.equal(normalizeCandidate({title:{romaji:'Other'}},{title:'Example'}),null);
});
const base={youtubeId:'AAAAAAAAAAA',verified:true,footageVerified:true,sequelStatus:'not_sequel',type:'full_trailer'};
test('only explicitly verified full trailers qualify',()=>{
 assert.equal(chooseVideo(base)?.youtubeId,'AAAAAAAAAAA');
 assert.equal(chooseVideo({...base,verified:false}),null);
 assert.equal(chooseVideo({...base,sequelStatus:'sequel'}),null);
 assert.equal(chooseVideo({...base,footageVerified:false}),null);
});
test('teaser only as documented fallback; full trailer always wins',()=>{
 const teaser={...base,type:'teaser',fallbackApproved:true,fullTrailerUnavailable:true};
 assert.equal(chooseVideo(teaser)?.type,'teaser');
 assert.equal(chooseVideo({...teaser,fullTrailerUnavailable:false}),null);
 assert.equal(chooseVideo({...teaser,candidates:[base]})?.type,'full_trailer');
});
test('playlist follows sheet order, skips missing, excluded and duplicate videos',()=>{
 const shows=[{key:'a',carriedOver:false},{key:'b',carriedOver:false},{key:'c',carriedOver:false},{key:'d',carriedOver:false}];
 const season={trailers:{a:base,b:{...base,youtubeId:'BBBBBBBBBBB'},c:{...base,sequelStatus:'sequel'},d:base}};
 assert.deepEqual(desiredVideos(season,shows),['AAAAAAAAAAA','BBBBBBBBBBB']);
});

test('unavailable canonical video falls back to verified alternative, with one playlist entry',()=>{
 const first={...base,candidates:[{...base,youtubeId:'CCCCCCCCCCC'}]};
 const sheet={trailers:{a:first},videoStatus:{AAAAAAAAAAA:{available:false},CCCCCCCCCCC:{available:true}}};
 assert.deepEqual(desiredVideos(sheet,[{key:'a',carriedOver:false}]),['CCCCCCCCCCC']);
});

test('carryovers are excluded even if approved trailer metadata exists',()=>{
 const shows=[{key:'returning',carriedOver:true},{key:'new',carriedOver:false},{key:'unchecked',carriedOver:null}];
 const season={trailers:{returning:base,new:{...base,youtubeId:'BBBBBBBBBBB'},unchecked:{...base,youtubeId:'CCCCCCCCCCC'}}};
 assert.deepEqual(desiredVideos(season,shows),['BBBBBBBBBBB']);
});
test('carryover matching uses identical romaji or English titles rather than seasonal position',()=>{
 assert.equal(isCarryover({title:'Series X',english:'Series X'},[{title:'Series X',english:''}]),true);
 assert.equal(isCarryover({title:'New Series',english:'New Show'},[{title:'Old Series',english:'Different'}]),false);
});
