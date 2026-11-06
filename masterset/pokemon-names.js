const PokemonNames = (() => {
  const norm = text => String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9♀♂]/g,'');
  function create(rows) {
    const names=rows.filter(r=>r.en&&r.de).map(r=>({...r,enKey:norm(r.en),deKey:norm(r.de)})),cache=new Map();
    return {
      query(text){const n=norm(text),found=names.find(r=>r.enKey===n||r.deKey===n);return found?{en:found.en,de:found.de}:{en:text,de:text};},
      text(card){
        const key=[card.name,card.family,card.species,...(card.prints||[]).flatMap(p=>[p.set,p.num])].join(' ');
        if(cache.has(key))return cache.get(key);
        const cardName=norm([card.name,card.species].join(' '));let result=norm(key);
        for(const n of names)if(cardName.includes(n.enKey)||cardName.includes(n.deKey))result+=n.enKey+n.deKey;
        cache.set(key,result);return result;
      }
    };
  }
  return {norm,create};
})();
