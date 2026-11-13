// Anime-Börse (boerse.html): play money for the season's real anime, traded the whole season at the day's close.
// Prices: boerse-prices.json (tools/boerse-prices.mjs, daily). Accounts and trades: the votes helper
// (workers/season-votes, /stocks). Rules: boerse-core.mjs.
import { CASH, FEE, PRICE, tradingWindow, berlinDay, latestPrices, pendingSum, accountValue } from './boerse-core.mjs';

const BALLOT_PEOPLE = { MaRyo: ['Marvin', 'Ryo'] };
const voters = names => names.flatMap(name => BALLOT_PEOPLE[name] || [name]);
let voteApi = '', tabs = [], titles = [], people = [], state = null, priced = { days: [], shows: {} }, prices = new Map(), request = 0;
const seasonName = () => $('stockSeason').selectedOptions[0]?.textContent || '';
const day = v => new Date(typeof v === 'string' ? v + 'T12:00:00' : v).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const taler = n => (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const pct = n => (n > 0 ? '+' : '') + n.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
const cls = n => n > 0 ? 'up' : n < 0 ? 'down' : '';

// only for yourself: your AniList login or your PIN goes along (identity.js)
async function call(path, body, person = '') {
  const code = groupCode();
  const res = await fetch(voteApi + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(person && Identity.headers(person)), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && /Gruppencode/.test(data.error || '')) { Identity.askGroupCode($('stockIdentity'), () => loadSeason()); throw new Error('Gruppencode fehlt: oben einmal eingeben.'); }
  if (!res.ok) throw new Error(data.error || 'Fehler ' + res.status);
  return data;
}

// a line chart as SVG (the area under it), with the dates and the low and high underneath as text
export function chart(values, { width = 600, height = 170, labels = [], spark = false } = {}) {
  if (!values.length) return '<p class="boerse-hint">Noch keine Kurse.</p>';
  const v = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...v), max = Math.max(...v), pad = spark ? 2 : 6, span = max - min || 1;
  const x = i => pad + i * (width - 2 * pad) / (v.length - 1), y = n => height - pad - (n - min) * (height - 2 * pad) / span;
  const line = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  const trend = cls(v[v.length - 1] - v[0]) || 'flat';
  const svg = `<svg class="boerse-svg ${trend}${spark ? ' spark' : ''}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Verlauf von ${taler(v[0])} auf ${taler(v[v.length - 1])}">
    <polygon points="${x(0)},${height} ${line} ${x(v.length - 1)},${height}" class="area"/><polyline points="${line}" class="line"/></svg>`;
  if (spark) return svg;
  return svg + `<div class="boerse-axis"><span>${esc(labels[0] || '')}</span><span>Tief ${taler(min)} · Hoch ${taler(max)}</span><span>${esc(labels[labels.length - 1] || '')}</span></div>`;
}
// the portfolio's value day by day: trades replayed against each day's close
function valueHistory(account) {
  const trades = account?.trades || [];
  return priced.days.map((d, i) => {
    let cash = CASH; const held = {};
    for (const t of trades) if (t.day <= d) { cash += -t.qty * t.price - t.fee; held[t.title] = (held[t.title] || 0) + t.qty; }
    return cash + Object.entries(held).reduce((n, [title, c]) => n + c * (priced.shows[title]?.closes?.[i] ?? PRICE), 0);
  });
}
const change = title => { const c = priced.shows[title]?.closes || []; return c.length > 1 ? (c[c.length - 1] / c[c.length - 2] - 1) * 100 : 0; };
const haltedToday = title => priced.shows[title]?.halted === berlinDay();

function draw() {
  const win = tradingWindow(seasonName()), open = !!state?.open && !!state?.account;
  // the season's dates decide what the line says, also when the helper can't be reached
  const running = win && (state ? state.open : win.open);
  $('stockWindow').textContent = !win ? '' : running ? `Handel offen bis ${day(win.to)} · Schlusskurs vom ${priced.days.length ? day(priced.days[priced.days.length - 1]) : '–'}`
    : Date.now() < win.from ? `Handel öffnet am ${day(win.from)}` : 'Die Season ist vorbei · Endstand';
  const a = state?.account || { cash: CASH, pending: [], holdings: {}, trades: [] };
  const value = accountValue(a, prices);
  $('stockWallet').hidden = !state?.account;
  $('stockCash').textContent = taler(a.cash ?? CASH);
  $('stockPending').textContent = taler(pendingSum(a));
  $('stockValue').textContent = taler(value);
  $('stockGain').textContent = (value >= CASH ? '+' : '') + taler(value - CASH);
  $('stockGain').className = cls(value - CASH);
  const history = valueHistory(a);
  $('stockChartBox').hidden = !state?.account?.trades?.length || priced.days.length < 2;
  if (!$('stockChartBox').hidden) $('stockChart').innerHTML = chart(history, { labels: priced.days.map(day) });
  const holdings = a.holdings || {};
  const sorted = [...titles].sort((x, y) => Math.abs(holdings[y] || 0) - Math.abs(holdings[x] || 0) || (prices.get(y) ?? PRICE) - (prices.get(x) ?? PRICE) || x.localeCompare(y, 'de'));
  $('stockList').innerHTML = sorted.map(title => {
    const s = priced.shows[title] || {}, price = prices.get(title) ?? PRICE, have = holdings[title] || 0, ch = change(title), halt = haltedToday(title);
    const meta = [s.ratings ? `${s.ratings} ${s.ratings === 1 ? 'Bewertung' : 'Bewertungen'}` : 'noch unbewertet', s.drops ? `<b class="down">${s.drops}× gedroppt</b>` : ''].filter(Boolean).join(' · ');
    return `<div class="boerse-row${have ? ' owned' : ''}${have < 0 ? ' short' : ''}" data-title="${esc(title)}">
      <button type="button" class="boerse-title" data-chart>${esc(title)}<small>${meta}${halt ? ' · <b class="down">ausgesetzt</b>' : ''}</small></button>
      <span class="boerse-spark" data-chart>${chart(s.closes || [PRICE], { width: 90, height: 28, spark: true })}</span>
      <span class="boerse-price">${taler(price)}<small class="${cls(ch)}">${pct(Math.round(ch * 10) / 10)}</small></span>
      <span class="boerse-have"><b title="${have < 0 ? 'Leerverkauf' : 'Deine Aktien'}">${have}</b>${open ? `<button type="button" class="pill" data-trade="buy"${halt ? ' disabled' : ''}>Kaufen</button><button type="button" class="pill" data-trade="sell"${halt ? ' disabled' : ''} title="${have > 0 ? 'Verkaufen' : 'Leerverkauf: auf fallenden Kurs setzen'}">Verkaufen</button>` : ''}</span>
    </div>`;
  }).join('') || '<p class="boerse-hint">Für diese Season gibt es noch keine Kurse.</p>';
  $('stockQty').closest('label').hidden = !open;
  const trades = state?.account?.trades || [];
  $('stockTradesBox').hidden = !trades.length;
  $('stockTrades').innerHTML = [...trades].reverse().map(t => `<li><span>${day(t.day)}</span> ${t.qty > 0 ? 'Kauf' : 'Verkauf'} ${Math.abs(t.qty)}× ${esc(t.title)} zu ${taler(t.price)} <small>(+${t.fee} Gebühr)</small></li>`).join('');
  const board = state?.ranking || [];
  $('stockBoard').hidden = !board.length;
  const held = new Map((state?.portfolios || []).map(p => [p.person, p.holdings]));
  $('stockRanking').innerHTML = board.map(r => `<li><b>${esc(r.person)}</b><span>${taler(r.value)} Taler <small class="${cls(r.value - CASH)}">${pct(Math.round((r.value / CASH - 1) * 1000) / 10)}</small></span>
    ${held.has(r.person) ? `<small class="boerse-holdings">${Object.entries(held.get(r.person)).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([t, c]) => `${c}× ${esc(t)}`).join(' · ')}</small>` : ''}</li>`).join('');
}
function openChart(title) {
  const s = priced.shows[title] || {};
  $('stockDlgTitle').textContent = title;
  $('stockDlgChart').innerHTML = chart(s.closes || [PRICE], { labels: priced.days.slice(-(s.closes || []).length).map(day) });
  const closes = s.closes || [PRICE];
  $('stockDlgFacts').innerHTML = [
    ['Kurs', taler(closes[closes.length - 1])], ['Heute', pct(Math.round(change(title) * 10) / 10)],
    ['Seit Start', pct(Math.round((closes[closes.length - 1] / closes[0] - 1) * 1000) / 10)],
    ['Hoch / Tief', `${taler(Math.max(...closes))} / ${taler(Math.min(...closes))}`],
    ['AniList-Wertung', s.score ? s.score + ' %' : '–'], ['AniList-Mitglieder', s.members ? s.members.toLocaleString('de-DE') : '–'],
    ['Eure Bewertungen', s.ratings || 0], ['Drops', s.drops || 0],
  ].map(([k, v]) => `<li><small>${k}</small><b>${esc(String(v))}</b></li>`).join('');
  $('stockDlg').showModal();
}
$('stockList').addEventListener('click', async e => {
  const row = e.target.closest('[data-title]');
  if (!row) return;
  const title = row.dataset.title;
  if (e.target.closest('[data-chart]')) { openChart(title); return; }
  const b = e.target.closest('[data-trade]');
  if (!b || !state?.open) return;
  const qty = Math.max(1, Math.min(50, Math.round(Number($('stockQty').value) || 1))) * (b.dataset.trade === 'sell' ? -1 : 1);
  const price = prices.get(title) ?? PRICE;
  const short = qty < 0 && (state.account?.holdings?.[title] || 0) + qty < 0;
  if (short && !confirm(`Leerverkauf: Du verkaufst ${-qty}× ${title}, die du nicht (alle) hast. Fällt der Kurs, gewinnst du; steigt er, verlierst du. Weiter?`)) return;
  row.querySelectorAll('button[data-trade]').forEach(x => { x.disabled = true; });
  $('stockMsg').textContent = 'Order wird ausgeführt …';
  try {
    const r = await call('/stocks/trade', { season: seasonName(), person: $('stockPerson').value, title, qty }, $('stockPerson').value);
    state = { ...state, account: r.account };
    $('stockMsg').textContent = `${qty > 0 ? 'Gekauft' : 'Verkauft'}: ${Math.abs(qty)}× ${title} zu ${taler(r.price ?? price)} (+${FEE} Taler Gebühr)${qty < 0 ? '. Das Geld ist ab morgen verfügbar.' : '.'}`;
    loadPerson(false);
  } catch (err) { $('stockMsg').textContent = 'Nicht ausgeführt: ' + err.message; draw(); }
});

async function loadPerson(clear = true) {
  const turn = request, person = $('stockPerson').value;
  Identity.draw($('stockIdentity'), person, () => loadPerson());
  // your own account only when you are confirmed; otherwise prices and the ranking
  const mine = Identity.canAct(person);
  try {
    state = await call('/stocks?season=' + encodeURIComponent(seasonName()) + (mine ? '&person=' + encodeURIComponent(person) : ''), null, mine ? person : '');
    if (turn !== request) return;
    $('stockStatus').textContent = mine ? '' : 'Bestätige oben, dass du ' + person + ' bist, um dein Depot zu sehen und zu handeln.';
  } catch (err) {
    if (turn !== request) return;
    if (mine) { try { state = await call('/stocks?season=' + encodeURIComponent(seasonName())); } catch { state = null; } }
    else state = null;
    $('stockStatus').textContent = (mine ? 'Nicht bestätigt: ' : 'Die Börse ist gerade nicht erreichbar: ') + err.message;
  }
  if (clear) $('stockMsg').textContent = '';
  draw();
}
async function loadSeason() {
  const turn = ++request;
  const tab = tabs[$('stockSeason').selectedIndex];
  $('stockStatus').textContent = 'Lade Kurse …';
  $('stockPerson').disabled = true;
  try {
    const [plan, file] = await Promise.all([loadPlan(tab), fetch('boerse-prices.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
    if (turn !== request) return;
    priced = file.seasons?.[seasonName()] || { days: [], shows: {} };
    prices = latestPrices(priced);
    titles = [...new Set([...plan.shows.filter(s => !s.hidden).map(s => s.english || s.romaji).filter(Boolean)].filter(t => priced.shows[t] || !Object.keys(priced.shows).length))];
    const wanted = $('stockPerson').value;
    people = voters(plan.people);
    $('stockPerson').replaceChildren(...people.map(p => new Option(p, p)));
    await Identity.ready;
    if (people.includes(wanted)) $('stockPerson').value = wanted;
    else { const me = Identity.myPeople().find(p => people.includes(p)); if (me) $('stockPerson').value = me; }
    $('stockPerson').disabled = false;
    await loadPerson();
  } catch { if (turn === request) $('stockStatus').textContent = 'Der Guckplan konnte nicht geladen werden.'; }
}
$('stockPerson').onchange = () => loadPerson();
$('stockSeason').onchange = loadSeason;

(async () => {
  const settings = await config().catch(() => ({}));
  if (typeof settings.previewVotesUrl === 'string' && /^https:\/\//.test(settings.previewVotesUrl)) voteApi = settings.previewVotesUrl.replace(/\/$/, '');
  if (!voteApi) { $('stockStatus').textContent = 'Die Börse ist hier nicht eingerichtet.'; return; }
  try { tabs = await guckplanTabs(); } catch { tabs = []; }
  if (!tabs.length) tabs = [FALLBACK_TAB];
  const names = tabs.map(t => t.name.replace(/^Guckplan\s+/i, ''));
  const now = Date.now();
  // the newest season that is trading, else the current one
  let pick = names.findIndex(n => tradingWindow(n, now)?.open);
  if (pick < 0) pick = tabs.indexOf(tabFor(tabs, now));
  $('stockSeason').replaceChildren(...names.map((n, i) => new Option(n, String(i))));
  $('stockSeason').selectedIndex = Math.max(0, pick);
  $('stockSeason').disabled = false;
  loadSeason();
})();
