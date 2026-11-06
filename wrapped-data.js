// Read-only statistics. Planned slots are never counted as episodes actually watched.
const WrappedStats = (() => {
  const days = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];
  const key = title => String(title || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const top = values => [...values].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'de'));
  function plan(records, people, person = null) {
    const selected = person ? [person] : people;
    const visible = records.filter(r => selected.includes(r.person));
    const shows = new Map(), slots = new Map(), daySlots = new Map(days.map(d => [d,new Set()]));
    for (const r of visible) {
      if (!shows.has(r.key)) shows.set(r.key, {title:r.title, people:new Set()});
      shows.get(r.key).people.add(r.person);
      // Unknown times do not imply parallel viewing. Slot numbers can explicitly group them.
      const slot = r.day + ':' + (r.time || (r.slot ? 'slot'+r.slot : r.key));
      if (!slots.has(slot)) slots.set(slot,new Set());
      slots.get(slot).add(r.key);
      daySlots.get(r.day)?.add(slot);
    }
    const showPeople = new Map();
    for (const r of records) {
      if (!showPeople.has(r.key)) showPeople.set(r.key,new Set());
      showPeople.get(r.key).add(r.person);
    }
    const partners = new Map();
    for (const members of showPeople.values()) {
      const names=[...members];
      if (person) {
        if (members.has(person)) for (const name of names.filter(n=>n!==person)) partners.set(name,(partners.get(name)||0)+1);
      } else for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++) {
        const pair=[names[i],names[j]].sort().join(' + ');
        partners.set(pair,(partners.get(pair)||0)+1);
      }
    }
    const audience = [...shows].map(([id,s])=>({key:id,title:s.title,count:showPeople.get(id)?.size || 0})).sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title));
    const perPerson = people.map(name=>[name,new Set(records.filter(r=>r.person===name).map(r=>r.key)).size]);
    return {shows:shows.size, slots:slots.size, minutes:slots.size*30,
      days:days.map(d=>[d,daySlots.get(d).size]), busiest:top([...daySlots].map(([d,s])=>[d,s.size]))[0],
      parallel:[...slots.values()].filter(s=>s.size>1).length,
      partner:top(partners)[0] || null, popular:audience[0] || null,
      perPerson:top(perPerson), keys:[...shows.keys()]};
  }
  function list(entries, start, end) {
    const from = date => date?.year && date?.month && date?.day ? new Date(date.year,date.month-1,date.day).getTime() : NaN;
    const completed=entries.filter(e=>e.status==='COMPLETED' && from(e.completedAt)>=start && from(e.completedAt)<end);
    const current=entries.filter(e=>['CURRENT','REPEATING'].includes(e.status));
    const genres=new Map();
    for(const e of completed) for(const genre of e.media.genres||[]) genres.set(genre,(genres.get(genre)||0)+1);
    // Only records with a known completion date can be attributed to the selected season.
    return {completed:completed.length, minutes:completed.reduce((n,e)=>n+(e.media.episodes||0)*(e.media.duration||24),0),
      durationEstimated:completed.some(e=>!e.media.duration), current:current.length,
      episodes:completed.reduce((n,e)=>n+(e.media.episodes||0),0), genre:top(genres)[0]||null,
      favourites:completed.filter(e=>e.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(e=>({title:e.media.title.english||e.media.title.romaji,score:e.score})),
      undated:entries.filter(e=>e.status==='COMPLETED'&&!Number.isFinite(from(e.completedAt))).length};
  }
  return {plan,list,key,days};
})();
