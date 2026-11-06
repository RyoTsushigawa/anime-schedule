// Only collection membership is public. Seller choices, orders, shipping and credentials stay local.
const CollectionSharing = (() => {
  const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const select = (obj, fields) => Object.fromEntries(fields.filter(f => obj[f] !== undefined).map(f => [f,obj[f]]));
  function snapshot(state) {
    const owned = Object.fromEntries(Object.entries(state?.owned || {}).filter(([id,value])=>idOK(id)&&value===true));
    const added = (Array.isArray(state?.added)?state.added:[]).filter(c=>idOK(c?.id)&&typeof c.name==='string'&&Array.isArray(c.prints)).map(c=>{
      const card=select(c,['id','name','family','imgUrl','img','species','added','unchecked','verify']);
      card.added=true;
      if(card.imgUrl&&!/^https:\/\//i.test(card.imgUrl))delete card.imgUrl;
      card.prints=c.prints.map(p=>select(p,['region','set','num','pid','low','trend','url','tid','tlang','prevLow']));
      for(const p of card.prints)if(p.url&&!/^https:\/\//i.test(p.url))delete p.url;
      return card;
    });
    return {owned,added:[...new Map(added.map(c=>[c.id,c])).values()]};
  }
  function diff(before,after) {
    const result={owned:{},added:{}};
    for(const id of new Set([...Object.keys(before.owned),...Object.keys(after.owned)]))if(!!before.owned[id]!==!!after.owned[id])result.owned[id]=!!after.owned[id];
    const a=new Map(before.added.map(c=>[c.id,c])),b=new Map(after.added.map(c=>[c.id,c]));
    for(const id of new Set([...a.keys(),...b.keys()]))if(JSON.stringify(a.get(id))!==JSON.stringify(b.get(id)))result.added[id]=b.get(id)||null;
    return result;
  }
  const hasChanges = patch => Object.keys(patch.owned).length+Object.keys(patch.added).length>0;
  function apply(base,patch) {
    const next=snapshot(base),added=new Map(next.added.map(c=>[c.id,c]));
    for(const [id,value] of Object.entries(patch.owned))if(value)next.owned[id]=true;else delete next.owned[id];
    for(const [id,value] of Object.entries(patch.added))if(value)added.set(id,value);else {added.delete(id);delete next.owned[id];}
    next.added=[...added.values()];return next;
  }
  class Client {
    constructor({getState,setCollection,status,storage=localStorage,fetcher=(...args)=>globalThis.fetch(...args)}) {
      Object.assign(this,{getState,setCollection,status,storage,fetcher});
      this.base={owned:{},added:[]};this.updated=0;this.ready=false;this.published=false;this.saving=false;this.timer=null;this.outbox={owned:{},added:{}};this.observed=null;
    }
    get key(){try{return this.storage.getItem('movesKey')||'';}catch{return '';}}
    get editable(){return this.ready&&!!this.key;}
    headers(){return {Authorization:'Bearer '+this.key,Accept:'application/vnd.github+json','Content-Type':'application/json'};}
    get api(){return 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/masterset/collection.json';}
    cache(value){try{this.storage.setItem('masterset-shared-cache',JSON.stringify(value));}catch{}}
    saved(key){try{return JSON.parse(this.storage.getItem(key)||'null');}catch{return null;}}
    async remote(){
      const r=await this.fetcher(this.api+'?ref=main&_='+Date.now(),{headers:this.headers(),cache:'no-store'});
      if(r.status===404)return {file:null,sha:null};
      if(!r.ok)throw new Error(r.status===401||r.status===403?'Editing access expired. Update it in the schedule.':'GitHub replied '+r.status);
      const meta=await r.json();return {sha:meta.sha,file:JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(meta.content.replace(/\s/g,'')),c=>c.charCodeAt(0))))};
    }
    async initialize(){
      if(!this.saved('masterset-before-sharing'))try{this.storage.setItem('masterset-before-sharing',JSON.stringify(this.getState()));}catch{}
      const local=snapshot(this.saved('masterset-before-sharing')||this.getState());let file=null;let stale=false;
      try{
        if(this.key)file=(await this.remote()).file;
        else {const r=await this.fetcher('collection.json?_='+Date.now(),{cache:'no-store'});if(r.ok)file=await r.json();else if(r.status!==404)throw new Error('Shared collection unavailable');}
      }catch(error){
        file=this.saved('masterset-shared-cache');
        if(!file){this.status((error.message||'Shared collection unavailable')+'. Showing this device’s old copy only.');return;}
        stale=true;
      }
      this.base=snapshot(file||{});this.updated=Date.parse(file?.updated)||0;this.ready=true;this.published=!!file;this.sessionKey=this.key;
      const pending=this.saved('masterset-shared-pending');
      let next=clone(this.base);
      if(this.key&&pending?.patch){this.outbox=pending.patch;next=apply(next,this.outbox);}
      else if(this.key&&pending?.base&&pending?.desired){this.outbox=diff(snapshot(pending.base),snapshot(pending.desired));next=apply(next,this.outbox);}
      else if(this.key&&!this.saved('masterset-shared-imported')){
        // Import the owner's existing browser collection once; never import a visitor's collection.
        next.owned={...next.owned,...local.owned};next.added=[...new Map([...local.added,...next.added].map(c=>[c.id,c])).values()];
        try{this.storage.setItem('masterset-shared-imported','true');}catch{}
      }
      const imported=diff(this.base,next);this.outbox={owned:{...this.outbox.owned,...imported.owned},added:{...this.outbox.added,...imported.added}};
      this.setCollection(next);this.observed=snapshot(next);if(file)this.cache(file);
      this.status(stale?'Showing the last saved shared collection.':this.key?'Collection shared · your changes save for everyone':file?'Shared collection · view only':'The owner has not published the collection yet.');
      if(this.key&&(!file||hasChanges(this.outbox))){try{this.storage.setItem('masterset-shared-pending',JSON.stringify({patch:this.outbox}));}catch{}await this.flush(true);}
    }
    changed(){
      if(!this.editable)return;
      const desired=snapshot(this.getState());
      const delta=diff(this.observed||this.base,desired);this.observed=desired;
      this.outbox={owned:{...this.outbox.owned,...delta.owned},added:{...this.outbox.added,...delta.added}};
      if(!hasChanges(this.outbox))return;
      try{this.storage.setItem('masterset-shared-pending',JSON.stringify({patch:this.outbox}));}catch{}
      this.status('Saving collection for everyone…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),400);
    }
    async flush(force=false){
      if(!this.editable||this.saving)return;
      this.saving=true;
      try{
        do{
          const desired=snapshot(this.getState()),patch=clone(this.outbox);
          if(!force&&!hasChanges(patch))break;
          force=false;let committed=null;
          for(let attempt=0;attempt<5;attempt++){
            const {file,sha}=await this.remote();
            const next=apply(file||{},patch);
            const updated=new Date(Math.max(Date.now(),(Date.parse(file?.updated)||0)+1)).toISOString();
            const body={version:1,updated,...next};
            const bytes=new TextEncoder().encode(JSON.stringify(body,null,2)+'\n');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
            const r=await this.fetcher(this.api,{method:'PUT',headers:this.headers(),body:JSON.stringify({message:'Update shared masterset collection',content:btoa(binary),branch:'main',...(sha&&{sha})})});
            if(r.ok){committed=body;break;}
            if(r.status!==409&&r.status!==422)throw new Error('Collection not shared: GitHub replied '+r.status);
          }
          if(!committed)throw new Error('Another edit happened at the same time. Try saving again.');
          const later=diff(desired,snapshot(this.getState()));this.outbox=later;
          this.base=snapshot(committed);this.published=true;this.updated=Date.parse(committed.updated);this.cache(committed);
          this.setCollection(apply(committed,later));this.observed=snapshot(this.getState());
          if(hasChanges(later))try{this.storage.setItem('masterset-shared-pending',JSON.stringify({patch:later}));}catch{}
          if(hasChanges(later))continue;
          this.storage.removeItem('masterset-shared-pending');break;
        }while(true);
        this.status('Collection shared · everyone will see it shortly.');
      }catch(error){this.status('Not shared yet: '+error.message+' Your changes are kept on this device; use Retry.');}
      finally{this.saving=false;}
    }
    async refresh(){
      if(!this.ready||this.saving||hasChanges(diff(this.base,snapshot(this.getState()))))return;
      try{
        const r=await this.fetcher('collection.json?_='+Date.now(),{cache:'no-store'});if(!r.ok)return;
        const file=await r.json();if((Date.parse(file.updated)||0)<=this.updated)return;
        this.base=snapshot(file);this.published=true;this.updated=Date.parse(file.updated);this.setCollection(clone(this.base));this.observed=snapshot(this.base);this.cache(file);
        this.status('Shared collection updated.');
      }catch{}
    }
  }
  return {snapshot,diff,apply,Client};
})();
