// Extra lines under the daily Discord post (tools/discord-daily.mjs): yesterday at the Anime-Börse, and in the two
// weeks before a new season, who still has open votes in the Season Preview. Pure functions, tested on their own.
import { tradingWindow, berlinDay, prevDay, seasonStart } from '../boerse-core.mjs';

const pct = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(Math.round(n * 10) / 10).toLocaleString('de-DE') + ' %';
const taler = n => (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });

// "📈 Börse gestern: Frieren +4,2 % (144,97) · Dandadan −36 % (70) · ausgesetzt: Dandadan"
// Only with yesterday's close in the file (no stale numbers), for a season that is being traded.
export function boerseLine(file, now = Date.now()) {
  const today = berlinDay(now), yesterday = prevDay(today);
  for (const [season, s] of Object.entries(file?.seasons || {})) {
    if (!tradingWindow(season, now)?.open) continue;
    const days = s.days || [], at = days.indexOf(yesterday);
    if (at < 1) continue;
    const moves = Object.entries(s.shows || {}).flatMap(([title, x]) => {
      const now = x.closes?.[at], before = x.closes?.[at - 1];
      return now > 0 && before > 0 ? [{ title, close: now, change: (now / before - 1) * 100 }] : [];
    }).sort((a, b) => b.change - a.change || a.title.localeCompare(b.title, 'de'));
    if (!moves.length) continue;
    const best = moves[0], worst = moves[moves.length - 1];
    const parts = [`${best.title} ${pct(best.change)} (${taler(best.close)})`];
    if (worst !== best && worst.change < best.change) parts.push(`${worst.title} ${pct(worst.change)} (${taler(worst.close)})`);
    const halted = Object.entries(s.shows || {}).filter(([, x]) => x.halted === today).map(([t]) => t);
    if (halted.length) parts.push('heute ausgesetzt: ' + halted.join(', '));
    return `📈 **Börse gestern:** ${parts.join(' · ')}`;
  }
  return '';
}

const RESERVED = new Set(['Anime Titel', 'Eng Anime Titel', 'Wo', 'Tag', 'Uhrzeit', 'Startdatum', 'Sort', 'Slot', 'Genre', 'Studio', 'Staffel', 'Episode', 'Folgen']);
// open Season Preview votes per voter column (empty or "Default"), from the season tab's rows (as the CSV export gives them)
export function openVotes(rows) {
  const h = rows.findIndex(r => r.some(c => String(c).trim() === 'Anime Titel'));
  if (h < 0) return [];
  const cols = rows[h].map(c => String(c).trim()), title = cols.indexOf('Anime Titel'), first = cols.indexOf('Uhrzeit') + 1;
  if (first <= 0) return [];
  const voters = cols.map((name, i) => ({ name, i })).filter(x => x.i >= first && x.name && !RESERVED.has(x.name));
  const end = rows.findIndex((r, i) => i > h && !String(r[title] || '').trim());
  const shows = rows.slice(h + 1, end < 0 ? undefined : end);
  return voters.map(({ name, i }) => ({ name, open: shows.filter(r => { const v = String(r[i] || '').trim().replace(/,$/, ''); return !v || v === 'Default'; }).length }))
    .filter(v => v.open > 0);
}
// "🗳️ Season Preview Winter 2027 startet in 9 Tagen · noch offen: Rei (12), Terra (3)" in the 14 days before the start
export function previewLine(season, rows, now = Date.now(), site = '') {
  const start = seasonStart(season);
  if (start === null) return '';
  const days = Math.ceil((start - now) / 86400000);
  if (days < 1 || days > 14) return '';
  const open = openVotes(rows);
  if (!open.length) return '';
  const when = days === 1 ? 'morgen' : `in ${days} Tagen`;
  return `🗳️ **Season Preview ${season}** startet ${when} · noch offen: ${open.map(v => `${v.name} (${v.open})`).join(', ')}${site ? `\n<${site}season-preview.html>` : ''}`;
}
