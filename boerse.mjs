// Anime-Börse (boerse.html): play money for the season's real anime. Portfolios are kept by the votes helper
// (workers/season-votes, /stocks); prices come live from the group's own AniList ratings (wrapped-profiles.json).
import { anilist } from './game-data.mjs';
import { CASH, PRICE, tradingWindow, priceOf, spent, portfolioValue, ranking } from './boerse-core.mjs';

const BALLOT_PEOPLE = { MaRyo: ['Marvin', 'Ryo'] };
const voters = names => names.flatMap(name => BALLOT_PEOPLE[name] || [name]);
let voteApi = '', tabs = [], titles = [], people = [], state = null, prices = new Map(), rated = new Map(), mine = {}, request = 0;
const seasonName = () => $('stockSeason').selectedOptions[0]?.textContent || '';
const day = ms => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const taler = n => Math.round(n).toLocaleString('de-DE');

async function call(path, body) {
  let code = '';
  try { code = sessionStorage.getItem('previewGroupCode') || ''; } catch {}
  const res = await fetch(voteApi + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? 'Gruppencode fehlt: einmal in der Season Preview eingeben' : data.error || 'Fehler ' + res.status);
  return data;
}

// the season's shows on AniList: ids from streams-de.json by title, else from seasons.json by MyAnimeList id
async function anilistIds(list) {
  const ids = new Map();
  try {
    const streams = await (await fetch('streams-de.json', { cache: 'no-cache' })).json();
    const byTitle = new Map();
    for (const [id, s] of Object.entries(streams.status || {})) for (const t of s.titles || []) byTitle.set(norm(t), Number(id));
    for (const show of list) { const id = byTitle.get(norm(show.romaji || '')) || byTitle.get(norm(show.english || '')); if (id) ids.set(show.title, id); }
  } catch {}
  const missing = list.filter(s => !ids.has(s.title));
  if (missing.length) try {
    const catalog = await (await fetch('seasons.json', { cache: 'no-cache' })).json();
    const mal = new Map();
    for (const shows of Object.values(catalog.seasons || {})) for (const s of shows || []) if (s.mal)
      for (const t of [s.romaji, s.english]) if (t) mal.set(norm(t), Number(s.mal));
    const wanted = new Map(missing.map(s => [mal.get(norm(s.romaji || '')) || mal.get(norm(s.english || '')), s.title]).filter(([m]) => m));
    if (wanted.size) {
      const data = await anilist('query ($mal: [Int]) { Page(perPage: 50) { media(idMal_in: $mal, type: ANIME) { id idMal } } }', { mal: [...wanted.keys()] });
      for (const m of data?.Page?.media || []) ids.set(wanted.get(m.idMal), m.id);
    }
  } catch {}
  return ids;
}
// the group's ratings: every AniList account in "Wer ist wer" (wrapped-profiles.json), only these shows
async function loadPrices(list) {
  const ids = await anilistIds(list);
  const byId = new Map([...ids].map(([title, id]) => [id, title]));
  const ratings = new Map(list.map(s => [s.title, []]));
  if (byId.size) {
    const profiles = await (await fetch('wrapped-profiles.json', { cache: 'no-cache' })).json();
    const accounts = [...new Set(Object.values(profiles).flat().filter(a => a?.provider === 'anilist' && /^[\w-]{2,40}$/.test(a.name)).map(a => a.name))];
    for (const user of accounts) {
      try {
        const data = await anilist('query ($user: String, $ids: [Int]) { Page(perPage: 50) { mediaList(userName: $user, mediaId_in: $ids, type: ANIME) { mediaId status score(format: POINT_100) } } }', { user, ids: [...byId.keys()] });
        for (const e of data?.Page?.mediaList || []) ratings.get(byId.get(e.mediaId))?.push({ score: e.score, status: e.status });
      } catch {}
    }
  }
  return ratings;
}

function draw() {
  const win = tradingWindow(seasonName());
  const open = !!state?.open, list = $('stockList');
  $('stockWindow').textContent = !win ? '' : open ? `Handel offen bis ${day(win.to)}` : Date.now() < win.from
    ? `Handel öffnet am ${day(win.from)}` : `Handel geschlossen seit ${day(win.to)} · die Kurse folgen euren Bewertungen.`;
  const cash = CASH - spent(mine), value = portfolioValue(mine, prices);
  $('stockWallet').hidden = !state;
  $('stockCash').textContent = taler(cash);
  $('stockValue').textContent = taler(value);
  $('stockGain').textContent = (value >= CASH ? '+' : '') + taler(value - CASH);
  $('stockGain').className = value > CASH ? 'up' : value < CASH ? 'down' : '';
  const sorted = [...titles].sort((a, b) => (mine[b] || 0) - (mine[a] || 0) || (prices.get(b) ?? PRICE) - (prices.get(a) ?? PRICE) || a.localeCompare(b, 'de'));
  list.innerHTML = sorted.map(title => {
    const price = prices.get(title) ?? PRICE, have = mine[title] || 0, change = price - PRICE, n = (rated.get(title) || []).length;
    return `<div class="boerse-row${have ? ' owned' : ''}" data-title="${esc(title)}">
      <span class="boerse-title">${esc(title)}<small>${n ? n + (n === 1 ? ' Bewertung' : ' Bewertungen') : 'noch unbewertet'}</small></span>
      <span class="boerse-price">${price}<small class="${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? '▲ +' : change < 0 ? '▼ ' : '± '}${change}</small></span>
      <span class="boerse-have">${open ? `<button type="button" class="pill" data-trade="-1" aria-label="Eine Aktie ${esc(title)} verkaufen"${have ? '' : ' disabled'}>−</button>` : ''}<b>${have}</b>${open ? `<button type="button" class="pill" data-trade="1" aria-label="Eine Aktie ${esc(title)} kaufen"${cash >= PRICE ? '' : ' disabled'}>+</button>` : ''}</span>
    </div>`;
  }).join('');
  $('stockSave').hidden = !open;
  const traders = state?.traders || [];
  $('stockTraders').hidden = !open;
  $('stockTraders').innerHTML = open ? `<li class="label">Depot angelegt</li>${people.map(p => `<li class="${traders.includes(p) ? 'done' : ''}">${traders.includes(p) ? '✓ ' : ''}${esc(p)}</li>`).join('')}` : '';
  const board = state?.portfolios?.length ? ranking(state.portfolios, prices) : [];
  $('stockBoard').hidden = !board.length;
  $('stockRanking').innerHTML = board.map(r => `<li><b>${esc(r.person)}</b><span>${taler(r.value)} Taler <small class="${r.value > CASH ? 'up' : r.value < CASH ? 'down' : ''}">${r.value >= CASH ? '+' : ''}${Math.round((r.value / CASH - 1) * 100)} %</small></span>
    <small class="boerse-holdings">${Object.entries(r.holdings).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c}× ${esc(t)}`).join(' · ')}</small></li>`).join('');
}
$('stockList').addEventListener('click', e => {
  const b = e.target.closest('[data-trade]');
  if (!b || !state?.open) return;
  const title = b.closest('[data-title]').dataset.title, step = Number(b.dataset.trade);
  const next = (mine[title] || 0) + step;
  if (next < 0 || (step > 0 && CASH - spent(mine) < PRICE)) return;
  if (next) mine[title] = next; else delete mine[title];
  $('stockMsg').textContent = 'Noch nicht gespeichert.';
  draw();
});
$('stockSave').onclick = async () => {
  $('stockSave').disabled = true;
  $('stockMsg').textContent = 'Wird gespeichert …';
  try {
    await call('/stocks/portfolio', { season: seasonName(), person: $('stockPerson').value, holdings: mine });
    state = { ...state, traders: [...new Set([...(state.traders || []), $('stockPerson').value])] };
    $('stockMsg').textContent = 'Depot gespeichert. Bis Handelsschluss sieht es niemand.';
    draw();
  } catch (err) { $('stockMsg').textContent = 'Nicht gespeichert: ' + err.message; }
  finally { $('stockSave').disabled = false; }
};

async function loadPerson() {
  const turn = request;
  mine = {};
  try {
    state = await call('/stocks?season=' + encodeURIComponent(seasonName()) + '&person=' + encodeURIComponent($('stockPerson').value));
    if (turn !== request) return;
    mine = { ...(state.mine || {}) };
    $('stockStatus').textContent = '';
  } catch (err) { if (turn === request) { state = null; $('stockStatus').textContent = 'Die Börse ist gerade nicht erreichbar: ' + err.message; } }
  $('stockMsg').textContent = '';
  draw();
}
async function loadSeason() {
  const turn = ++request;
  const tab = tabs[$('stockSeason').selectedIndex];
  $('stockStatus').textContent = 'Lade Guckplan …';
  $('stockPerson').disabled = true;
  try {
    const plan = await loadPlan(tab);
    if (turn !== request) return;
    const shows = plan.shows.filter(s => !s.hidden).map(s => ({ ...s, title: s.english || s.romaji })).filter(s => s.title);
    titles = [...new Set(shows.map(s => s.title))];
    const wanted = $('stockPerson').value;
    people = voters(plan.people);
    $('stockPerson').replaceChildren(...people.map(p => new Option(p, p)));
    if (people.includes(wanted)) $('stockPerson').value = wanted;
    $('stockPerson').disabled = false;
    prices = new Map(); rated = new Map();
    await loadPerson();
    // prices fill in when the ratings arrive
    loadPrices(shows).then(ratings => {
      if (turn !== request) return;
      rated = ratings;
      prices = new Map([...ratings].map(([title, r]) => [title, priceOf(r)]));
      draw();
    }, () => { if (turn === request) $('stockMsg').textContent = 'Bewertungen gerade nicht erreichbar: Kurse stehen auf 100.'; });
  } catch { if (turn === request) $('stockStatus').textContent = 'Der Guckplan konnte nicht geladen werden.'; }
}
$('stockPerson').onchange = loadPerson;
$('stockSeason').onchange = loadSeason;

(async () => {
  const settings = await config().catch(() => ({}));
  if (typeof settings.previewVotesUrl === 'string' && /^https:\/\//.test(settings.previewVotesUrl)) voteApi = settings.previewVotesUrl.replace(/\/$/, '');
  if (!voteApi) { $('stockStatus').textContent = 'Die Börse ist hier nicht eingerichtet.'; return; }
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  // the season whose trading is open or comes next, else the current one
  const names = tabs.map(t => t.name.replace(/^Guckplan\s+/i, ''));
  const now = Date.now();
  let pick = names.findIndex(n => tradingWindow(n, now)?.open);
  if (pick < 0) pick = tabs.indexOf(tabFor(tabs, now));
  $('stockSeason').replaceChildren(...names.map((n, i) => new Option(n, String(i))));
  $('stockSeason').selectedIndex = Math.max(0, pick);
  $('stockSeason').disabled = false;
  loadSeason();
})();
