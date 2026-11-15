const $=id=>document.getElementById(id),marks=['miss','near','hit'],names=['grau · nicht enthalten','gelb · andere Stelle','grün · richtige Stelle'],symbols=['−','↔','✓'];
let api='',rows=[],busy=false,version=0;
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
function key(){try{return localStorage.getItem('movesKey')||'';}catch{return '';}}
function lock(message){$('solverApp').hidden=true;$('solverAccess').hidden=false;$('solverAuthStatus').textContent=message;$('solverResults').replaceChildren();}
async function request(path,body){
 const response=await fetch(api+path,{method:body?'POST':'GET',cache:'no-store',headers:{'X-Owner-Key':key(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok){if(response.status===401||response.status===403)lock(data.error);throw Error(data.error||'Die Anfrage ist fehlgeschlagen.');}return data;
}
async function authenticate(){
 $('solverRetry').disabled=true;
 try{if(!key()){lock('Nur für Ryo. Richte deinen Bearbeitungszugang auf der Hauptseite ein und prüfe dann erneut.');return;}
  $('solverAuthStatus').textContent='Dein Zugang wird geprüft …';
  const config=await fetch('config.json',{cache:'no-cache'}).then(r=>r.json());api=String(config.previewVotesUrl||'https://anime-season-preview-votes.shigeruhagano.workers.dev').replace(/\/$/,'');
  if(new URL(api).origin!=='https://anime-season-preview-votes.shigeruhagano.workers.dev')throw Error('Der private Zugang ist nicht eingerichtet.');
  await request('/wordle-solver/access');$('solverAccess').hidden=true;$('solverApp').hidden=false;if(!rows.length)addRow();
 }catch(e){lock(e.name==='TimeoutError'?'Die Zugangsprüfung dauert zu lange. Bitte erneut versuchen.':e.message);}finally{$('solverRetry').disabled=false;}
}
function changed(){version++;$('solverResults').replaceChildren();$('solverStatus').textContent='';}
function updateTiles(row){
 [...row.tiles.children].forEach((button,i)=>{button.replaceChildren(document.createTextNode(row.word[i]||'·'));button.dataset.mark=row.marks[i];button.disabled=!row.word[i]||busy;button.append(node('small',symbols[marks.indexOf(row.marks[i])]));button.setAttribute('aria-label',`Buchstabe ${i+1}: ${row.word[i]||'leer'}, ${names[marks.indexOf(row.marks[i])]}. Klicken zum Ändern.`);});
}
function addRow(){
 if(rows.length>=12)return;changed();const length=Number($('solverLength').value),row={word:'',marks:Array(length).fill('miss')};
 const box=node('div');box.className='solver-row';const head=node('div');head.className='solver-row-head';const input=node('input');input.maxLength=length;input.autocomplete='off';input.spellcheck=false;input.placeholder='WORT';input.setAttribute('aria-label','Geratenes Wort');
 const remove=node('button','Entfernen');remove.type='button';remove.className='pill';remove.onclick=()=>{rows=rows.filter(r=>r!==row);box.remove();changed();$('solverAdd').disabled=false;if(!rows.length)addRow();};head.append(input,remove);
 const tiles=node('div');tiles.className='solver-tiles';tiles.style.setProperty('--letters',length);row.tiles=tiles;
 for(let i=0;i<length;i++){const b=node('button');b.type='button';b.className='solver-tile';b.onclick=()=>{row.marks[i]=marks[(marks.indexOf(row.marks[i])+1)%3];changed();updateTiles(row);};tiles.append(b);}
 input.addEventListener('input',()=>{const value=input.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,length);for(let i=0;i<length;i++)if(value[i]!==row.word[i])row.marks[i]='miss';row.word=value;input.value=value;changed();updateTiles(row);});
 box.append(head,tiles);$('solverRows').append(box);rows.push(row);updateTiles(row);$('solverAdd').disabled=rows.length>=12;
}
function reset(){if(rows.some(r=>r.word)&&!confirm('Alle eingegebenen Versuche leeren?'))return false;rows=[];$('solverRows').replaceChildren();addRow();return true;}
let length='5';$('solverLength').onchange=()=>{if(reset())length=$('solverLength').value;else $('solverLength').value=length;};
$('solverReset').onclick=reset;$('solverAdd').onclick=addRow;$('solverSource').onchange=changed;$('solverRetry').onclick=authenticate;
$('solverFind').onclick=async()=>{
 const length=Number($('solverLength').value),used=rows.filter(r=>r.word);
 if(!used.length||used.some(r=>r.word.length!==length)){$('solverStatus').textContent=`Gib mindestens ein vollständiges Wort mit ${length} Buchstaben ein.`;return;}
 const turn=version;busy=true;$('solverFind').disabled=true;$('solverStatus').textContent='Passende Wörter werden gesucht …';
 try{const data=await request('/wordle-solver/solve',{length,source:$('solverSource').value,rows:used.map(r=>({word:r.word,marks:r.marks}))});if(turn!==version)return;
  $('solverResults').replaceChildren();$('solverStatus').textContent=data.total?`${data.total} mögliche ${data.total===1?'Antwort':'Antworten'}${data.total>200?' · die ersten 200 werden angezeigt':''}.`:'Keine Treffer in dieser Liste. Prüfe die Farben, besonders bei doppelten Buchstaben, oder wechsle zum Wörterbuch.';
  const list=node('ul');for(const item of data.candidates){const li=node('li');li.append(node('b',item.word));if(item.title)li.append(node('small',item.title));list.append(li);}$('solverResults').append(list);
 }catch(e){if(turn===version)$('solverStatus').textContent=e.name==='TimeoutError'?'Die Suche dauert zu lange. Bitte erneut versuchen.':e.message;}finally{busy=false;$('solverFind').disabled=false;rows.forEach(updateTiles);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){$('solverResults').replaceChildren();}else if(!key())lock('Bitte deinen Bearbeitungszugang erneut einrichten.');});
window.addEventListener('storage',e=>{if(e.key==='movesKey'){version++;rows=[];$('solverRows').replaceChildren();lock('Zugang geändert. Bitte erneut prüfen.');}});
authenticate();
