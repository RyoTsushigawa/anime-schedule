'use strict';
// Local pass-and-play trivia: no account, location, or scores leave this browser.
const quiz=$id=>document.getElementById($id);
const TRIVIA_MEDIA_QUERY=`query ($ids:[Int]) {
 Page(page:1,perPage:50) { media(idMal_in:$ids,type:ANIME) {
  idMal genres studios(isMain:true) { nodes { name } }
 } }
}`;
const TRIVIA_SEARCH_QUERY=`query ($title:String) { Media(search:$title,type:ANIME) {
 genres studios(isMain:true) { nodes { name } } title { romaji english }
} }`;
let triviaTabs=[],triviaQuestions=[],triviaPlayers=[],triviaTurn=0,triviaAnswered=false,triviaSession=0;
const say=msg=>{quiz('triviaStatus').textContent=msg;};
function triviaSeasonKey(tab){
 const match=tab.name.match(/^Guckplan\s+(Winter|Frühling|Sommer|Herbst)\s+(20\d{2})/i);
 if(!match)return '';
 const names={winter:'winter','frühling':'spring',sommer:'summer',herbst:'fall'};
 return names[match[1].toLowerCase()]+'-'+match[2];
}
async function triviaMedia(tab){
 const [rows,seasonData]=await Promise.all([
  sheetRows(tab.gid),
  fetch('seasons.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}))
 ]);
 const plan=sheetFromRows(rows);
 const available=plan.shows.filter(s=>!s.hidden&&s.romaji);
 const catalog=seasonData.seasons?.[triviaSeasonKey(tab)]||[];
 const found=TriviaCore.matchShows(available,catalog);
 const info=[];
 for(let i=0;i<found.length;i+=40){
  const result=await anilist(TRIVIA_MEDIA_QUERY,{ids:found.slice(i,i+40).map(x=>x.id)});
  const matching=new Map((result.Page?.media||[]).map(x=>[x.idMal,x]));
  for(const show of found.slice(i,i+40)){
   const m=matching.get(show.id);
   if(m)info.push({title:show.title,genres:m.genres||[],studios:(m.studios?.nodes||[]).map(s=>s.name).filter(Boolean)});
  }
 }
 // Older or newly created plans may have no catalog entry yet. Use exact title
 // matches only: no near-match questions about an unrelated anime.
 if(info.length<5){
  const existing=new Set(info.map(x=>TriviaCore.norm(x.title)));
  for(const show of available.slice(0,15)){
   if(info.length>=12)break;
   const title=show.english||show.romaji;
   if(existing.has(TriviaCore.norm(title)))continue;
   try{
    const result=await anilist(TRIVIA_SEARCH_QUERY,{title:show.romaji},undefined,{retries:0});
    const m=result.Media;
    const titles=[m?.title?.romaji,m?.title?.english].map(TriviaCore.norm);
    if(!m||![show.romaji,show.english].some(t=>t&&titles.includes(TriviaCore.norm(t))))continue;
    info.push({title,genres:m.genres||[],studios:(m.studios?.nodes||[]).map(s=>s.name).filter(Boolean)});
    existing.add(TriviaCore.norm(title));
   }catch{} // One unavailable result should not block the game.
  }
 }
 return info;
}
function triviaScores(){
 const box=quiz('triviaScoreboard');box.replaceChildren();
 for(const [index,p] of triviaPlayers.entries()){
  const item=document.createElement('div');item.className='trivia-score'+(index===triviaTurn%triviaPlayers.length?' current':'');
  const name=document.createElement('span');name.textContent=p.name;
  const score=document.createElement('b');score.textContent=p.score+' Punkte';
  item.append(name,score);box.append(item);
 }
}
function triviaQuestion(){
 const q=triviaQuestions[triviaTurn];
 triviaAnswered=false;
 quiz('triviaProgress').textContent='Frage '+(triviaTurn+1)+' / '+triviaQuestions.length;
 quiz('triviaTurn').textContent=triviaPlayers[triviaTurn%triviaPlayers.length].name+' ist dran';
 quiz('triviaPrompt').textContent=q.prompt;
 quiz('triviaReveal').hidden=true;
 const options=quiz('triviaOptions');options.replaceChildren();
 for(const option of q.options){
  const btn=document.createElement('button');btn.type='button';btn.className='trivia-option';btn.textContent=option;
  btn.onclick=()=>triviaAnswer(option);options.append(btn);
 }
 triviaScores();
}
function triviaAnswer(option){
 if(triviaAnswered)return;
 triviaAnswered=true;
 const q=triviaQuestions[triviaTurn],correct=option===q.correct;
 triviaPlayers[triviaTurn%triviaPlayers.length].score+=TriviaCore.score(option,q.correct);
 for(const btn of quiz('triviaOptions').children){
  btn.disabled=true;
  if(btn.textContent===q.correct)btn.classList.add('correct');
  else if(btn.textContent===option)btn.classList.add('wrong');
 }
 quiz('triviaExplanation').textContent=(correct?'Richtig! +100 Punkte. ':'Leider falsch. Richtige Antwort: '+q.correct+'. ')+q.explain;
 quiz('triviaNext').textContent=triviaTurn===triviaQuestions.length-1?'Ergebnis anzeigen →':'Nächste Frage →';
 quiz('triviaReveal').hidden=false;
 triviaScores();
}
function triviaFinish(){
 quiz('battle').hidden=true;quiz('triviaEnd').hidden=false;
 const rank=[...triviaPlayers].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'de'));
 const high=rank[0].score,winners=rank.filter(p=>p.score===high);
 quiz('triviaWinner').textContent=(winners.length>1?'Unentschieden: '+winners.map(p=>p.name).join(' & '):'Gewonnen hat '+winners[0].name)+'!';
 const board=quiz('triviaFinal');board.replaceChildren();
 rank.forEach((p,i)=>{const row=document.createElement('div');row.className='trivia-score';row.textContent=(i+1)+'. '+p.name+' — '+p.score+' Punkte';board.append(row);});
}
function triviaReset(){
 ++triviaSession;quiz('battle').hidden=true;quiz('triviaEnd').hidden=true;quiz('setup').hidden=false;say('');
}
quiz('triviaNext').onclick=()=>{if(!triviaAnswered)return;if(++triviaTurn>=triviaQuestions.length)triviaFinish();else triviaQuestion();};
quiz('triviaReset').onclick=triviaReset;quiz('triviaReplay').onclick=triviaReset;
quiz('triviaShare').onclick=async()=>{
 const rank=[...triviaPlayers].sort((a,b)=>b.score-a.score);
 const text='Anime Trivia Battle · '+quiz('triviaSeason').selectedOptions[0]?.textContent+'\n'+rank.map((p,i)=>(i+1)+'. '+p.name+': '+p.score+' Punkte').join('\n');
 try{await navigator.clipboard.writeText(text);say('Ergebnis kopiert!');}catch{say('Kopieren fehlgeschlagen.');}
};
quiz('triviaStart').onclick=async()=>{
 const names=quiz('triviaPlayers').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
 if(names.length<2||names.length>8||names.some(n=>n.length>24)||new Set(names.map(n=>n.toLocaleLowerCase())).size!==names.length){
  return say('Bitte 2 bis 8 verschiedene Namen eingeben (je höchstens 24 Zeichen).');
 }
 const tab=triviaTabs.find(t=>t.gid===quiz('triviaSeason').value);
 if(!tab)return say('Bitte eine Season auswählen.');
 const session=++triviaSession,button=quiz('triviaStart');button.disabled=true;
 say('Anime-Metadaten werden geladen …');
 try{
  const media=await triviaMedia(tab);
  if(session!==triviaSession)return;
  const questions=TriviaCore.questions(media);
  const requested=Number(quiz('triviaRounds').value)*names.length;
  const usable=Math.floor(Math.min(requested,questions.length)/names.length)*names.length;
  if(usable<names.length)return say('Für diese Season fehlen ausreichende eindeutige Anime-Daten. Bitte eine andere Season auswählen.');
  triviaPlayers=names.map(name=>({name,score:0}));
  triviaQuestions=questions.slice(0,usable);triviaTurn=0;
  quiz('setup').hidden=true;quiz('triviaEnd').hidden=true;quiz('battle').hidden=false;
  say(usable<requested?'Es gibt '+usable+' überprüfbare Fragen für diese Season.':'');
  triviaQuestion();
 }catch(error){if(session===triviaSession)say('Quizdaten konnten nicht geladen werden: '+error.message);}
 finally{button.disabled=false;}
};
(async()=>{
 try{
  triviaTabs=await guckplanTabs();
  if(!triviaTabs.length)triviaTabs=[FALLBACK_TAB];
  const select=quiz('triviaSeason');
  select.replaceChildren(...triviaTabs.map(t=>new Option(t.name.replace(/^Guckplan\s+/,''),t.gid)));
  select.value=tabFor(triviaTabs,new Date()).gid;
 }catch(error){say('Season-Auswahl nicht verfügbar: '+error.message);}
})();
