// Work plans (Schichtpläne) from Discord as absences, once a day (GitHub run shift-plan.yml, before the 9:00 post).
// shift-plan.json names the messages (channel, message, person); the message is read with the bot's token
// (secret DISCORD_BOT_TOKEN, the one that pins the daily post; reading message text needs the bot's
// "Message Content Intent"). shift-text.mjs reads it: a day the person is only there from 19:00 on becomes
// "abwesend bis …" in moves.json. Only absences this job entered itself are ever changed or removed
// (kept in shift-plan.json "applied"); whatever someone entered by hand stays. Days before today are left alone.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readShifts } from './shift-text.mjs';

// moves.json's absences with the plan's wanted days; returns the new list and what the job now owns
export function applyPlan(absent, plan, wanted, today) {
	const list = absent.map(x => ({ ...x, people: [...x.people] }));
	const applied = Object.fromEntries(Object.entries(plan.applied || {}).filter(([d]) => d >= today));
	const entryOf = day => list.find(x => x.day === day && x.people.includes(plan.person));
	const ours = day => { const x = entryOf(day); return !!x && !!applied[day] && !x.from && x.until === applied[day]; };
	let changed = false;
	for (const day of [...new Set([...wanted.keys(), ...Object.keys(applied)])].filter(d => d >= today).sort()) {
		const want = wanted.get(day) ?? null, have = entryOf(day);
		if (have && !ours(day)) { delete applied[day]; continue; } // someone's own entry: stays as it is
		if ((have?.until ?? null) === want) continue;
		if (have) have.people = have.people.filter(p => p !== plan.person);
		if (want) {
			const same = list.find(x => x.day === day && !x.from && x.until === want);
			if (same) same.people.push(plan.person); else list.push({ day, people: [plan.person], until: want });
			applied[day] = want;
		} else delete applied[day];
		changed = true;
	}
	return { absent: list.filter(x => x.people.length).sort((a, b) => a.day.localeCompare(b.day)), applied, changed };
}

const berlinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

async function readMessage({ channelId, messageId }, token) {
	const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
		headers: { Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (https://github.com/RyoTsushigawa/anime-schedule, 1)' },
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`Discord answered ${res.status}${res.status === 403 ? ' (can the bot see that channel?)' : res.status === 404 ? ' (message or channel gone?)' : ''}`);
	return (await res.json()).content || '';
}

async function main() {
	const token = process.env.DISCORD_BOT_TOKEN || '';
	if (!token) { console.log('No DISCORD_BOT_TOKEN: nothing to read.'); return; }
	const config = JSON.parse(readFileSync('shift-plan.json', 'utf8'));
	const file = JSON.parse(readFileSync('moves.json', 'utf8'));
	const today = berlinToday();
	let moved = false, remembered = false;
	for (const plan of config.plans || []) {
		let text;
		try { text = await readMessage(plan, token); } catch (e) { console.log(`::warning::Schichtplan of ${plan.person}: ${e.message}`); continue; }
		if (!text.trim()) { console.log(`::warning::Schichtplan of ${plan.person}: the message text is empty. Turn on "Message Content Intent" for the bot (Discord Developer Portal › Bot).`); continue; }
		const wanted = readShifts(text, today);
		if (!wanted.size) { console.log(`::warning::Schichtplan of ${plan.person}: no week like "Woche 1: 16.11-21.11" found.`); continue; }
		const result = applyPlan(Array.isArray(file.absent) ? file.absent : [], plan, wanted, today);
		const late = [...wanted].filter(([d, until]) => d >= today && until).map(([d, until]) => `${d} bis ${until}`);
		console.log(`Schichtplan of ${plan.person}: ${late.join(', ') || 'no late days ahead'}${result.changed ? ' (entered)' : ' (unchanged)'}`);
		if (result.changed) { file.absent = result.absent; moved = true; }
		if (JSON.stringify(result.applied) !== JSON.stringify(plan.applied || {})) { plan.applied = result.applied; remembered = true; }
	}
	if (moved) { file.updated = new Date().toISOString(); writeFileSync('moves.json', JSON.stringify(file, null, 1) + '\n'); }
	if (remembered || moved) writeFileSync('shift-plan.json', JSON.stringify(config, null, 1) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error(e); process.exit(1); });
