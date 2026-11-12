const PLAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const PLAN_DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const SHEET_DAYS = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];
const SLOT_LENGTH = 30;
const MAX_SLOTS = 24;
const PLAN_COST = { hard: 1000, gap: 30, gapSquared: 6, delay: 12, keep: 2, slot: 4, late: 10 };
const MOVE_COST = { ok: 0, rarely: 100, never: PLAN_COST.hard };
const BREAK_WEIGHT = { protect: 3, normal: 1, fine: 0.2 };
const BREAK_LABEL = { protect: '★', normal: '', fine: '☕' };
const LATE_FROM = 23 * 60;
const MAX_SIDE_BY_SIDE = 3;
const EVERYONE = '*';
let planUnavailable = { Belly: [0] };
let planStarts = { standard: '19:00', days: ['', '', '', '', '', '', ''] };
let planBusy = null;
let planMoves = 'rarely';
let planFixed = [];
let planBreaks = {};
let planUntil = {};
try {
planUnavailable = JSON.parse(localStorage.getItem('planUnavailable')) || planUnavailable;
planStarts = JSON.parse(localStorage.getItem('planStarts')) || { ...planStarts, standard: localStorage.getItem('planStart') || '19:00' };
planBusy = JSON.parse(localStorage.getItem('planBusy'));
planMoves = MOVE_COST[localStorage.getItem('planMoves')] !== undefined ? localStorage.getItem('planMoves') : planMoves;
planFixed = JSON.parse(localStorage.getItem('planFixed')) || [];
planBreaks = JSON.parse(localStorage.getItem('planBreaks')) || {};
planUntil = JSON.parse(localStorage.getItem('planUntil')) || {};
} catch {}
const saveSettings = () => {
try {
localStorage.setItem('planUnavailable', JSON.stringify(planUnavailable));
localStorage.setItem('planStarts', JSON.stringify(planStarts));
localStorage.setItem('planBusy', JSON.stringify(planBusy || []));
localStorage.setItem('planMoves', planMoves);
localStorage.setItem('planFixed', JSON.stringify(planFixed));
localStorage.setItem('planBreaks', JSON.stringify(planBreaks));
localStorage.setItem('planUntil', JSON.stringify(planUntil));
} catch {}
if (typeof markStale === 'function' && !keepFresh) markStale();
};
let planTabGid = null;
let planOutcome = null;
let planView = 'compare';
try { planView = localStorage.getItem('planView') || planView; } catch {}
let tabs = [];
let streamsDe = null;
let noticeTimer = null;
function notice(text) {
$('noticeText').textContent = text;
$('notice').hidden = false;
clearTimeout(noticeTimer);
noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 3000);
}
async function seasonListTabs() {
const html = await (await fetch(SHEET + '/htmlview')).text();
return [...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)]
.map(([, name, gid]) => ({ name: JSON.parse(`"${name}"`).trim(), gid }))
.map(t => ({ ...t, season: t.name.match(/^(Winter|Frühling|Sommer|Herbst)\s+(\d{4})$/i) }))
.filter(t => t.season)
.map(({ name, gid, season }) => ({ name, gid, list: true, start: new Date(Number(season[2]), SEASON_MONTH[season[1].toLowerCase()], 1).getTime() }))
.sort((a, b) => b.start - a.start);
}
const ready = Promise.all([
fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json()).then(json => { streamsDe = json; }, () => {}),
Promise.all([guckplanTabs(), seasonListTabs().catch(() => [])])
.then(([guckplans, lists]) => { tabs = [...guckplans, ...lists]; }, e => console.warn('Sheet tabs not loaded:', e)),
]);
const minutesOf = time => {
const hm = parseTime(time);
return hm ? (hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0]) * 60 + hm[1] : null;
};
const clock = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const dayIndex = tag => WEEKDAYS.indexOf(norm(tag).slice(0, 2));
const bits = mask => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };
// Test mode: made-up votes per show and person, only in this browser ("planTestVotes:<tab>"); the Sheet
// is never written and the export is locked, so everything can be tried before real voting.
let planTest = false;
try { planTest = localStorage.getItem('planTest') === 'true'; } catch {}
const testKey = tab => 'planTestVotes:' + tab.gid;
const testVotes = tab => { try { return JSON.parse(localStorage.getItem(testKey(tab))) || {}; } catch { return {}; } };
const saveTestVotes = (tab, votes) => { try { localStorage.setItem(testKey(tab), JSON.stringify(votes)); } catch {} };
const showKey = show => show.romaji || show.english;
const sheetCache = new Map(), mediaCache = new Map();
async function plannerData(tab) {
if (!sheetCache.has(tab.gid)) { const loaded = await loadPlan(tab); rememberColors([loaded]); sheetCache.set(tab.gid, loaded); }
const real = sheetCache.get(tab.gid);
const override = planTest ? testVotes(tab) : {};
const sheet = planTest ? { ...real, shows: real.shows.map(s => override[showKey(s)] ? { ...s, votes: { ...s.votes, ...override[showKey(s)] } } : s) } : real;
const byShow = new Map();
for (const person of sheet.people)
for (const [show, slot] of picks(sheet, person)) {
const entry = byShow.get(show) || { show, people: [], slot };
entry.people.push(person);
if (!entry.slot?.tag && slot.tag) entry.slot = slot;
byShow.set(show, entry);
}
const entries = [...byShow.values()];
const unknown = entries.map(e => e.show).filter(s => !mediaCache.has(showKey(s)));
if (unknown.length) (await plannerMedia(unknown)).forEach((m, i) => mediaCache.set(showKey(unknown[i]), m));
const media = entries.map(e => mediaCache.get(showKey(e.show)));
// everyone with a visible column, also those who haven't picked a show yet (their availability can be set ahead)
const people = sheet.people.slice();
const idle = new Set(people.filter(p => !entries.some(e => e.people.includes(p))));
const shows = entries.map((e, i) => {
const m = media[i];
const next = m?.nextAiringEpisode;
let release = null;
if (next) {
const out = new Date((next.airingAt + (streamsDe?.release?.[m.id]?.offset || 0)) * 1000);
release = { day: (out.getDay() + 6) % 7, min: out.getHours() * 60 + out.getMinutes() };
}
const day = dayIndex(e.slot?.tag);
return {
title: m?.title?.english || e.show.english || e.show.romaji || m?.title?.romaji,
sheetTitle: e.show.romaji || e.show.english,
row: e.show,
mal: m?.idMal ? `https://myanimelist.net/anime/${m.idMal}` : '',
people: e.people,
mask: e.people.reduce((mask, p) => mask | (1 << people.indexOf(p)), 0),
release,
short: !!m?.duration && m.duration <= 15,
current: day >= 0 ? { day, min: minutesOf(e.slot.time), slot: Number(e.slot.slot) || null } : null,
};
});
return { tab, people, idle, shows, sheet, real };
}
async function plannerMedia(shows) {
const fields = 'id idMal duration title { romaji english } nextAiringEpisode { airingAt }';
const idOf = show => Object.entries(streamsDe?.status || {})
.find(([, s]) => titleMatches([show.romaji, show.english], s.titles))?.[0];
const ids = shows.map(idOf).map(Number);
const result = new Array(shows.length).fill(null);
const known = [...new Set(ids.filter(Boolean))];
if (known.length) {
const data = await anilist(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${fields} } } }`, { ids: known });
for (const m of data.Page.media) ids.forEach((id, i) => { if (id === m.id) result[i] = m; });
}
const missing = shows.flatMap((s, i) => ids[i] ? [] : [i]);
for (let at = 0; at < missing.length; at += 15) {
const batch = missing.slice(at, at + 15);
const query = `query (${batch.map(i => `$t${i}: String`).join(', ')}) {${batch.map(i =>
` s${i}: Page(perPage: 1) { media(search: $t${i}, type: ANIME, status_in: [RELEASING, NOT_YET_RELEASED], sort: SEARCH_MATCH) { ${fields} } }`).join('')} }`;
const data = await anilist(query, Object.fromEntries(batch.map(i => [`t${i}`, shows[i].romaji || shows[i].english])));
for (const i of batch) result[i] = data[`s${i}`]?.media?.[0] || null;
}
return result;
}
async function seasonplanBusy(data) {
const html = await (await fetch(SHEET + '/htmlview')).text();
const gid = html.match(/\{name: "Seasonpl(?:ä|\\u00e4)ne", pageUrl: "[^"]*gid=(\d+)/)?.[1];
if (!gid) return [];
const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`);
if (!res.ok) return [];
const v = parseCsv(await res.text()).map(r => r.map(c => c.trim()));
const titles = data.shows.flatMap(s => [norm(s.title), norm(s.sheetTitle)]).filter(Boolean);
const blockPeople = name => name.split(/\s*(?:&|,|\+|\bund\b)\s*/i).map(n => norm(n) === 'blau' ? 'blue' : norm(n))
.flatMap(n => data.people.filter(p => n && norm(p) === n));
const ranges = [];
for (let r = 0; r < v.length; r++)
for (let c = 1; c < v[r].length; c++) {
if (norm(v[r][c]) !== 'montag') continue;
let name = '';
for (let up = r - 1; up >= 0 && !name; up--) name = v[up][c - 1] || v[up][c] || '';
const who = blockPeople(name);
if (!who.length) continue;
const entries = [];
for (let x = r + 1; x < v.length; x++) {
const time = minutesOf(v[x][c - 1]);
if (time === null) continue;
for (let d = 0; d < 7; d++) if (v[x][c + d]) entries.push({ d, time, text: v[x][c + d] });
}
const anime = e => e.text.split(/[^A-Za-zÄÖÜäöüß0-9]+/).some(w => w.length >= 4 && titles.some(t => t.includes(norm(w))));
if (!entries.length || entries.filter(anime).length / entries.length >= 0.3) continue;
entries.sort((a, b) => a.d - b.d || a.time - b.time);
for (const e of entries) {
const last = ranges[ranges.length - 1];
if (last && last.c === c && last.d === e.d && last.note === e.text && last.to === e.time) last.to = e.time + SLOT_LENGTH;
else ranges.push({ c, who, d: e.d, from: e.time, to: e.time + SLOT_LENGTH, note: e.text });
}
}
return ranges.flatMap(r => r.who.map(person => ({ person, day: r.d, from: clock(r.from), to: clock(r.to), note: r.note })));
}
function planContext(data) {
const everyone = data.people.reduce((mask, p, b) => mask | (1 << b), 0);
const maskOf = person => person === EVERYONE ? everyone : data.people.includes(person) ? 1 << data.people.indexOf(person) : 0;
const standard = minutesOf(planStarts.standard) ?? 19 * 60;
const starts = PLAN_DAYS.map((day, d) => minutesOf(planStarts.days[d]) ?? standard);
const busy = (planBusy || []).map(e => ({ mask: maskOf(e.person), all: e.person === EVERYONE, day: Number(e.day), from: minutesOf(e.from), to: minutesOf(e.to) }))
.filter(e => e.mask);
const overlaps = (e, at) => e.from === null || e.to === null || (at < e.to && at + SLOT_LENGTH > e.from);
const times = starts.map((start, d) => {
const list = [];
for (let at = start; list.length < MAX_SLOTS; at += SLOT_LENGTH)
if (!busy.some(e => e.all && e.day === d && e.from !== null && e.to !== null && overlaps(e, at))) list.push(at);
return list;
});
const busyMask = times.map((list, d) => list.map(at => {
let mask = 0;
for (const [person, days] of Object.entries(planUnavailable)) if (days.includes(d)) mask |= maskOf(person);
for (const e of busy) if (e.day === d && overlaps(e, at)) mask |= e.mask;
for (const [person, until] of Object.entries(planUntil))
if (minutesOf(until) !== null && at + SLOT_LENGTH > minutesOf(until)) mask |= maskOf(person);
return mask;
}));
const fixed = data.shows.map(s => {
const f = planFixed.find(f => f.show === s.sheetTitle);
if (!f) return s.current && s.current.min === null && !s.current.slot ? { day: s.current.day, slot: null, dayOnly: true } : null;
const day = f.day === 'release' ? s.release?.day ?? s.current?.day ?? null : Number(f.day);
const slot = Number(f.slot) > 0 ? Number(f.slot) - 1 : null;
if (f.slot === 'none' && day !== null) return { day, slot: null, dayOnly: true };
return day === null && slot === null ? null : { day, slot };
});
const active = data.shows.map((s, i) => i).filter(i => !fixed[i]?.dayOnly);
const dayOnly = PLAN_DAYS.map((day, d) => data.shows.map((s, i) => i).filter(i => fixed[i]?.dayOnly && fixed[i].day === d));
const breakWeight = data.people.map(p => BREAK_WEIGHT[planBreaks[p]] ?? 1);
return { shows: data.shows, people: data.people, times, busy: busyMask, fixed, active, dayOnly, breakWeight, moveCost: MOVE_COST[planMoves] };
}
function planCost(plan, ctx, details = false) {
const { shows, times, people, busy, fixed, moveCost, breakWeight } = ctx;
let cost = 0, breaks = 0, moved = 0;
const personBreaks = details ? people.map(() => []) : null;
const problems = details ? [] : null;
for (let d = 0; d < 7; d++) {
const slots = plan[d];
const at = k => times[d][Math.min(k, MAX_SLOTS - 1)] + SLOT_LENGTH * Math.max(0, k - MAX_SLOTS + 1);
cost += PLAN_COST.slot * slots.length;
const masks = slots.map(slot => slot.reduce((mask, i) => mask | shows[i].mask, 0));
for (let k = 0; k < slots.length; k++) {
if (at(k) >= LATE_FROM) cost += PLAN_COST.late;
for (const i of slots[k]) {
const s = shows[i];
const clash = s.mask & busy[d][Math.min(k, MAX_SLOTS - 1)];
if (clash) {
cost += PLAN_COST.hard;
if (details) problems.push(`${s.title}: ${people.filter((p, b) => clash & (1 << b)).join(', ')} kann ${PLAN_DAYS_SHORT[d]} ${clock(at(k))} nicht`);
}
if (s.release) {
const delay = (d - s.release.day + 7) % 7;
if (delay === 0 && at(k) < s.release.min) {
cost += PLAN_COST.hard;
if (details) problems.push(`${s.title}: erst ab ${clock(s.release.min)} draußen`);
}
if (delay) { cost += PLAN_COST.delay * delay + moveCost; moved++; }
}
if (s.current && s.current.day !== d) cost += PLAN_COST.keep;
const f = fixed[i];
if (f && f.day !== null && f.day !== d) {
cost += PLAN_COST.hard;
if (details) problems.push(`${s.title}: auf ${PLAN_DAYS_SHORT[f.day]} festgelegt`);
}
if (f && f.slot !== null && f.slot !== k) {
cost += PLAN_COST.hard;
if (details) problems.push(`${s.title}: auf Slot ${f.slot + 1} festgelegt`);
}
}
}
for (let p = 0; p < people.length; p++) {
const bit = 1 << p;
let first = -1, last = -1, count = 0;
const filled = masks.filter((m, k) => slots[k].length);   // an empty slot is a break set by hand: not counted
for (let k = 0; k < filled.length; k++)
if (filled[k] & bit) { if (first < 0) first = k; last = k; count++; }
const gaps = first < 0 ? 0 : last - first + 1 - count;
if (!gaps) continue;
cost += (PLAN_COST.gap * gaps + PLAN_COST.gapSquared * gaps * gaps) * breakWeight[p];
breaks += gaps;
if (details) personBreaks[p].push({ day: d, gaps });
}
}
return details ? { cost, breaks, moved, personBreaks, problems } : cost;
}
function startPlan(ctx, shuffle) {
const plan = [[], [], [], [], [], [], []];
const order = ctx.active.slice();
if (shuffle) order.sort(() => Math.random() - 0.5);
for (const i of order) {
const s = ctx.shows[i];
let d = s.release ? s.release.day : s.current ? s.current.day : Math.floor(Math.random() * 7);
for (let t = 0; t < 7 && (s.mask & ctx.busy[d][0]); t++) d = (d + 1) % 7;
if (ctx.fixed[i]?.day != null) d = ctx.fixed[i].day;
plan[d].push([i]);
}
for (const day of plan) day.sort((a, b) => (ctx.shows[a[0]].release?.min ?? 0) - (ctx.shows[b[0]].release?.min ?? 0));
for (const day of plan) {
const pinned = day.filter(([i]) => ctx.fixed[i]?.slot != null).sort((a, b) => ctx.fixed[a[0]].slot - ctx.fixed[b[0]].slot);
for (const slot of pinned) {
day.splice(day.indexOf(slot), 1);
day.splice(Math.min(ctx.fixed[slot[0]].slot, day.length), 0, slot);
}
}
return plan;
}
function changePlan(plan, ctx) {
const { shows, active } = ctx;
if (!active.length) return null;
const next = plan.map(day => day.map(slot => slot.slice()));
const pickShow = () => active[Math.floor(Math.random() * active.length)];
const where = i => {
for (let d = 0; d < 7; d++)
for (let k = 0; k < next[d].length; k++)
if (next[d][k].includes(i)) return [d, k];
};
const slotMask = slot => slot.reduce((mask, i) => mask | shows[i].mask, 0);
const apart = slot => slot.reduce((sum, i) => sum + bits(shows[i].mask), 0) === bits(slotMask(slot));
const fits = (slot, i) => slot.length < MAX_SIDE_BY_SIDE && !(slotMask(slot) & shows[i].mask);
const r = Math.random();
if (r < 0.6) {
const i = pickShow();
const [d, k] = where(i);
next[d][k].splice(next[d][k].indexOf(i), 1);
if (!next[d][k].length) next[d].splice(k, 1);
const s = shows[i];
const pick = Math.random();
const to = ctx.fixed[i]?.day != null ? ctx.fixed[i].day
: pick < 0.5 ? d : pick < 0.8 && s.release ? (s.release.day + Math.floor(Math.random() * 2)) % 7 : Math.floor(Math.random() * 7);
const partners = next[to].flatMap((slot, j) => fits(slot, i) ? [j] : []);
if (partners.length && Math.random() < 0.45) next[to][partners[Math.floor(Math.random() * partners.length)]].push(i);
else next[to].splice(Math.floor(Math.random() * (next[to].length + 1)), 0, [i]);
} else if (r < 0.8) {
const d = Math.floor(Math.random() * 7);
if (next[d].length < 2) return null;
const a = Math.floor(Math.random() * next[d].length), b = Math.floor(Math.random() * next[d].length);
if (a === b) return null;
[next[d][a], next[d][b]] = [next[d][b], next[d][a]];
} else {
const a = pickShow(), b = pickShow();
const [da, ka] = where(a), [db, kb] = where(b);
if (da === db && ka === kb) return null;
const sa = next[da][ka], sb = next[db][kb];
sa[sa.indexOf(a)] = b;
sb[sb.indexOf(b)] = a;
if (!apart(sa) || !apart(sb)) return null;
}
return next;
}
async function findPlan(ctx, onProgress) {
const RUNS = 4, STEPS = 80000;
let best = null, bestCost = Infinity;
for (let run = 0; run < RUNS; run++) {
let plan = startPlan(ctx, run > 0);
let cost = planCost(plan, ctx);
for (let step = 0; step < STEPS; step++) {
if (step % 5000 === 0) { onProgress((run * STEPS + step) / (RUNS * STEPS)); await new Promise(r => setTimeout(r)); }
const temperature = 40 * Math.pow(0.2 / 40, step / STEPS);
const next = changePlan(plan, ctx);
if (!next) continue;
const c = planCost(next, ctx);
if (c <= cost || Math.random() < Math.exp((cost - c) / temperature)) {
plan = next; cost = c;
if (c < bestCost) { best = next; bestCost = c; }
}
}
}
return best || startPlan(ctx, false);
}
function currentPlan(ctx) {
const timeOf = s => !s.current ? null
: s.current.min ?? (s.current.slot ? ctx.times[s.current.day][s.current.slot - 1] ?? null : null);
const days = PLAN_DAYS.map((day, d) => {
const today = ctx.shows.map((s, i) => ({ i, at: s.current?.day === d ? timeOf(s) : null })).filter(x => x.at !== null);
const times = [...new Set(today.map(x => x.at))].sort((a, b) => a - b);
return times.map(at => ({ at, shows: today.filter(x => x.at === at).map(x => x.i) }));
});
const dayOnly = PLAN_DAYS.map((day, d) => ctx.shows.map((s, i) => i).filter(i => ctx.shows[i].current?.day === d && timeOf(ctx.shows[i]) === null));
const plan = days.map(evening => {
const slots = [];
if (!evening.length) return slots;
for (const { at, shows } of evening) {
const k = Math.round((at - evening[0].at) / SLOT_LENGTH);
while (slots.length <= k) slots.push([]);
slots[k].push(...shows);
}
return slots;
});
const unplaced = ctx.shows.map((s, i) => i).filter(i => !ctx.shows[i].current);
return { days, plan, unplaced, dayOnly };
}
async function loadPlanner() {
await ready;
const tab = tabs.find(t => t.gid === planTabGid) || tabs[0] || FALLBACK_TAB;
planTabGid = tab.gid;
$('planSetup').innerHTML = '';
$('planOut').innerHTML = `<div class="status">Lese ${esc(tab.name)} und suche die Release-Zeiten…</div>`;
let data;
try {
data = await plannerData(tab);
} catch (e) {
$('planOut').innerHTML = `<div class="status">Die Plandaten konnten nicht geladen werden (${esc(e.message)}).</div>`;
return;
}
if (!planBusy) {
try { planBusy = await seasonplanBusy(data); } catch { planBusy = []; }
saveSettings();
}
$('planSetup').innerHTML = plannerSetup(data);
$('tabName').textContent = planTest ? 'Testmodus · ausgedachte Stimmen, am Sheet ändert sich nichts' : 'Nur ein Vorschlag · am Guckplan ändert sich nichts';
document.body.classList.toggle('plan-testing', planTest);
bindPlannerSetup(data);
if (planOutcome?.tab === tab.gid) showPlan(data, planOutcome.plan);
else generatePlan(data);
}
let planOpen = { avail: true };
try { planOpen = JSON.parse(localStorage.getItem('planOpen')) || planOpen; } catch {}
const group = (id, title, count, body) => `<details class="plan-group" data-group="${id}"${planOpen[id] ? ' open' : ''}>
    <summary><span>${title}</span>${count ? `<span class="plan-count">${count}</span>` : ''}</summary><div class="plan-group-body">${body}</div></details>`;
function plannerSetup(data) {
const tabOptions = (tabs.length ? tabs : [FALLBACK_TAB]).map(t =>
`<option value="${esc(t.gid)}"${t.gid === data.tab.gid ? ' selected' : ''}>${esc(t.name)}${t.list ? ' (Abstimmung)' : ''}</option>`).join('');
const header = `<span></span>${PLAN_DAYS_SHORT.map(day => `<span class="avail-head">${day}</span>`).join('')}<span class="avail-head" title="Letzte Folge vorbei bis">Bis</span>`;
const starts = `<span class="avail-name everyone" title="Startzeit pro Tag (leer = Standard)">Start</span>${PLAN_DAYS.map((day, d) =>
`<input class="avail-start" data-day="${d}" value="${esc(planStarts.days[d] || '')}" placeholder="${esc(planStarts.standard)}"
      inputmode="numeric" maxlength="5" aria-label="Start am ${day}" title="Start am ${day} (leer = Standard)">`).join('')}<span></span>`;
const grid = [EVERYONE, ...data.people].map(p => `
    <span class="avail-name${p === EVERYONE ? ' everyone' : ''}${data.idle?.has(p) ? ' idle' : ''}" style="${p === EVERYONE ? '' : personStyle(p)}"${data.idle?.has(p) ? ' title="Hat in diesem Tab noch keine Serie gewählt"' : ''}>${p === EVERYONE ? 'Alle' : esc(p)}</span>${PLAN_DAYS_SHORT.map((day, d) =>
`<button class="avail-day" data-person="${esc(p)}" data-day="${d}" aria-pressed="${(planUnavailable[p] || []).includes(d)}"
        title="${p === EVERYONE ? 'Niemand guckt' : esc(p) + ' kann nicht'} am ${PLAN_DAYS[d]}">${day}</button>`).join('')}
      <input class="avail-start avail-until" data-person="${esc(p)}" value="${esc(planUntil[p] || '')}" placeholder="–" inputmode="numeric" maxlength="5"
        aria-label="${p === EVERYONE ? 'Alle' : esc(p)}: letzte Folge vorbei bis" title="${p === EVERYONE ? 'Alle' : esc(p)}: letzte Folge vorbei bis (leer = egal)">`).join('');
const offDays = Object.values(planUnavailable).reduce((n, days) => n + days.length, 0);
const ruleCount = (planMoves !== 'rarely' ? 1 : 0) + Object.keys(planBreaks).length;
return `<div class="plan-setup-head">
      <select id="planTab" class="pill" aria-label="Guckplan">${tabOptions}</select>
      <button id="planRun" class="pill plan-go">Plan erstellen</button>
    </div>
    <div class="plan-test-toggle"><button id="planTestToggle" class="pill" aria-pressed="${planTest}" title="Mit ausgedachten Stimmen planen: nichts geht ins Sheet">Testmodus</button>${planTest ? '<span>Stimmen nur in diesem Browser · Sheet bleibt unverändert</span>' : ''}</div>
    <p id="planStale" class="plan-stale" hidden>Einstellungen geändert. „Neu erstellen“ übernimmt sie.</p>
    ${group('avail', 'Wer kann wann', offDays ? `${offDays}× nicht da` : '', `
      <label class="plan-start">Start <input id="planStandard" class="pill" value="${esc(planStarts.standard)}" inputmode="numeric" maxlength="5" aria-label="Standard-Startzeit"></label>
      <p class="plan-hint">Tag antippen = an dem Tag nicht da. „Bis“ = spätestens fertig um.</p>
      <div class="avail">${header}${starts}${grid}</div>`)}
    ${group('busy', 'Feste Termine', planBusy?.length || '', `
      <p class="plan-hint">Zeiten, in denen jemand nicht kann. „Alle“ lässt die Zeit ganz frei.</p>
      <div id="busyList" class="busy-list">${busyRows(data)}</div>
      <div class="plan-actions busy-actions">
        <button id="busyAdd" class="pill">+ Termin</button>
        <button id="busyReload" class="pill" title="Termine aus dem Tab „Seasonpläne“ übernehmen (ersetzt die Liste)"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Aus Seasonpläne</button>
      </div>`)}
    ${group('fixed', 'Serien festlegen', planFixed.length || '', `
      <p class="plan-hint">Eine Serie auf einen Tag, einen Slot oder nur einen Tag ohne Uhrzeit (z. B. spät nachts) legen.</p>
      <div id="fixedList" class="busy-list">${fixedRows(data)}</div>
      <div class="plan-actions busy-actions"><button id="fixedAdd" class="pill">+ Serie</button></div>`)}
    ${group('rules', 'Regeln', ruleCount || '', `
      <div class="plan-rule"><span>Serien auf einen anderen Tag als den Release legen</span>
      <div class="segmented plan-moves" role="group" aria-label="Andere Tage">${[['ok', 'Wenn es hilft'], ['rarely', 'Selten'], ['never', 'Nie']].map(([v, label]) =>
`<button data-moves="${v}" aria-pressed="${planMoves === v}">${label}</button>`).join('')}</div></div>
      <div class="plan-rule"><span>Pausen: Name antippen. ★ = möglichst keine Pausen, ☕ = Pausen gehen zuerst an sie</span>
      <div class="plan-break-prefs">${data.people.map(p => breakChip(p)).join('')}</div></div>`)}`;
}
const breakChip = p => {
const pref = planBreaks[p] || 'normal';
return `<button class="break-pref ${pref}" data-break-person="${esc(p)}" style="${personStyle(p)}"
    title="Pausen für ${esc(p)}: ${pref === 'protect' ? 'möglichst vermeiden' : pref === 'fine' ? 'gehen zuerst an sie' : 'normal'}">${BREAK_LABEL[pref] ? `${BREAK_LABEL[pref]} ` : ''}${esc(p)}</button>`;
};
const selectOptions = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');
const removeButton = '<button class="round busy-remove" aria-label="Entfernen" title="Entfernen"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
function fixedRows(data) {
if (!planFixed.length) return '<div class="ep busy-empty">Keine.</div>';
const shows = data.shows.map(s => [s.sheetTitle, s.title]).sort((a, b) => a[1].localeCompare(b[1]));
const days = [['release', 'Release-Tag'], ...PLAN_DAYS_SHORT.map((d, j) => [j, d])];
const slots = [['', 'Beliebiger Slot'], ...Array.from({ length: 10 }, (_, k) => [k + 1, `Slot ${k + 1}`]), ['none', 'Nur Tag (ohne Slot)']];
return planFixed.map((f, i) => `
    <div class="busy-row fixed-row" data-i="${i}">
      <select class="pill fixed-show" data-field="show" aria-label="Serie">${selectOptions(shows, f.show)}</select>
      <select class="pill" data-field="day" aria-label="Tag">${selectOptions(days, f.day)}</select>
      <select class="pill" data-field="slot" aria-label="Slot">${selectOptions(slots, f.slot)}</select>
      ${removeButton}
    </div>`).join('');
}
function busyRows(data) {
if (!planBusy?.length) return '<div class="ep busy-empty">Keine.</div>';
const who = [[EVERYONE, 'Alle'], ...data.people.map(p => [p, p])];
return planBusy.map((e, i) => `
    <div class="busy-row" data-i="${i}">
      <select class="pill" data-field="person" aria-label="Wer">${selectOptions(who, e.person)}</select>
      <select class="pill" data-field="day" aria-label="Tag">${selectOptions(PLAN_DAYS_SHORT.map((d, j) => [j, d]), e.day)}</select>
      <input class="pill busy-time" data-field="from" value="${esc(e.from || '')}" placeholder="von" inputmode="numeric" maxlength="5" aria-label="Von">
      <input class="pill busy-time" data-field="to" value="${esc(e.to || '')}" placeholder="bis" inputmode="numeric" maxlength="5" aria-label="Bis">
      ${removeButton}
      <input class="pill busy-note" data-field="note" value="${esc(e.note || '')}" placeholder="Notiz" aria-label="Notiz">
    </div>`).join('');
}
function bindPlannerSetup(data) {
$('planTab').onchange = () => { planTabGid = $('planTab').value; planOutcome = null; loadPlanner(); };
for (const d of document.querySelectorAll('.plan-group'))
d.ontoggle = () => { planOpen[d.dataset.group] = d.open; try { localStorage.setItem('planOpen', JSON.stringify(planOpen)); } catch {} };
const count = (id, n) => {
const summary = document.querySelector(`[data-group="${id}"] summary`);
summary.querySelector('.plan-count')?.remove();
if (n) summary.insertAdjacentHTML('beforeend', `<span class="plan-count">${n}</span>`);
};
const recount = () => {
const offDays = Object.values(planUnavailable).reduce((n, days) => n + days.length, 0);
count('avail', offDays ? `${offDays}× nicht da` : '');
count('busy', planBusy.length);
count('fixed', planFixed.length);
count('rules', (planMoves !== 'rarely' ? 1 : 0) + Object.keys(planBreaks).length);
};
const changed = () => { saveSettings(); recount(); };
$('planStandard').onchange = () => {
planStarts.standard = minutesOf($('planStandard').value) !== null ? $('planStandard').value : '19:00';
$('planStandard').value = planStarts.standard;
for (const input of document.querySelectorAll('.avail-start:not(.avail-until)')) input.placeholder = planStarts.standard;
changed();
};
for (const input of document.querySelectorAll('.avail-until'))
input.onchange = () => {
const p = input.dataset.person;
if (minutesOf(input.value) !== null) planUntil[p] = input.value; else delete planUntil[p];
input.value = planUntil[p] || '';
changed();
};
for (const input of document.querySelectorAll('.avail-start:not(.avail-until)'))
input.onchange = () => {
planStarts.days[Number(input.dataset.day)] = minutesOf(input.value) !== null ? input.value : '';
input.value = planStarts.days[Number(input.dataset.day)];
changed();
};
for (const b of document.querySelectorAll('.avail-day'))
b.onclick = () => {
const days = new Set(planUnavailable[b.dataset.person] || []);
const d = Number(b.dataset.day);
days.has(d) ? days.delete(d) : days.add(d);
planUnavailable[b.dataset.person] = [...days].sort();
b.setAttribute('aria-pressed', days.has(d));
changed();
};
const redrawBusy = () => { $('busyList').innerHTML = busyRows(data); bindBusy(); };
const bindBusy = () => {
for (const row of document.querySelectorAll('#busyList .busy-row')) {
const e = planBusy[Number(row.dataset.i)];
for (const field of row.querySelectorAll('[data-field]'))
field.onchange = () => { e[field.dataset.field] = field.dataset.field === 'day' ? Number(field.value) : field.value; changed(); };
row.querySelector('.busy-remove').onclick = () => { planBusy.splice(Number(row.dataset.i), 1); changed(); redrawBusy(); };
}
};
bindBusy();
$('busyAdd').onclick = () => { planBusy.push({ person: EVERYONE, day: 0, from: '', to: '', note: '' }); changed(); redrawBusy(); };
$('busyReload').onclick = async () => {
try { planBusy = await seasonplanBusy(data); } catch { notice('Seasonpläne konnte nicht gelesen werden'); return; }
changed();
redrawBusy();
notice('Termine aus Seasonpläne übernommen');
};
for (const b of document.querySelectorAll('[data-moves]'))
b.onclick = () => {
planMoves = b.dataset.moves;
for (const o of document.querySelectorAll('[data-moves]')) o.setAttribute('aria-pressed', o === b);
changed();
};
const NEXT_PREF = { normal: 'protect', protect: 'fine', fine: 'normal' };
for (const b of document.querySelectorAll('[data-break-person]'))
b.onclick = () => {
const p = b.dataset.breakPerson;
const pref = NEXT_PREF[planBreaks[p] || 'normal'];
if (pref === 'normal') delete planBreaks[p]; else planBreaks[p] = pref;
changed();
b.outerHTML = breakChip(p);
bindPlannerSetup(data);
};
const redrawFixed = () => { $('fixedList').innerHTML = fixedRows(data); bindFixed(); };
const bindFixed = () => {
for (const row of document.querySelectorAll('#fixedList .busy-row')) {
const f = planFixed[Number(row.dataset.i)];
for (const field of row.querySelectorAll('[data-field]'))
field.onchange = () => {
const v = field.value;
f[field.dataset.field] = field.dataset.field === 'show' || v === 'release' || v === 'none' || v === '' ? v : Number(v);
changed();
};
row.querySelector('.busy-remove').onclick = () => { planFixed.splice(Number(row.dataset.i), 1); changed(); redrawFixed(); };
}
};
bindFixed();
$('fixedAdd').onclick = () => {
const free = data.shows.find(s => !planFixed.some(f => f.show === s.sheetTitle));
if (!free) return;
planFixed.push({ show: free.sheetTitle, day: 'release', slot: '' });
changed();
redrawFixed();
};
$('planRun').onclick = () => { if (testDirty) { testDirty = false; planOutcome = null; loadPlanner(); } else generatePlan(data); };
$('planTestToggle').onclick = () => {
planTest = !planTest;
try { localStorage.setItem('planTest', planTest); } catch {}
testDirty = false; planOutcome = null; planHistory = [];
loadPlanner();
};
}
// after a settings change the shown plan is outdated: say so at the button
function markStale() {
if (!planOutcome || !$('planStale')) return;
$('planStale').hidden = false;
$('planRun').textContent = 'Neu erstellen';
$('planRun').classList.add('stale');
}
// compact rows: one line per slot, like the main plan's compact setting (taken from there until changed here)
let planDense = false;
try { planDense = (localStorage.getItem('planDense') ?? (localStorage.getItem('density') === 'compact' ? 'true' : 'false')) === 'true'; } catch {}
let testDirty = false;  // test votes changed since the plan was made
let keepFresh = false;  // a start shift from the plan itself doesn't make the plan outdated
let planHistory = [];   // earlier versions of the suggestion while it is edited by hand (Rückgängig)
let planDrag = null;    // the shown plan, for drag and drop
// Test mode: the votes table (shows × people). A cell cycles Ja → Vielleicht → Nein → Default.
const TEST_CYCLE = ['Ja', 'Vielleicht', 'Nein', 'Default'];
const TEST_MARK = { ja: ['✓', 'yes'], vielleicht: ['?', 'maybe'], nein: ['✕', 'no'] };
const testCell = value => TEST_MARK[norm(value || '')] || ['·', 'none'];
function testPanel(data) {
const override = testVotes(data.tab), real = data.real;
const shows = real.shows.filter(s => !s.hidden);
const changed = Object.values(override).reduce((n, v) => n + Object.keys(v).length, 0);
let open = true;
try { open = localStorage.getItem('planTestOpen') !== 'false'; } catch {}
return `<details class="plan-test" id="planTestPanel"${open ? ' open' : ''}><summary><h2>Test-Stimmen <span class="plan-count" id="planTestCount">${changed ? `${changed} geändert` : 'wie im Sheet'}</span></h2></summary>
    <p class="plan-hint">Zelle antippen: ✓ Ja → ? Vielleicht → ✕ Nein → · Default. Danach „Neu erstellen“.</p>
    <div class="plan-actions plan-test-actions"><button type="button" class="pill" data-test-fill="random">Zufällig füllen</button><button type="button" class="pill" data-test-fill="no">Alle auf Nein</button><button type="button" class="pill" data-test-fill="sheet">Wie im Sheet</button></div>
    <div class="plan-test-scroll"><table class="plan-test-table"><thead><tr><th></th>${real.people.map(p => `<th><span style="${personStyle(p)}">${esc(p)}</span></th>`).join('')}</tr></thead>
    <tbody>${shows.map((s, i) => `<tr><th title="${esc(s.english || s.romaji)}">${esc(s.english || s.romaji)}</th>${real.people.map(p => {
      const value = override[showKey(s)]?.[p] ?? s.votes[p] ?? '';
      const [mark, cls] = testCell(value);
      return `<td><button type="button" class="test-vote ${cls}${override[showKey(s)]?.[p] !== undefined ? ' edited' : ''}" data-test-show="${i}" data-test-person="${esc(p)}" title="${esc(p)}: ${esc(value || 'leer')}">${mark}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function bindTestPanel(data) {
const real = data.real, shows = real.shows.filter(s => !s.hidden);
const changedNow = () => {
const n = Object.values(testVotes(data.tab)).reduce((n, v) => n + Object.keys(v).length, 0);
$('planTestCount').textContent = n ? `${n} geändert` : 'wie im Sheet';
testDirty = true;
$('planStale').textContent = 'Test-Stimmen geändert. „Neu erstellen“ übernimmt sie.';
$('planStale').hidden = false;
$('planRun').textContent = 'Neu erstellen';
$('planRun').classList.add('stale');
};
$('planTestPanel').ontoggle = () => { try { localStorage.setItem('planTestOpen', $('planTestPanel').open); } catch {} };
for (const b of document.querySelectorAll('[data-test-show]'))
b.onclick = () => {
const s = shows[Number(b.dataset.testShow)], p = b.dataset.testPerson, key = showKey(s);
const votes = testVotes(data.tab);
const now = votes[key]?.[p] ?? s.votes[p] ?? '';
const at = TEST_CYCLE.findIndex(v => norm(v) === norm(now));
const next = TEST_CYCLE[(at + 1) % TEST_CYCLE.length];
votes[key] = { ...votes[key], [p]: next };
if (norm(next) === norm(s.votes[p] || '') || (next === 'Default' && !s.votes[p])) delete votes[key][p];
if (!Object.keys(votes[key]).length) delete votes[key];
saveTestVotes(data.tab, votes);
const [mark, cls] = testCell(next);
b.className = `test-vote ${cls}${votes[key]?.[p] !== undefined ? ' edited' : ''}`;
b.textContent = mark;
b.title = `${p}: ${next}`;
changedNow();
};
for (const b of document.querySelectorAll('[data-test-fill]'))
b.onclick = () => {
const fill = b.dataset.testFill, votes = {};
if (fill !== 'sheet')
for (const s of shows) votes[showKey(s)] = Object.fromEntries(real.people.map(p => {
const r = Math.random();
return [p, fill === 'no' ? 'Nein' : r < 0.35 ? 'Ja' : r < 0.45 ? 'Vielleicht' : r < 0.85 ? 'Nein' : 'Default'];
}));
saveTestVotes(data.tab, votes);
testDirty = false; planOutcome = null; planHistory = [];
loadPlanner();
notice(fill === 'sheet' ? 'Test-Stimmen wie im Sheet' : fill === 'no' ? 'Alle auf Nein gesetzt' : 'Zufällig gefüllt');
};
}
async function generatePlan(data) {
const out = $('planOut');
if (!out) return;
if (!data.shows.length) { out.innerHTML = (planTest ? testPanel(data) : '') + '<div class="status">In diesem Tab hat noch niemand eine Serie gewählt.</div>'; if (planTest) bindTestPanel(data); return; }
$('planRun').disabled = true;
out.style.minHeight = out.offsetHeight + 'px';
out.innerHTML = '<div class="status plan-busy">Probiere Pläne aus… <span class="plan-progress"><span id="planProgress"></span></span></div>';
const ctx = planContext(data);
const plan = await findPlan(ctx, f => { const el = $('planProgress'); if (el) el.style.width = Math.round(f * 100) + '%'; });
if (!$('planOut')) return;
$('planRun').disabled = false;
$('planRun').textContent = 'Neu erstellen';
$('planRun').classList.remove('stale');
$('planStale').hidden = true;
planOutcome = { tab: data.tab.gid, plan };
planHistory = [];
showPlan(data, plan);
out.style.minHeight = '';
}
function showPlan(data, plan) {
const ctx = planContext(data);
const { shows, times } = ctx;
const result = planCost(plan, ctx, true);
const now = currentPlan(ctx);
const nowResult = planCost(now.plan, ctx, true);
const endOf = days => Math.max(0, ...days.filter(Boolean));
const ends = plan.map((slots, d) => slots.length ? times[d][slots.length - 1] + SLOT_LENGTH : 0);
const nowEnds = now.days.map(evening => evening.length ? evening[evening.length - 1].at + SLOT_LENGTH : 0);
const sideBySide = p => p.flat().filter(slot => slot.length > 1).length;
const nowMoved = shows.filter(s => s.release && s.current && s.current.day !== s.release.day).length;
// where each show is now and in the suggestion: { d, at } (at null = day only)
const was = new Map(), will = new Map();
now.days.forEach((evening, d) => evening.forEach(({ at, shows: slot }) => slot.forEach(i => was.set(i, { d, at }))));
now.dayOnly.forEach((list, d) => list.forEach(i => was.set(i, { d, at: null })));
plan.forEach((slots, d) => slots.forEach((slot, k) => slot.forEach(i => will.set(i, { d, at: times[d][k] }))));
ctx.dayOnly.forEach((list, d) => list.forEach(i => will.set(i, { d, at: null })));
const when = w => w ? `${PLAN_DAYS_SHORT[w.d]} ${w.at === null ? '(ohne Zeit)' : clock(w.at)}` : 'noch kein Tag';
const changes = [...will].filter(([i, w]) => { const o = was.get(i); return !o || o.d !== w.d || o.at !== w.at; })
.sort((a, b) => a[1].d - b[1].d || (a[1].at ?? 9999) - (b[1].at ?? 9999));
const changedSet = new Set(changes.map(([i]) => i));
const tile = (value, label, before, better) => `<div class="plan-tile ${better}"><b>${value}</b><span>${label}</span><small>jetzt ${before}</small></div>`;
const cmp = (a, b) => a < b ? 'better' : a > b ? 'worse' : '';
const latest = endOf(ends), nowLatest = endOf(nowEnds);
const stats = `<div class="plan-stats">
    ${tile(result.breaks, result.breaks === 1 ? 'Pause' : 'Pausen', nowResult.breaks, cmp(result.breaks, nowResult.breaks))}
    ${tile(result.moved, 'nicht am Release-Tag', nowMoved, cmp(result.moved, nowMoved))}
    ${tile(sideBySide(plan), 'Slots parallel', sideBySide(now.plan), '')}
    ${tile(latest ? clock(latest) : '–', 'spätestes Ende', nowLatest ? clock(nowLatest) : '–', nowLatest ? cmp(latest, nowLatest) : '')}
  </div>`;
const problems = result.problems.length ? `<details class="warning" open><summary>${result.problems.length} ${result.problems.length === 1 ? 'Serie passt' : 'Serien passen'} nirgends sauber</summary>
    <ul>${result.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : '';
const chips = people => `<span class="who">${people.map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span>`;
const changesOpen = (() => { try { return localStorage.getItem('planChangesOpen') !== 'false'; } catch { return true; } })();
const changeList = `<details class="plan-changes" id="planChanges"${changesOpen ? ' open' : ''}><summary><h2>Was sich ändert <span class="plan-count">${changes.length}</span></h2></summary>${changes.length
? `<ul>${changes.map(([i, w]) => { const o = was.get(i), otherDay = !o || o.d !== w.d;
return `<li class="${otherDay ? 'other-day' : ''}"><b>${esc(shows[i].title)}</b><span class="plan-from">${when(o)}</span><span class="plan-arrow" aria-label="wird zu">→</span><span class="plan-to">${when(w)}</span></li>`; }).join('')}</ul>`
: '<p class="ep">Nichts. Der Vorschlag entspricht dem aktuellen Guckplan.</p>'}</details>`;
const showInfo = (i, d, mark) => {
const s = shows[i];
const notes = [];
if (s.release) {
notes.push(`raus ${PLAN_DAYS_SHORT[s.release.day]} ${clock(s.release.min)}`);
const delay = d < 0 ? 0 : (d - s.release.day + 7) % 7;
if (delay) notes.push(`<span class="plan-moved">+${delay} ${delay === 1 ? 'Tag' : 'Tage'}</span>`);
} else notes.push('kein wöchentlicher Release');
if (s.short) notes.push('kurz');
if (ctx.fixed[i]?.dayOnly) notes.push('nur Tag');
else if (ctx.fixed[i]) notes.push('📌 festgelegt');
if (mark && changedSet.has(i)) notes.push(`<span class="plan-was">vorher ${when(was.get(i))}</span>`);
const drag = mark && !ctx.fixed[i]?.dayOnly ? ` draggable="true" data-show="${i}" title="Ziehen: auf eine Lücke = eigener Slot, auf eine Serie = parallel"` : '';
return `<div class="info"${drag}><div class="title">${esc(s.title)}</div><div class="ep">${notes.join(' · ')}${chips(s.people)}</div></div>`;
};
const row = (at, label, slot, d, mark, k, extra = '') => `
    <div class="row plan-row${mark && slot.some(i => changedSet.has(i)) ? ' changed' : ''}"${mark ? ` data-day="${d}" data-slot="${k}"` : ''}>
      <div class="time">${clock(at)}${label ? `<small>${label}</small>` : ''}</div>
      <div class="plan-slot${slot.length > 1 ? ' pair' : ''}">${slot.map(i => showInfo(i, d, mark)).join('<div class="plan-or">‖</div>')}</div>${extra}
    </div>`;
const dayOnlyRows = (list, d, mark) => list.map(i => `
    <div class="row plan-row${mark && changedSet.has(i) ? ' changed' : ''}">
      <div class="time">–<small>ohne Slot</small></div>
      <div class="plan-slot">${showInfo(i, d, mark)}</div>
    </div>`).join('');
const gap = (d, k) => `<div class="plan-drop" data-day="${d}" data-at="${k}" aria-hidden="true"></div>`;
const pauseRow = (d, k) => `
    <div class="row plan-row plan-pause" data-day="${d}" data-slot="${k}">
      <div class="time">${clock(times[d][k])}<small>Slot ${k + 1}</small></div>
      <div class="plan-slot"><span class="plan-pause-label">Pause</span><button type="button" class="round" data-unpause="${d}:${k}" aria-label="Pause entfernen" title="Pause entfernen">×</button></div>
    </div>`;
const addPause = (d, k) => k < plan[d].length - 1 ? `<button type="button" class="plan-add-pause" data-pause="${d}:${k}" title="Nach diesem Slot 30 Minuten Pause">+ Pause</button>` : '';
const suggestionDay = d => !plan[d].length ? `<div class="plan-drop empty" data-day="${d}" data-at="0">Nichts · Serie hierher ziehen</div>` + dayOnlyRows(ctx.dayOnly[d], d, true) : plan[d].map((slot, k) => gap(d, k) + (slot.length ? row(times[d][k], `Slot ${k + 1}`, slot, d, true, k, addPause(d, k)) : pauseRow(d, k))).join('') + gap(d, plan[d].length) + dayOnlyRows(ctx.dayOnly[d], d, true);
const nowDay = d => now.days[d].map(({ at, shows: slot }) => row(at, '', slot, d)).join('') + dayOnlyRows(now.dayOnly[d], d);
const span = (from, to) => from === null ? '' : `<span class="plan-span">${clock(from)}–${clock(to)}</span>`;
const days = PLAN_DAYS.map((day, d) => {
const shift = `<span class="plan-shift" role="group" aria-label="Start am ${day}"><button type="button" class="round" data-shift-day="${d}" data-shift="-30" title="${day}: 30 Minuten früher anfangen" aria-label="Früher anfangen">−</button><button type="button" class="round" data-shift-day="${d}" data-shift="30" title="${day}: 30 Minuten später anfangen" aria-label="Später anfangen">+</button></span>`;
const mine = (plan[d].length ? span(times[d][0], ends[d]) : '') + (plan[d].length ? shift : '');
const theirs = now.days[d].length ? span(now.days[d][0].at, nowEnds[d]) : '';
const hasTheirs = now.days[d].length || now.dayOnly[d].length;
if (planView === 'suggestion') return `<section class="day"><h2><b>${day}</b> ${mine}</h2>${suggestionDay(d)}</section>`;
if (planView === 'now') return hasTheirs ? `<section class="day"><h2><b>${day}</b> ${theirs}</h2>${nowDay(d)}</section>` : '';
return `<section class="day"><h2><b>${day}</b></h2><div class="plan-compare">
      <div><div class="plan-side">Aktuell ${theirs}</div>${nowDay(d) || '<div class="ep plan-none">Nichts</div>'}</div>
      <div><div class="plan-side">Vorschlag ${mine}</div>${suggestionDay(d)}</div>
    </div></section>`;
}).join('');
const unplaced = planView !== 'suggestion' && now.unplaced.length
? `<section class="day"><h2><b>Noch ohne Tag im Guckplan</b></h2>${now.unplaced.map(i => `<div class="row plan-row"><div class="time">–</div><div class="plan-slot">${showInfo(i, -1)}</div></div>`).join('')}</section>` : '';
const breakList = (r, label) => {
const list = data.people.map((p, b) => ({ p, list: r.personBreaks[b] })).filter(x => x.list.length);
return `<div class="plan-breaks"><span class="plan-side">${label}</span>${list.length
? list.map(({ p, list }) => `<span class="plan-break"><span class="who"><span style="${personStyle(p)}">${esc(p)}</span></span>
          ${list.map(x => `${PLAN_DAYS_SHORT[x.day]}${x.gaps > 1 ? ` ×${x.gaps}` : ''}`).join(', ')}</span>`).join('')
: '<span class="ep">niemand</span>'}</div>`;
};
const breaks = `<section class="day"><h2><b>Pausen</b></h2>${breakList(result, 'Vorschlag')}${breakList(nowResult, 'Aktuell')}</section>`;
const views = [['compare', 'Vergleich'], ['suggestion', 'Vorschlag'], ['now', 'Aktuell']];
const actions = `<div class="plan-actions plan-toolbar">
    <div class="segmented plan-views" role="group" aria-label="Ansicht">${views.map(([v, label]) =>
`<button data-plan-view="${v}" aria-pressed="${planView === v}">${label}</button>`).join('')}</div>
    ${planHistory.length ? `<span class="plan-edited">Von Hand angepasst</span><button id="planUndo" class="pill">Rückgängig</button>` : `<span class="plan-hint plan-drag-hint">Serien im Vorschlag lassen sich verschieben</span>`}
    <button id="planDense" class="pill" aria-pressed="${planDense}" title="Eine Zeile pro Slot: alle Serien eines Tages auf einen Blick">Kompakt</button>
    <button id="planAgain" class="pill" title="Noch einmal rechnen: oft gibt es mehrere gleich gute Pläne">Anderer Vorschlag</button>
    ${planTest ? '<button class="pill" disabled title="Im Testmodus gesperrt: die Stimmen sind ausgedacht">Übernehmen gesperrt</button>' : ''}<div class="plan-export"${planTest ? ' hidden' : ''}><button id="planExport" class="pill plan-go" aria-haspopup="true" aria-expanded="false" aria-controls="planExportMenu">Übernehmen <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div id="planExportMenu" class="popover plan-export-menu" hidden>
        <button id="planSheet"><b>Für den Season-Helfer kopieren</b><small>Im Sheet: Season-Helfer → „3. Watch-Plan einfügen“, dann einfügen</small></button>
        <button id="planXlsx"><b>Als .xlsx herunterladen</b><small>Im Sheet: Datei → Importieren → „Neue Tabellenblätter einfügen“</small></button>
        <button id="planCopy"><b>Als Tabelle kopieren</b><small>Titel, Tag, Uhrzeit, Slot: zum Einfügen irgendwo</small></button>
      </div></div></div>`;
$('planOut').classList.toggle('dense', planDense);
$('planOut').innerHTML = (planTest ? testPanel(data) : '') + problems + stats + changeList + actions + days + unplaced + breaks;
const cells = [...document.querySelectorAll('#planOut .time')];
document.body.style.setProperty('--time-width', Math.max(0, ...cells.map(t => t.scrollWidth)) + 'px');
$('planAgain').onclick = () => generatePlan(data);
if (planTest) bindTestPanel(data);
$('planDense').onclick = () => { planDense = !planDense; try { localStorage.setItem('planDense', planDense); } catch {} showPlan(data, plan); };
$('planChanges').ontoggle = () => { try { localStorage.setItem('planChangesOpen', $('planChanges').open); } catch {} };
for (const b of document.querySelectorAll('[data-shift-day]'))
b.onclick = () => {
// earlier / later start for that evening: the day's own start in the settings, the plan stays as it is
const d = Number(b.dataset.shiftDay);
const from = minutesOf(planStarts.days[d]) ?? minutesOf(planStarts.standard) ?? 19 * 60;
const to = Math.min(Math.max(from + Number(b.dataset.shift), 12 * 60), 26 * 60);
planStarts.days[d] = to === minutesOf(planStarts.standard) ? '' : clock(to);
const input = document.querySelector(`.avail-start[data-day="${d}"]`);
if (input) input.value = planStarts.days[d];
keepFresh = true; saveSettings(); keepFresh = false;
showPlan(data, plan);
};
const edit = change => { const next = plan.map(day => day.map(slot => slot.slice())); change(next); trimBreaks(next); planHistory.push(plan); planOutcome.plan = next; showPlan(data, next); };
for (const b of document.querySelectorAll('[data-pause]'))
b.onclick = () => { const [d, k] = b.dataset.pause.split(':').map(Number); edit(next => next[d].splice(k + 1, 0, [])); };
for (const b of document.querySelectorAll('[data-unpause]'))
b.onclick = () => { const [d, k] = b.dataset.unpause.split(':').map(Number); edit(next => next[d].splice(k, 1)); };
if ($('planUndo')) $('planUndo').onclick = () => { const before = planHistory.pop(); if (!before) return; planOutcome.plan = before; showPlan(data, before); };
planDrag = { data, plan };
tapped = null; document.body.classList.remove('plan-dragging', 'plan-tapping');
const menu = $('planExportMenu'), toggle = open => { menu.hidden = !open; $('planExport').setAttribute('aria-expanded', open); };
$('planExport').onclick = e => { e.stopPropagation(); toggle(menu.hidden); };
menu.onclick = () => toggle(false);
$('planCopy').onclick = () => copyPlan(data, plan, times);
$('planXlsx').onclick = () => downloadXlsx(data, plan, times);
$('planSheet').onclick = () => copyForSheet(data, plan, times);
for (const b of document.querySelectorAll('[data-plan-view]'))
b.onclick = () => {
planView = b.dataset.planView;
try { localStorage.setItem('planView', planView); } catch {}
showPlan(data, plan);
};
}
// Drag and drop in the suggestion: onto a gap = own slot there, onto a show = side by side with it
const trimBreaks = plan => { for (const day of plan) while (day.length && !day.at(-1).length) day.pop(); return plan; };
function movedPlan(plan, shows, i, d, at, pairWith) {
const next = plan.map(day => day.map(slot => slot.slice()));
for (let dd = 0; dd < 7; dd++)
for (let k = 0; k < next[dd].length; k++) {
const j = next[dd][k].indexOf(i);
if (j < 0) continue;
next[dd][k].splice(j, 1);
if (!next[dd][k].length) {
next[dd].splice(k, 1);
if (dd === d && at > k) at--;
}
dd = 7; break;
}
if (pairWith === undefined) { next[d].splice(Math.min(at, next[d].length), 0, [i]); return trimBreaks(next); }
const slot = next[d].find(slot => slot.includes(pairWith));
if (!slot) return null;
if (slot.length >= MAX_SIDE_BY_SIDE) return { error: `Mehr als ${MAX_SIDE_BY_SIDE} Serien parallel geht nicht` };
const both = shows[i].people.filter(p => slot.some(j => shows[j].people.includes(p)));
if (both.length) return { error: `${both.join(', ')} ${both.length === 1 ? 'guckt' : 'gucken'} beide: nicht parallel möglich` };
slot.push(i);
return trimBreaks(next);
}
let dragged = null;
const clearDrop = () => document.querySelectorAll('#planOut .over').forEach(el => el.classList.remove('over'));
const dropTarget = e => {
const show = e.target.closest('#planOut .plan-slot .info[data-show]');
if (show && Number(show.dataset.show) !== dragged) return show;
return e.target.closest('#planOut .plan-drop');
};
addEventListener('dragstart', e => {
const el = e.target.closest?.('#planOut [data-show]');
if (!el || !planDrag) return;
dragged = Number(el.dataset.show);
e.dataTransfer.effectAllowed = 'move';
e.dataTransfer.setData('text/plain', planDrag.data.shows[dragged].title);
requestAnimationFrame(() => { document.body.classList.add('plan-dragging'); el.classList.add('dragging'); });
});
addEventListener('dragover', e => {
if (dragged === null) return;
const target = dropTarget(e);
clearDrop();
if (!target) return;
e.preventDefault();
e.dataTransfer.dropEffect = 'move';
target.classList.add('over');
});
// one move, from dragging or from tapping: show i onto a gap (own slot) or onto another show (side by side)
function applyMove(i, target) {
const { data, plan } = planDrag;
const pair = target.dataset.show !== undefined;
const d = Number(pair ? target.closest('.plan-row').dataset.day : target.dataset.day);
const next = movedPlan(plan, data.shows, i, d, Number(target.dataset.at), pair ? Number(target.dataset.show) : undefined);
if (!next) return;
if (next.error) { notice(next.error); return; }
planHistory.push(plan);
planOutcome.plan = next;
showPlan(data, next);
}
addEventListener('drop', e => {
if (dragged === null) return;
const target = dropTarget(e);
if (!target) return;
e.preventDefault();
const i = dragged;
dragged = null;
applyMove(i, target);
});
// Without dragging (phones, or by choice): tap a show, then tap a gap or another show; tap it again or Esc cancels
let tapped = null;
const endTap = () => { tapped = null; document.body.classList.remove('plan-dragging', 'plan-tapping'); document.querySelector('#planOut .info.picked')?.classList.remove('picked'); };
addEventListener('click', e => {
if (!planDrag || !e.target.closest('#planOut') || e.target.closest('button, a')) return;
const show = e.target.closest('#planOut .plan-slot .info[data-show]');
const gap = e.target.closest('#planOut .plan-drop');
if (tapped === null) {
if (!show) return;
tapped = Number(show.dataset.show);
show.classList.add('picked');
document.body.classList.add('plan-dragging', 'plan-tapping');
notice('Ziel antippen: Lücke = eigener Slot, andere Serie = parallel');
return;
}
const i = tapped;
if (show && Number(show.dataset.show) === i) { endTap(); return; }
endTap();
if (show || gap) applyMove(i, show || gap);
});
addEventListener('keydown', e => { if (e.key === 'Escape' && tapped !== null) endTap(); });
addEventListener('dragend', () => { dragged = null; clearDrop(); document.body.classList.remove('plan-dragging'); document.querySelector('#planOut .dragging')?.classList.remove('dragging'); });
addEventListener('click', e => { if (!e.target.closest('.plan-export')) { const m = $('planExportMenu'); if (m && !m.hidden) { m.hidden = true; $('planExport').setAttribute('aria-expanded', 'false'); } } });
addEventListener('keydown', e => { if (e.key === 'Escape' && $('planExportMenu') && !$('planExportMenu').hidden) { $('planExportMenu').hidden = true; $('planExport').setAttribute('aria-expanded', 'false'); $('planExport').focus(); } });
async function copyPlan(data, plan, times) {
const lines = [['Anime Titel', 'Tag', 'Uhrzeit', 'Slot', 'Parallel mit'].join('\t')];
const { dayOnly } = planContext(data);
plan.forEach((slots, d) => {
slots.forEach((slot, k) => slot.forEach(i => {
lines.push([data.shows[i].sheetTitle, SHEET_DAYS[d], clock(times[d][k]), k + 1,
slot.filter(j => j !== i).map(j => data.shows[j].sheetTitle).join(', ')].join('\t'));
}));
for (const i of dayOnly[d]) lines.push([data.shows[i].sheetTitle, SHEET_DAYS[d], '', '', ''].join('\t'));
});
try {
await navigator.clipboard.writeText(lines.join('\n'));
notice('Plan als Tabelle kopiert');
} catch {
notice('Kopieren ging nicht (der Browser hat es nicht erlaubt)');
}
}
function guckplanRows(data, plan, times) {
const { sheet, shows } = data;
const columns = sheet.columns || sheet.people.map(name => ({ name, hidden: false }));
const people = columns.map(c => c.name);
const YES = /^(ja|vielleicht)$|^wenn belly/i;
const names = v => v && !YES.test(v) && !/^(nein|default|allein)$/i.test(v) && resolveName(sheet, v);
const ownVotes = s => Object.fromEntries(people.map(p => {
const own = s.row.votes?.[p] || '';
return [p, s.people.includes(p) ? (YES.test(own) ? own : 'Ja') : names(own) ? 'Nein' : own || 'Default'];
}));
const rows = [];
const placed = new Set();
const { dayOnly } = planContext(data);
plan.forEach((slots, d) => {
slots.forEach((slot, k) => {
if (!slot.length) return;
const [main, ...others] = slot.map(i => shows[i]).sort((a, b) => b.people.length - a.people.length);
const when = { tag: SHEET_DAYS[d], time: clock(times[d][k]), slot: k + 1 };
const votes = ownVotes(main);
for (const o of others) for (const p of o.people) votes[p] = o.row.english || o.row.romaji;
rows.push({ s: main, ...when, votes, hidden: false });
for (const o of others) rows.push({ s: o, ...when, votes: ownVotes(o), hidden: true });
for (const i of slot) placed.add(shows[i].row);
});
for (const i of dayOnly[d]) {
rows.push({ s: shows[i], tag: SHEET_DAYS[d], time: '', slot: '', votes: ownVotes(shows[i]), hidden: false });
placed.add(shows[i].row);
}
});
for (const r of sheet.shows)
if (!placed.has(r)) rows.push({ s: { row: r, mal: '' }, tag: r.tag, time: r.time, slot: '', votes: { ...r.votes }, hidden: r.hidden });
const title = data.tab.list ? `Guckplan ${data.tab.name}` : data.tab.name;
return { title, columns, people, rows };
}
function downloadXlsx(data, plan, times) {
const { title, columns, people, rows } = guckplanRows(data, plan, times);
const blob = xlsxBlob({
name: `${title} Vorschlag`,
widths: [2, 5, 6, 32, 32, 11, 5, 6, 8, ...columns.map(c => c.hidden ? { width: 12, hidden: true } : 12)],
headerRow: 2,
header: [{ text: '' }, ...['Sort', 'Slot', 'Anime Titel', 'Eng Anime Titel', 'Startdatum', 'Wo', 'Tag', 'Uhrzeit'].map(text => ({ text })),
...people.map(p => ({ text: p, fill: personColor.get(p) }))],
rows: rows.map(({ s, tag, time, slot, votes, hidden }) => ({
hidden,
cells: ['', s.row.sort || '', slot, { text: s.row.romaji || s.row.english, link: s.mal }, { text: s.row.english || s.row.romaji, link: s.mal },
s.row.start || '', s.row.wo || '', tag || '', time || '', ...people.map(p => votes[p] || '')],
})),
});
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `${title} Vorschlag.xlsx`;
document.body.append(a);
a.click();
a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 5000);
notice('Heruntergeladen. Im Sheet: Datei → Importieren → Hochladen → „Neue Tabellenblätter einfügen“');
}
async function copyForSheet(data, plan, times) {
const { title, people, rows } = guckplanRows(data, plan, times);
const code = 'GUCKPLAN1:' + JSON.stringify({
name: `${title} Vorschlag`, people,
rows: rows.map(({ s, tag, time, slot, votes, hidden }) => [s.row.sort || '', slot, s.row.romaji || s.row.english,
s.row.english || s.row.romaji, s.mal || '', s.row.start || '', s.row.wo || '', tag || '', time || '', hidden ? 1 : 0,
...people.map(p => votes[p] || '')]),
});
try {
await navigator.clipboard.writeText(code);
notice('Plan-Code kopiert. Im Sheet: Season-Helfer → „3. Watch-Plan einfügen“ und einfügen');
} catch {
notice('Kopieren ging nicht (der Browser hat es nicht erlaubt)');
}
}
loadPlanner();

