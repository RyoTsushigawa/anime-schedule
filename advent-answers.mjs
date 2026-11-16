let setupPromise;
async function setup(){
 if(!setupPromise)setupPromise=(async()=>{
  const settings=await config();
  const api=String(settings.previewVotesUrl||'').replace(/\/$/,'');
  if(new URL(api).origin!=='https://anime-season-preview-votes.shigeruhagano.workers.dev')throw Error('Antworten sind hier noch nicht eingerichtet.');
  const profiles=await fetch('wrapped-profiles.json').then(r=>{if(!r.ok)throw Error('Namen konnten nicht geladen werden.');return r.json();});
  let people=Object.keys(profiles);
  try{const tabs=await guckplanTabs();const plan=await loadPlan(tabFor(tabs,Date.now()));people=[...new Set([...people,...plan.people])];}catch{}
  people=people.flatMap(p=>p==='MaRyo'?['Marvin','Ryo']:[p]).sort((a,b)=>a.localeCompare(b,'de'));
  await Identity.ready;
  return {api,people};
 })().catch(e=>{setupPromise=null;throw e;});
 return setupPromise;
}
export async function mountAnswers(host,door,dependencies={}){
 const doc=host.ownerDocument,identity=dependencies.identity||Identity;
 const element=(tag,text,cls)=>{const e=doc.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const heading=element('h3','Eure Antworten');host.append(heading);
 const status=element('p','Antworten werden geladen …','advent-answer-status');status.setAttribute('role','status');host.append(status);
 try{
  const {api,people}=await (dependencies.setup?dependencies.setup():setup());if(!host.isConnected)return;
  const request=dependencies.fetch||fetch;
  let storage;try{storage=dependencies.storage||localStorage;}catch{}
  let answers=[],loaded=false,busy=false,person='',requestId=0;
  const label=element('label','Deine Antwort als '),select=element('select');select.setAttribute('aria-label','Deine Antwort als');
  select.append(new Option('Person wählen',''),...people.map(p=>new Option(p,p)));label.append(select);
  const authBox=element('div',null,'advent-identity'),groupBox=element('div'),form=element('form',null,'advent-answer-form');
  const inputLabel=element('label','Deine Antwort'),input=element('textarea');input.maxLength=1000;input.rows=4;input.placeholder='Was meinst du?';input.setAttribute('aria-label','Deine Antwort');inputLabel.append(input);
  const note=element('p','Nach dem Speichern für eure Gruppe sichtbar. Du kannst deine Antwort später bearbeiten.','advent-prompt-note');
  const save=element('button','Antwort speichern','pill primary');save.type='submit';
  const count=element('span','0 / 1000','advent-answer-count'),actions=element('div',null,'advent-answer-actions');actions.append(save,count);
  form.append(inputLabel,note,actions);
  const details=element('details',null,'advent-group-answers'),summary=element('summary','Antworten der Runde'),list=element('div'),refresh=element('button','Antworten aktualisieren','pill');refresh.type='button';details.append(summary,list,refresh);
  host.insertBefore(label,status);host.insertBefore(authBox,status);host.insertBefore(groupBox,status);host.append(form,details);
  const draftKey=()=>`advent-draft:2026:${door}:${person}`;
  function readDraft(){try{return storage.getItem(draftKey());}catch{return null;}}
  function keepDraft(){if(person)try{storage.setItem(draftKey(),input.value);}catch{}count.textContent=`${input.value.length} / 1000`;}
  // chain doors (one part per person, e.g. a title or a story): the parts in the order they were saved, as one text
  const chain=!!dependencies.chain;
  function drawList(){summary.textContent=`Antworten der Runde (${answers.length})`;list.replaceChildren();
   if(!answers.length)list.append(element('p',chain?'Noch kein Teil. Deiner macht den Anfang.':'Noch keine Antworten. Vielleicht macht deine den Anfang.','advent-prompt-note'));
   else if(chain){const parts=[...answers].sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
    list.append(element('p',parts.map(a=>a.text).join(' '),'advent-chain-text'),element('p','Von '+parts.map(a=>a.person).join(' → '),'advent-prompt-note'));}
   else for(const a of answers){const card=element('article',null,'advent-group-answer');card.append(element('b',a.person),element('p',a.text));list.append(card);}
  }
  function choose(){person=select.value;identity.draw(authBox,person,()=>{form.hidden=!identity.canAct(person);});form.hidden=!person||!identity.canAct(person);
   input.value=readDraft()??answers.find(a=>a.person===person)?.text??'';count.textContent=`${input.value.length} / 1000`;
  }
  async function call(method,body){
   const response=await request(api+'/advent/answers'+(method==='GET'?`?year=2026&door=${door}`:''),{method,cache:'no-store',headers:{'X-Group-Code':savedGroupCode(),...(body?{'Content-Type':'application/json',...identity.headers(body.person)}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json();
   if(!response.ok){if(response.status===401&&/Gruppencode/.test(data.error||''))identity.askGroupCode(groupBox,()=>load());throw Error(data.error||'Antworten konnten nicht geladen werden.');}
   return data;
  }
  async function load(){if(busy)return;const id=++requestId;refresh.disabled=true;status.textContent='Antworten werden geladen …';
   try{const data=await call('GET');if(id!==requestId||!host.isConnected)return;answers=data.answers;drawList();
    if(!loaded){loaded=true;choose();}status.textContent='';
   }catch(e){if(id===requestId&&host.isConnected)status.textContent=e.message;}
   finally{refresh.disabled=false;}
  }
  select.value=identity.myPeople().find(p=>people.includes(p))||'';choose();select.addEventListener('change',choose);input.addEventListener('input',keepDraft);refresh.addEventListener('click',load);
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const author=person,text=input.value.trim();if(!text){status.textContent='Schreib zuerst eine Antwort.';input.focus();return;}
   busy=true;++requestId;select.disabled=input.disabled=save.disabled=refresh.disabled=true;status.textContent='Antwort wird gespeichert …';keepDraft();
   try{const data=await call('POST',{year:2026,door,person:author,text});
    try{storage.removeItem(`advent-draft:2026:${door}:${author}`);}catch{}
    if(!host.isConnected)return;answers=answers.filter(a=>a.person!==author).concat(data.answer).sort((a,b)=>a.person.localeCompare(b.person,'de'));drawList();
    status.textContent='Gespeichert. Eure Gruppe kann deine Antwort hier lesen – auch morgen.';
   }catch(e){if(host.isConnected)status.textContent='Nicht gespeichert: '+e.message+' Dein Entwurf bleibt erhalten.';}
   finally{busy=false;select.disabled=input.disabled=save.disabled=refresh.disabled=false;}
  });
  await load();
  // the group's answers follow on their own while the door is open (every 20 seconds, not while typing or hidden)
  const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return;}if(!doc.hidden&&!busy&&doc.activeElement!==input)load();},20000);
 }catch(e){if(host.isConnected){status.textContent=e.message;const retry=element('button','Noch einmal versuchen','pill');retry.type='button';retry.onclick=()=>{host.replaceChildren();mountAnswers(host,door,dependencies);};host.append(retry);}}
}
