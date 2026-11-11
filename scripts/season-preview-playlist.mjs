#!/usr/bin/env node
// Sync a dedicated YouTube playlist for each upcoming season.
// Run only with explicit OAuth authorization. Never publish unreviewed videos.
import { readFile, writeFile } from 'node:fs/promises';

const file='season-trailers.json';
const yt='https://www.googleapis.com/youtube/v3/';
const safeId=id=>typeof id==='string'&&/^[\w-]{11}$/.test(id);
export function chooseVideo(entry,unavailable=new Set()){
 if(!entry||entry.sequelStatus!=='not_sequel')return null;
 const valid=c=>c&&c.verified===true&&c.footageVerified===true&&
   c.sequelStatus==='not_sequel'&&safeId(c.youtubeId)&&
   (c.type==='full_trailer'||(c.type==='teaser'&&c.fallbackApproved===true&&c.fullTrailerUnavailable===true));
 const all=[entry,...(Array.isArray(entry.candidates)?entry.candidates:[])].filter(v=>valid(v)&&!unavailable.has(v.youtubeId));
 return all.find(e=>e.type==='full_trailer')||all.find(e=>e.type==='teaser')||null;
}
export function desiredVideos(season,entries){
 const chosen=new Set(),result=[];
 const unavailable=new Set(Object.entries(season?.videoStatus||{}).filter(([,v])=>v?.available===false).map(([id])=>id));
 for(const row of entries){
  const video=chooseVideo(season?.trailers?.[row.key],unavailable);
  if(!video||chosen.has(video.youtubeId))continue;
  chosen.add(video.youtubeId);result.push(video.youtubeId);
 }
 return result;
}
function qs(obj){return new URLSearchParams(Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined))).toString();}
let accessToken='';
async function request(path,method='GET',body){
 const res=await fetch(yt+path,{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(res.status===204)return {};
 const value=await res.json().catch(()=>({}));
 if(!res.ok)throw Error('YouTube '+method+' '+path.split('?')[0]+': '+res.status+' '+JSON.stringify(value.error||value).slice(0,450));
 return value;
}
async function auth(){
 const required=['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'];
 if(required.some(key=>!process.env[key]))throw Error('Missing YouTube OAuth secrets; playlist sync skipped');
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:qs({
  client_id:process.env.YOUTUBE_CLIENT_ID,client_secret:process.env.YOUTUBE_CLIENT_SECRET,
  refresh_token:process.env.YOUTUBE_REFRESH_TOKEN,grant_type:'refresh_token'})});
 const data=await res.json();
 if(!res.ok||!data.access_token)throw Error('YouTube OAuth failed: '+JSON.stringify(data).slice(0,300));
 accessToken=data.access_token;
}
async function checkVideoAvailability(season,entries){
 const ids=[...new Set(entries.flatMap(row=>{
  const entry=season?.trailers?.[row.key];
  return [entry,...(Array.isArray(entry?.candidates)?entry.candidates:[])].filter(x=>
   x?.verified===true&&x?.footageVerified===true&&x?.sequelStatus==='not_sequel'&&safeId(x.youtubeId)
  ).map(x=>x.youtubeId);
 }))];
 season.videoStatus||={};
 for(let i=0;i<ids.length;i+=50){
  const batch=ids.slice(i,i+50);
  const response=await request('videos?'+qs({part:'status',id:batch.join(','),maxResults:50}));
  const accessible=new Set((response.items||[]).filter(v=>['public','unlisted'].includes(v.status?.privacyStatus)).map(v=>v.id));
  for(const id of batch)season.videoStatus[id]={available:accessible.has(id),lastChecked:new Date().toISOString()};
 }
 return ids.length;
}
async function createPlaylist(title){
 const result=await request('playlists?part=snippet,status','POST',{
  snippet:{title:'Anime Schedule · '+title+' · Trailer',description:'Official anime trailers in the original season-list order. One video per non-sequel show; teaser only as last resort.'},
  status:{privacyStatus:'unlisted'}});
 if(!result.id)throw Error('YouTube returned no playlist ID');
 return result.id;
}
async function listItems(playlistId){
 const all=[];let pageToken='';
 do{
  const data=await request('playlistItems?'+qs({part:'snippet,contentDetails',playlistId,maxResults:50,...(pageToken?{pageToken}:{})}));
  all.push(...(data.items||[]).map(item=>({id:item.id,videoId:item.contentDetails?.videoId||item.snippet?.resourceId?.videoId})));
  pageToken=data.nextPageToken||'';
 }while(pageToken);
 return all;
}
async function moveItem(item,playlistId,position){
 await request('playlistItems?part=snippet','PUT',{id:item.id,snippet:{playlistId,position,resourceId:{kind:'youtube#video',videoId:item.videoId}}});
}
async function addItem(playlistId,videoId,position){
 const data=await request('playlistItems?part=snippet','POST',{snippet:{playlistId,position,resourceId:{kind:'youtube#video',videoId}}});
 if(!data.id)throw Error('Insert returned no playlist item');
 return {id:data.id,videoId};
}
async function removeItem(item){await request('playlistItems?'+qs({id:item.id}),'DELETE');}
export async function reconcile(playlistId,desired){
 const current=await listItems(playlistId);
 let mutations=0;
 for(let i=0;i<desired.length;i++){
  if(current[i]?.videoId===desired[i])continue;
  const later=current.findIndex((v,index)=>index>i&&v.videoId===desired[i]);
  if(later>=0){
   const item=current.splice(later,1)[0];
   await moveItem(item,playlistId,i);current.splice(i,0,item);
  }else{
   const item=await addItem(playlistId,desired[i],i);current.splice(i,0,item);
  }
  mutations++;
 }
 // Remove stale/duplicate entries from the dedicated managed playlist only.
 for(let i=current.length-1;i>=desired.length;i--){await removeItem(current[i]);mutations++;}
 return mutations;
}
async function main(){
 const candidates=JSON.parse(await readFile('season-trailer-candidates.json','utf8').catch(()=>'{ "seasons": {} }'));
 const catalog=JSON.parse(await readFile(file,'utf8'));
 const seasonNames=Object.keys(candidates.seasons||{});
 if(!seasonNames.length){console.log('No season sheets detected; no playlist changes');return;}
 await auth();
 let writes=0;
 for(const name of seasonNames){
  const rows=candidates.seasons[name];
  if(!rows?.entries?.length)continue;
  const destination=catalog.seasons[name]||{trailers:{}};
  destination.trailers||={};
  await checkVideoAvailability(destination,rows.entries);
  const desired=desiredVideos(destination,rows.entries);
  for(const row of rows.entries){
   const entry=destination.trailers?.[row.key];
   if(!entry||!entry.youtubeId)continue;
   const live=destination.videoStatus[entry.youtubeId]?.available;
   if(live===false)entry.youtubeStatus='unavailable';
   else if(live===true&&entry.youtubeStatus==='unavailable')delete entry.youtubeStatus;
  }
  let playlistId=destination.youtubePlaylistId;
  if(!playlistId){
   playlistId=await createPlaylist(rows.title||name);
   destination.youtubePlaylistId=playlistId;
   catalog.seasons[name]=destination;
   // Persist new playlist ID before any additions to survive retry; workflow can commit on exit.
   await writeFile(file,JSON.stringify(catalog,null,2)+'\n');
   writes++;
  }
  if(!/^PL[\w-]{12,}$/.test(playlistId))throw Error('Unexpected playlist ID format for '+name);
  const count=await reconcile(playlistId,desired);
  writes+=count;
  console.log(name+': '+desired.length+' approved videos; '+count+' changes, playlist '+playlistId);
 }
 console.log('Sync completed: '+writes+' changes');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(err=>{console.error(err);process.exitCode=1;});
