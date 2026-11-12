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
    const exclusive=audience.filter(s=>s.count===1);
    const lastTimes=visible.filter(r=>/^\d{1,2}:\d{1,2}$/.test(r.time||'')).map(r=>{
      const [h,m]=r.time.split(':').map(Number);return {...r,minutes:(h<6?h+24:h)*60+m};
    }).sort((a,b)=>b.minutes-a.minutes);
    const perPerson = people.map(name=>[name,new Set(records.filter(r=>r.person===name).map(r=>r.key)).size]);
    return {shows:shows.size, slots:slots.size, minutes:slots.size*30,
      days:days.map(d=>[d,daySlots.get(d).size]), busiest:top([...daySlots].map(([d,s])=>[d,s.size]))[0],
      parallel:[...slots.values()].filter(s=>s.size>1).length,
      partner:top(partners)[0] || null, popular:audience[0] || null,
      exclusive, night:lastTimes[0]||null, partners:partners.size,
      perPerson:top(perPerson), keys:[...shows.keys()]};
  }
  function list(entries, start, end) {
    const from = date => date?.year && date?.month && date?.day ? new Date(date.year,date.month-1,date.day).getTime() : NaN;
    const completed=entries.filter(e=>e.status==='COMPLETED' && from(e.completedAt)>=start && from(e.completedAt)<end);
    const current=entries.filter(e=>['CURRENT','REPEATING'].includes(e.status));
    // Watch time: completed in the window (all episodes), plus progress on this season's own shows that
    // are still running, paused or dropped. Older unfinished shows can't be dated, so they don't count.
    const startDate=new Date(start), season=['WINTER','SPRING','SUMMER','FALL'][Math.floor(startDate.getMonth()/3)], year=startDate.getFullYear();
    const done=new Set(completed);
    const watchedEpisodes=e=>done.has(e)?(e.media.episodes||e.progress||0)
      :e.media.season===season&&e.media.seasonYear===year&&['CURRENT','REPEATING','PAUSED','DROPPED'].includes(e.status)?(e.progress||0):0;
    const watched=entries.map(e=>[e,watchedEpisodes(e)]).filter(([,n])=>n>0);
    const genres=new Map();
    for(const e of completed) for(const genre of e.media.genres||[]) genres.set(genre,(genres.get(genre)||0)+1);
    const rated=completed.filter(e=>e.score>0);
    const mean=rated.length?rated.reduce((n,e)=>n+e.score,0)/rated.length:0;
    const dates=new Map();for(const e of completed){const day=[e.completedAt.year,e.completedAt.month,e.completedAt.day].join('-');dates.set(day,(dates.get(day)||0)+1);}
    const ratings=new Map();for(const e of rated){const id=e.media.idMal?'mal:'+e.media.idMal:key(e.media.title.romaji||e.media.title.english);if(!ratings.has(id))ratings.set(id,[]);ratings.get(id).push(e);}
    const debates=[...ratings.values()].filter(es=>es.length>1).map(es=>({title:es[0].media.title.english||es[0].media.title.romaji,gap:Math.max(...es.map(e=>e.score))-Math.min(...es.map(e=>e.score))})).filter(e=>e.gap>0).sort((a,b)=>b.gap-a.gap);
    // Only records with a known completion date can be attributed to the selected season.
    return {rated:rated.length,mean,finishDay:top(dates)[0]||null,debate:debates[0]||null,completed:completed.length, minutes:completed.reduce((n,e)=>n+(e.media.episodes||0)*(e.media.duration||24),0),
      durationEstimated:completed.some(e=>!e.media.duration), current:current.length,
      watchEpisodes:watched.reduce((n,[,k])=>n+k,0), watchMinutes:watched.reduce((n,[e,k])=>n+k*(e.media.duration||24),0), watchShows:watched.length,
      episodes:completed.reduce((n,e)=>n+(e.media.episodes||0),0), genre:top(genres)[0]||null,
      // The same show from several accounts is one row, with their average rating
      favourites:[...ratings.values()].map(es=>({title:es[0].media.title.english||es[0].media.title.romaji,score:Math.round(es.reduce((n,e)=>n+e.score,0)/es.length)})).sort((a,b)=>b.score-a.score).slice(0,3),
      undated:entries.filter(e=>e.status==='COMPLETED'&&!Number.isFinite(from(e.completedAt))).length};
  }
  const shared = name => key(name) === 'maryo';
  const peopleCount = people => people.reduce((n,p)=>n+(shared(p)?2:1),0);
  const listsAllowed = tab => Number.isFinite(tab?.start) && tab.start >= new Date(2027,0,1).getTime();
  return {plan,list,key,days,shared,peopleCount,listsAllowed};
})();
