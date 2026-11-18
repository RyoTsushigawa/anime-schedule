// The Troddlrating on the plan: hovering (or focusing) a show's name shows the group's review score in a small card,
// so the lists stay as they are. Data: the votes helper (/troddl), only with the group code on this device.
import { scoreClass, summarize, reviewCount } from './troddl-core.mjs';

const CACHE = 'troddlCache', FRESH = 5 * 60 * 1000;
let shows = null, loading = null, card = null, showTimer = 0, hideTimer = 0, current = null;

async function load() {
  try { const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); if (c && Date.now() - c.at < FRESH) return summarize(c.reviews); } catch {}
  const code = globalThis.savedGroupCode?.();
  const api = (await globalThis.config?.())?.previewVotesUrl;
  if (!code || typeof api !== 'string' || !/^https:\/\//.test(api)) return new Map();
  const res = await fetch(api.replace(/\/$/, '') + '/troddl', { cache: 'no-store', headers: { 'X-Group-Code': code } });
  if (!res.ok) return new Map();
  const { reviews = [] } = await res.json();
  try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), reviews })); } catch {}
  return summarize(reviews);
}
const ensure = () => loading ??= load().catch(() => new Map()).then(m => (shows = m));
const mediaOf = a => Number(a?.href?.match(/anilist\.co\/anime\/(\d+)/)?.[1]) || 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hide() {
  clearTimeout(showTimer);
  if (card) card.hidden = true;
  if (current?.dataset.troddlTitle != null) { current.title = current.dataset.troddlTitle; delete current.dataset.troddlTitle; }
  current = null;
}
function show(a, s) {
  if (!card) {
    card = Object.assign(document.createElement('div'), { className: 'troddl-card', hidden: true });
    card.setAttribute('role', 'tooltip');
    card.onmouseenter = () => clearTimeout(hideTimer);
    card.onmouseleave = () => { hideTimer = setTimeout(hide, 200); };
    document.body.append(card);
  }
  if (current && current !== a) hide();
  current = a;
  // the browser's own tooltip would cover the card
  if (a.hasAttribute('title')) { a.dataset.troddlTitle = a.title; a.removeAttribute('title'); }
  const r = s.latest, text = r.text.length > 150 ? r.text.slice(0, 150).trimEnd() + ' …' : r.text;
  card.innerHTML = `<div class="troddl-card-head"><span class="troddl-score ${scoreClass(s.rating)}">${s.rating ?? 'tbd'}</span>
    <span><b>${s.rating == null ? 'Noch kein Troddlrating' : 'Troddlrating'}</b><small>${reviewCount(s.count)}${s.rating == null ? ' · ab 2 Reviews' : ''}</small></span><img src="troddl-icon.png" alt=""></div>
    <q>${esc(text)}</q><small>${esc(r.pen)} · ${r.score}</small>
    <a href="troddl.html#m=${s.mediaId}" target="_blank" rel="noopener">Alle Reviews →</a>`;
  card.hidden = false;
  const box = a.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
  const left = Math.max(12, Math.min(box.left, innerWidth - w - 12));
  const top = box.bottom + 6 + h > innerHeight - 8 ? box.top - h - 6 : box.bottom + 6;
  card.style.left = left + 'px'; card.style.top = Math.max(8, top) + 'px';
}
function over(e) {
  const a = e.target.closest?.('#list a[href*="anilist.co/anime/"]');
  if (!a) return;
  clearTimeout(hideTimer); clearTimeout(showTimer);
  showTimer = setTimeout(async () => {
    await ensure();
    const s = shows?.get(mediaOf(a));
    if (s && a.isConnected && (a.matches(':hover') || a === document.activeElement)) show(a, s);
  }, 250);
}
function out(e) {
  const a = e.target.closest?.('#list a[href*="anilist.co/anime/"]');
  if (!a || a.contains(e.relatedTarget)) return;
  clearTimeout(showTimer);
  hideTimer = setTimeout(hide, 200);
}
document.addEventListener('mouseover', over);
document.addEventListener('mouseout', out);
document.addEventListener('focusin', over);
document.addEventListener('focusout', out);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
addEventListener('scroll', hide, { passive: true });
