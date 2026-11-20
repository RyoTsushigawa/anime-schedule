// (Same as the Discord bot's features/shift-text.js.) Reads a work plan ("Schichtplan") message like:
//   Woche 1: 16.11-21.11
//   Montag und Freitag 16:00 Uhr, Dienstag 22:00 Uhr, Donnerstag und Samstag 15 Uhr, Mittwoch frei.
//   Montag und Mittwoch 17:30-20:45 Abendschule.
// The times are when the person is available from. From LATE_FROM on that means "away until then";
// earlier times, "frei" and days not named mean nothing to enter. Time spans ("17:30-20:45 Abendschule")
// are left out: those are recurring and entered once on the site. No Discord here, so it can be tested alone.
export const LATE_FROM = '19:00';
const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
const DAY_MS = 864e5;
const addDays = (key, n) => new Date(Date.parse(key + 'T12:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = key => (new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
const valid = key => { const d = new Date(key + 'T12:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key; };

// "16.11" → the year that puts it closest to today (a plan from December can run into January)
function dateNear(day, month, year, today) {
	const key = y => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	if (year) return valid(key(String(year).length === 2 ? 2000 + +year : year)) ? key(String(year).length === 2 ? 2000 + +year : year) : null;
	const now = Date.parse(today + 'T12:00:00Z'), y = +today.slice(0, 4);
	return [y - 1, y, y + 1].map(key).filter(valid).sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now))[0] ?? null;
}
const clock = (h, m = '00') => +h < 24 && +m < 60 ? `${String(+h).padStart(2, '0')}:${m}` : null;

// → Map day → "HH:MM" (away until then) or null (nothing to enter), for every day of the weeks in the message
export function readShifts(message, today) {
	const text = String(message ?? '');
	const header = /woche\s*\d*\s*:?\s*(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/gi;
	const heads = [...text.matchAll(header)];
	const plan = new Map();
	heads.forEach((h, i) => {
		const first = dateNear(h[1], h[2], h[3], today), last = dateNear(h[4], h[5], h[6], today);
		if (!first || !last || last < first || (Date.parse(last) - Date.parse(first)) / DAY_MS > 13) return;
		const week = [];
		for (let d = first; d <= last; d = addDays(d, 1)) { week.push(d); plan.set(d, null); }
		const body = text.slice(h.index + h[0].length, heads[i + 1]?.index ?? text.length);
		// clauses: "Montag und Freitag 16:00 Uhr" / "Mittwoch frei" / "… 17:30-20:45 Abendschule"
		for (const clause of body.split(/[,;\n]|\.(?=\s|$)/)) {
			const days = WEEKDAYS.flatMap((name, wd) => new RegExp(`(?<![\\p{L}])${name}s?(?![\\p{L}])`, 'iu').test(clause) ? [wd] : []);
			if (!days.length || /\bfrei\b/i.test(clause) || /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/.test(clause)) continue;
			const t = clause.match(/(?<![\d.])(\d{1,2})(?::(\d{2}))?\s*uhr/i) || clause.match(/(?<![\d.])(\d{1,2}):(\d{2})(?![\d])/);
			const at = t && clock(t[1], t[2]);
			if (!at) continue;
			for (const d of week) if (days.includes(weekdayOf(d))) plan.set(d, at >= LATE_FROM ? at : null);
		}
	});
	return plan;
}
