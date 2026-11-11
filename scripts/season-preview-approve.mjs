#!/usr/bin/env node
// Review/approve individual official trailers without exposing GitHub or YouTube secrets.
import {readFile,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2);
const flag=name=>args.includes('--'+name);
const arg=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:null;};
const season=arg('season'),key=arg('key')?.toLocaleLowerCase(),video=arg('youtube');
const type=arg('type')||'full_trailer';
if(!season||!key||!video||!/^[\w-]{11}$/.test(video)||
   !/^(winter|spring|summer|fall)-20\d{2}$/.test(season)||
   !['full_trailer','teaser'].includes(type))
 throw Error('Usage: node scripts/season-preview-approve.mjs --season winter-2027 --key "exact lowercase Anime Titel" --youtube VIDEO_ID --type full_trailer --confirmed-official --confirmed-footage --confirmed-not-sequel [--subs de|en] [--alternate]');
if(!flag('confirmed-official')||!flag('confirmed-footage')||!flag('confirmed-not-sequel'))
 throw Error('Approval requires review of the official source, meaningful actual show footage and non-sequel status.');
if(type==='teaser'&&!flag('confirmed-no-full'))
 throw Error('Teasers require --confirmed-no-full after checking for a full trailer.');
const subs=arg('subs');if(subs&&!['de','en'].includes(subs))throw Error('Subtitles must be de or en; omit if unverified.');
const candidates=JSON.parse(await readFile('season-trailer-candidates.json','utf8'));
const row=candidates.seasons?.[season]?.entries?.find(e=>e.key===key);
if(!row)throw Error('Series not found in the season Sheet candidate list. No invented entries allowed.');
if(row.sequelStatus==='sequel')throw Error('AniList lists a prequel / sequel indicator. Investigate classification before allowing any trailer.');
const file='season-trailers.json',data=JSON.parse(await readFile(file,'utf8'));
data.seasons||={};
const entry=data.seasons[season]||={trailers:{}};
entry.trailers||={};
const old=entry.trailers[key]||{};
const approved={
 type,verified:true,footageVerified:true,sequelStatus:'not_sequel',
 youtubeId:video,title:arg('title')||(type==='teaser'?'Official teaser (fallback)':'Official full trailer'),
 ...(subs?{subtitles:subs}:{}),
 ...(type==='teaser'?{fallbackApproved:true,fullTrailerUnavailable:true}:{}),
 reviewedAt:new Date().toISOString(),reviewSource:arg('source')||'manual review'
};
if(flag('alternate')){
 const canonical=old.youtubeId?old:null;
 if(!canonical)throw Error('Approve the primary video before adding an alternate.');
 const alternatives=Array.isArray(old.candidates)?old.candidates.filter(x=>x.youtubeId!==video):[];
 if(old.youtubeId!==video)alternatives.push(approved);
 entry.trailers[key]={...old,candidates:alternatives};
}else{
 const candidatesList=(Array.isArray(old.candidates)?old.candidates:[]).filter(x=>x.youtubeId!==video);
 // A new full trailer supersedes an older teaser, which may remain as a viewer-only fallback.
 if(old.youtubeId&&old.youtubeId!==video)candidatesList.push(Object.fromEntries(Object.entries(old).filter(([k])=>k!=='candidates')));
 entry.trailers[key]={...approved,candidates:candidatesList};
}
data.seasons[season]=entry;
await writeFile(file,JSON.stringify(data,null,2)+'\n');
console.log('Approved '+type+' for '+row.title+' ('+season+'), '+(flag('alternate')?'alternate':'canonical')+'.');
