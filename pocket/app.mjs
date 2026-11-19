// Pocket-Sammlung (pocket/): the group's Pokémon TCG Pocket collections, with alternate accounts, wishlist and
// chase cards, completion per set, which pack to open, trade partners and trade worth. German and English.
// Standalone: only files in this folder. Cards: cards.json (tools/build-cards.mjs, daily). Collections: its own
// Worker (worker/, URL in config.json); you save only your own, with your PIN. Rules: core.mjs. Trades: Discord.
import { parseZoneCsv, previewZoneImport } from './zone-import.mjs';
import { parseBulkCards } from './bulk-import.mjs';
import { MAX_ACCOUNTS, MAX_COPIES, emptyRecord, normalize, counts, onAccounts, tradeable, spares, completion, packOdds, worth, tradeFor, matches, ownMoves, cardMap, diff, applyDiff, isEmptyDiff, packList, packCards, accountWith } from './core.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stored = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };
const JOIN = '\u0001join';
const PAGE = 120;
const IMG = c => `cards/${encodeURIComponent(c.s)}/${c.n}.webp`;
const TEXT = {
  de: {
    back: 'Zum Plan', title: 'Pocket-Sammlung', subtitle: 'Pokémon TCG Pocket · Sammlung, Fortschritt und Tausch in der Gruppe',
    person: 'Du bist', readOnly: 'Nur lesen', account: 'Konto', allAccounts: 'Alle Konten', manageAccounts: 'Konten verwalten',
    tabCards: 'Sammlung', tabProgress: 'Fortschritt', tabTrade: 'Tausch', tabWorth: 'Tauschwert',
    allSets: 'Alle Sets', allRarities: 'Alle Seltenheiten', search: 'Karte suchen (Name oder A1-25)',
    show: { all: 'Alle Karten', missing: 'Fehlend', owned: 'Im Besitz', spare: 'Doppelt', wish: 'Wunschliste', chase: 'Chase' },
    tapHint: a => `Tippen auf eine Karte: +1 auf „${a}“. − nimmt eine weg, ♡ Wunschliste, ★ Chase, ⓘ Details.`,
    pickAccount: 'Zum Eintragen oben ein Konto wählen (oder ⓘ einer Karte öffnen).', viewOnly: p => `Die Sammlung von ${p} · nur lesen.`,
    shown: (n, all) => `${n} von ${all} Karten`, more: n => `${n} weitere zeigen`, none: 'Keine Karten für diese Auswahl.',
    loading: 'Lädt …', notSetUp: 'Die Pocket-Sammlung ist hier nicht eingerichtet.', loadFailed: m => 'Konnte nicht laden: ' + m, noCards: 'Die Kartenliste fehlt noch.',
    saving: 'Speichert …', saved: 'Gespeichert', saveFailed: m => 'Nicht gespeichert: ' + m, conflict: 'Auf einem anderen Gerät geändert: neu geladen, bitte die letzte Änderung prüfen.',
    confirmFirst: p => `Bestätige zuerst oben, dass du ${p} bist.`,
    packsTitle: 'Welches Pack öffnen?', packsHint: 'Gerechnet mit den Ziehraten des Sets für das gewählte Konto (oder alle zusammen). „Wunsch/Chase“ ist die Chance, in einem Pack eine Karte von deiner Wunschliste oder Chase-Liste zu ziehen.',
    pack: 'Pack', estimated: 'Für dieses Set gibt es noch keine Ziehraten: geschätzt mit denen des letzten Sets.', newPerPack: 'Neue Karten / Pack', anyNew: 'Mind. 1 neue', anyWanted: 'Wunsch/Chase', missingCol: 'Fehlend',
    setsTitle: 'Sets', setsClick: 'Antippen: fehlende Karten zeigen', noPacks: 'Keine Packs mit fehlenden Karten.',
    tradeHint: 'Wer aus der Gruppe passt zu dir: deine doppelten Karten, die jemand will, gegen doppelte Karten, die du willst. Getauscht wird im Spiel immer gleiche Seltenheit; abgesprochen auf Discord.',
    onlyWanted: 'Nur Wunschliste und Chase (sonst zählt jede fehlende Karte)', ownTitle: 'Zwischen deinen eigenen Konten',
    ownLine: (from, to) => `${from} → ${to}`, noMatches: 'Gerade passt niemand. Je mehr Leute ihre Sammlung eintragen, desto mehr Treffer.',
    give: 'Du gibst', get: 'Du bekommst', copy: 'Discord-Text kopieren', copied: 'Kopiert', friendId: 'Freundes-ID',
    discord: (p, lines) => `@${p} Tausch für Pocket?\n${lines.join('\n')}`, discordLine: (r, give, get) => `${r}: ich gebe ${give}, hätte gern ${get}`, or: ' oder ',
    worthHint: 'Tauschwert = wie viele aus der Gruppe eine Karte wollen (Chase 3, Wunschliste 2, fehlt 1) geteilt durch die doppelten Exemplare der anderen + 1. Getauscht wird gleiche Seltenheit: gegen eine Karte bekommst du jede gleicher Seltenheit mit kleinerem Wert.',
    worthMine: 'Deine doppelten Karten nach Tauschwert', worthGroup: 'Die gefragtesten Karten der Gruppe', wantedBy: 'gewollt von', heldBy: 'doppelt bei',
    getsFor: n => `Dafür bekommst du: ${n} ${n === 1 ? 'Karte' : 'Karten'}`, nobody: 'niemand', noSpares: 'Du hast noch keine doppelten tauschbaren Karten eingetragen.',
    tradeCost: n => `Tausch kostet ${n.toLocaleString('de-DE')} Sternenstaub`, notTradeable: 'Nicht tauschbar', wish: 'Wunschliste', chase: 'Chase',
    group: 'In der Gruppe', value: 'Tauschwert',
    accountsHint: 'Hauptkonto und Zweitkonten. Die Freundes-ID hilft beim Tausch (Discord).', addAccount: '+ Konto', remove: 'Entfernen',
    accountName: 'Name', removeConfirm: a => `Konto „${a}“ mit allen eingetragenen Karten entfernen?`, newAccount: n => 'Zweitkonto ' + n,
    join: '+ Neu dabei', yourName: 'Dein Name', pin: 'PIN', login: 'Anmelden', joinNow: 'Beitreten', logout: 'Abmelden',
    loggedIn: p => `✓ Angemeldet als ${p}`, needPin: p => `Mit deiner PIN als ${p} anmelden, um zu bearbeiten:`, joinHint: 'Name und PIN (4–32 Zeichen) wählen. Die PIN bleibt auf diesem Gerät gespeichert.',
    groupCode: 'Gruppencode', groupCodeHint: 'Der Gruppencode fehlt auf diesem Gerät:', save: 'Speichern',
    quickBtn: '⚡ Schnell erfassen', quickAll1: 'Alle fehlenden auf 1', quickAll0: 'Ganzes Set auf 0',
    quickHint: acc => `Wie viele hast du? Zahl antippen: wird auf „${acc}“ gespeichert und springt zur nächsten Karte. 0 = fehlt, → = überspringen, ← = zurück. Am PC gehen Zifferntasten und Pfeile. Tipp: erst „Alle fehlenden auf 1“, dann nur Doppelte und Fehlende ändern.`,
    quickProgress: (have, total, done) => `${have}/${total} im Besitz · ${done} bearbeitet`, quickAll0Confirm: (set, acc) => `Alle Karten von „${set}“ auf „${acc}“ auf 0 setzen?`, quickEnd: 'Ende des Sets erreicht.',
    packBtn: '＋ Pack geöffnet', packTitle: 'Pack geöffnet', undo: 'Rückgängig', done: 'Fertig', newCard: 'NEU',
    packHint: (n, acc) => `Tippe die ${n} gezogenen Karten an (Reihenfolge egal). Danach wird sie automatisch auf „${acc}“ gespeichert, und das nächste Pack beginnt. Eine Karte in der Leiste antippen nimmt sie wieder raus.`,
    packSaved: (n, acc) => `✓ ${n} Karten auf „${acc}“ eingetragen. Nächstes Pack:`,
    tradePick: 'Getauscht? Deine Karte und die von der anderen Person antippen, dann „Getauscht“: beide Sammlungen werden angepasst.',
    traded: 'Getauscht', tradeSaved: 'Tausch eingetragen, bei euch beiden.', historyTitle: 'Letzte Tausche',
    tradeLine: (a, b, gave, got) => `${a} gab ${gave} an ${b} und bekam ${got}`, undone: 'rückgängig gemacht',
    notice: (by, gave, got) => `${by} hat einen Tausch mit dir eingetragen: du gabst ${got} und bekamst ${gave}. Deine Sammlung ist schon angepasst.`, ok: 'OK',
    errors: { 'card not owned': 'Eine der Karten ist nicht (mehr) eingetragen.', 'invalid trade': 'Ungültiger Tausch.', 'unknown trade': 'Diesen Tausch gibt es nicht mehr.', 'wrong pin': 'Falsche PIN.', 'pin needed': 'PIN nötig (4–32 Zeichen).', locked: 'Zu viele falsche PINs: in 15 Minuten nochmal.', 'name taken': 'Den Namen gibt es schon.', 'invalid name': 'Ungültiger Name.', 'group full': 'Die Gruppe ist voll.', 'unknown person': 'Unbekannte Person.', 'group code': 'Gruppencode fehlt oder falsch.', 'not set up': 'Der Speicher ist noch nicht eingerichtet.' },
  },
  en: {
    back: 'Back to schedule', title: 'Pocket Collection', subtitle: 'Pokémon TCG Pocket · collection, progress and trading in the group',
    person: 'You are', readOnly: 'Read only', account: 'Account', allAccounts: 'All accounts', manageAccounts: 'Manage accounts',
    tabCards: 'Collection', tabProgress: 'Progress', tabTrade: 'Trade', tabWorth: 'Trade worth',
    allSets: 'All sets', allRarities: 'All rarities', search: 'Search a card (name or A1-25)',
    show: { all: 'All cards', missing: 'Missing', owned: 'Owned', spare: 'Duplicates', wish: 'Wishlist', chase: 'Chase' },
    tapHint: a => `Tap a card: +1 on “${a}”. − removes one, ♡ wishlist, ★ chase, ⓘ details.`,
    pickAccount: 'Choose an account above to add cards (or open ⓘ on a card).', viewOnly: p => `${p}'s collection · read only.`,
    shown: (n, all) => `${n} of ${all} cards`, more: n => `Show ${n} more`, none: 'No cards for this selection.',
    loading: 'Loading …', notSetUp: 'The Pocket Collection is not set up here.', loadFailed: m => 'Could not load: ' + m, noCards: 'The card list is missing.',
    saving: 'Saving …', saved: 'Saved', saveFailed: m => 'Not saved: ' + m, conflict: 'Changed on another device: reloaded, please check your last change.',
    confirmFirst: p => `First confirm above that you are ${p}.`,
    packsTitle: 'Which pack to open?', packsHint: 'Using the set\'s pull rates for the chosen account (or all together). “Wish/chase” is the chance of pulling a card from your wishlist or chase list in one pack.',
    pack: 'Pack', estimated: 'No pull rates for this set yet: estimated with the previous set\'s.', newPerPack: 'New cards / pack', anyNew: '≥1 new', anyWanted: 'Wish/chase', missingCol: 'Missing',
    setsTitle: 'Sets', setsClick: 'Tap: show missing cards', noPacks: 'No packs with missing cards.',
    tradeHint: 'Who in the group fits you: your duplicates someone wants, for duplicates you want. In-game trades are always the same rarity; arrange them on Discord.',
    onlyWanted: 'Only wishlist and chase (otherwise every missing card counts)', ownTitle: 'Between your own accounts',
    ownLine: (from, to) => `${from} → ${to}`, noMatches: 'Nobody fits right now. The more people enter their collection, the more matches.',
    give: 'You give', get: 'You get', copy: 'Copy Discord text', copied: 'Copied', friendId: 'Friend ID',
    discord: (p, lines) => `@${p} Pocket trade?\n${lines.join('\n')}`, discordLine: (r, give, get) => `${r}: I give ${give}, would like ${get}`, or: ' or ',
    worthHint: 'Trade worth = how much the group wants a card (chase 3, wishlist 2, missing 1) divided by the others\' duplicate copies + 1. Trades are the same rarity: for a card you can get any card of its rarity with a lower worth.',
    worthMine: 'Your duplicates by trade worth', worthGroup: 'The most wanted cards in the group', wantedBy: 'wanted by', heldBy: 'duplicate with',
    getsFor: n => `For it you get: ${n} ${n === 1 ? 'card' : 'cards'}`, nobody: 'nobody', noSpares: 'You have not entered any tradeable duplicates yet.',
    tradeCost: n => `Trade costs ${n.toLocaleString('en')} shinedust`, notTradeable: 'Not tradeable', wish: 'Wishlist', chase: 'Chase',
    group: 'In the group', value: 'Trade worth',
    accountsHint: 'Main and alternate accounts. The friend ID helps with trades (Discord).', addAccount: '+ Account', remove: 'Remove',
    accountName: 'Name', removeConfirm: a => `Remove account “${a}” with all its cards?`, newAccount: n => 'Alt ' + n,
    join: '+ New here', yourName: 'Your name', pin: 'PIN', login: 'Log in', joinNow: 'Join', logout: 'Log out',
    loggedIn: p => `✓ Logged in as ${p}`, needPin: p => `Log in with your PIN as ${p} to edit:`, joinHint: 'Choose a name and a PIN (4–32 characters). The PIN stays saved on this device.',
    groupCode: 'Group code', groupCodeHint: 'The group code is missing on this device:', save: 'Save',
    quickBtn: '⚡ Quick entry', quickAll1: 'All missing to 1', quickAll0: 'Whole set to 0',
    quickHint: acc => `How many do you have? Tap the number: it saves to “${acc}” and moves to the next card. 0 = missing, → = skip, ← = back. On a computer, number keys and arrows work. Tip: first “All missing to 1”, then change only duplicates and missing cards.`,
    quickProgress: (have, total, done) => `${have}/${total} owned · ${done} edited`, quickAll0Confirm: (set, acc) => `Set every card of “${set}” on “${acc}” to 0?`, quickEnd: 'End of the set.',
    packBtn: '+ Pack opened', packTitle: 'Pack opened', undo: 'Undo', done: 'Done', newCard: 'NEW',
    packHint: (n, acc) => `Tap the ${n} cards you pulled (any order). Then it saves to “${acc}” by itself and the next pack starts. Tap a card in the tray to take it out.`,
    packSaved: (n, acc) => `✓ ${n} cards added to “${acc}”. Next pack:`,
    tradePick: 'Traded? Tap your card and theirs, then “Traded”: both collections are updated.',
    traded: 'Traded', tradeSaved: 'Trade logged, for both of you.', historyTitle: 'Recent trades',
    tradeLine: (a, b, gave, got) => `${a} gave ${gave} to ${b} and got ${got}`, undone: 'undone',
    notice: (by, gave, got) => `${by} logged a trade with you: you gave ${got} and got ${gave}. Your collection is already updated.`, ok: 'OK',
    errors: { 'card not owned': 'One of the cards is not (or no longer) entered.', 'invalid trade': 'Invalid trade.', 'unknown trade': 'That trade no longer exists.', 'wrong pin': 'Wrong PIN.', 'pin needed': 'PIN needed (4–32 characters).', locked: 'Too many wrong PINs: try again in 15 minutes.', 'name taken': 'That name is taken.', 'invalid name': 'Invalid name.', 'group full': 'The group is full.', 'unknown person': 'Unknown person.', 'group code': 'Group code missing or wrong.', 'not set up': 'Storage is not set up yet.' },
  },
};
let lang = (() => { try { const l = localStorage.getItem('pocketLang'); if (l === 'de' || l === 'en') return l; } catch {} return /^de/i.test(navigator.language || 'de') ? 'de' : 'en'; })();
const T = () => TEXT[lang];
let api = '', data = null, cards = new Map(), people = {}, serverCopy = {}, base = null, record = null, verified = '', tab = 'cards', limit = PAGE, saveTimer = 0, saving = false, again = false, loadTurn = 0;
const person = () => $('pkPerson').value === JOIN ? '' : $('pkPerson').value;
const viewed = person;
const mine = () => !!person() && verified === person();
const pinKey = p => 'pocketPin:' + p;
const scope = () => $('pkAccount').value || 'all';
const nameOf = c => (lang === 'de' && c.de) || c.en;
const setName = code => { const s = data.sets.find(x => x.code === code); return s ? s.name[lang] || s.name.en : code; };
const pct = v => (v * 100).toLocaleString(lang, { maximumFractionDigits: v < 0.1 ? 1 : 0 }) + ' %';
function rarity(r) {
  const x = data.rarities[r]; if (!x) return r;
  const n = Math.max(1, x.count || 1);
  return { Diamond: '◆'.repeat(n), Star: '★'.repeat(n), Crown: '♛', Shiny: '✦'.repeat(n) }[x.group] || x.label;
}
const label = c => `${nameOf(c)} (${c.id})`;

async function call(path, body, pin = '') {
  const code = stored.get('pocketGroupCode');
  const res = await fetch(api + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { ...(code && { 'X-Group-Code': code }), ...(pin && { 'X-Pocket-Pin': pin }), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && out.error === 'group code') { askGroupCode(); }
  if (res.status === 409 && out.conflict) return out;
  if (!res.ok) throw new Error(T().errors[out.error] || out.error || 'HTTP ' + res.status);
  return out;
}

// ---------- who you are: a name and a PIN, kept on this device ----------
function askGroupCode() {
  const box = $('pkLogin'); box.className = 'pk-login';
  box.innerHTML = `<span>${esc(T().groupCodeHint)}</span><input type="password" class="pill" id="pkCode" autocomplete="off" placeholder="${esc(T().groupCode)}"><button type="button" class="pill primary" id="pkCodeSave">${esc(T().save)}</button>`;
  $('pkCodeSave').onclick = () => { const v = $('pkCode').value.trim(); if (v.length < 16) return; stored.set('pocketGroupCode', v); load(); };
}
function drawLogin(error = '') {
  const box = $('pkLogin'), who = person();
  box.className = 'pk-login' + (mine() ? ' ok' : '');
  const err = error ? ` <b class="pk-hint err">${esc(error)}</b>` : '';
  if ($('pkPerson').value === JOIN) {
    box.innerHTML = `<span>${esc(T().joinHint)}</span><input class="pill" id="pkJoinName" maxlength="30" placeholder="${esc(T().yourName)}" autocomplete="nickname"><input type="password" class="pill" id="pkPin" maxlength="32" placeholder="${esc(T().pin)}" autocomplete="new-password"><button type="button" class="pill primary" id="pkJoin">${esc(T().joinNow)}</button>${err}`;
    $('pkJoin').onclick = join;
  } else if (!who) box.replaceChildren();
  else if (mine()) {
    box.innerHTML = `<span>${esc(T().loggedIn(who))}</span><button type="button" class="pill" id="pkLogout">${esc(T().logout)}</button>`;
    $('pkLogout').onclick = () => { stored.set(pinKey(who), ''); verified = ''; drawLogin(); fillAccounts(); draw(); };
  } else {
    box.innerHTML = `<span>${esc(T().needPin(who))}</span><input type="password" class="pill" id="pkPin" maxlength="32" placeholder="${esc(T().pin)}" autocomplete="current-password"><button type="button" class="pill primary" id="pkLoginBtn">${esc(T().login)}</button>${err}`;
    $('pkLoginBtn').onclick = () => login(who, $('pkPin').value);
    $('pkPin').onkeydown = e => { if (e.key === 'Enter') $('pkLoginBtn').click(); };
  }
}
async function login(who, pin, quiet = false) {
  try { await call('/login', { person: who }, pin); stored.set(pinKey(who), pin); verified = who; }
  catch (err) { verified = ''; if (!quiet) return drawLogin(err.message); stored.set(pinKey(who), ''); }
  pickRecord(); drawLogin(); draw();
}
async function join() {
  const who = $('pkJoinName').value.trim(), pin = $('pkPin').value;
  try {
    await call('/join', { person: who }, pin);
    stored.set(pinKey(who), pin); stored.set('pocketPerson', who); verified = who;
    people[who] = normalize(emptyRecord()); fillPeople(who); load();
  } catch (err) { drawLogin(err.message); }
}
function fillPeople(select) {
  const names = Object.keys(people).sort((a, b) => a.localeCompare(b, 'de'));
  $('pkPerson').replaceChildren(new Option(T().readOnly, ''), ...names.map(p => new Option(p, p)), new Option(T().join, JOIN));
  $('pkPerson').value = names.includes(select) || select === JOIN ? select : '';
  $('pkPerson').disabled = false;
}

// ---------- language ----------
function applyLanguage() {
  document.documentElement.lang = lang;
  document.title = T().title;
  for (const el of document.querySelectorAll('[data-t]')) { const v = T()[el.dataset.t]; if (typeof v === 'string') el.textContent = v; }
  for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('on', b.dataset.lang === lang);
  $('pkSearch').placeholder = T().search;
  if (data) { fillFilters(); fillAccounts(); }
  const opts = $('pkPerson').options; if (opts.length) { opts[0].textContent = T().readOnly; opts[opts.length - 1].textContent = T().join; }
  drawLogin(); draw();
}
document.querySelector('.pk-lang').onclick = e => {
  const b = e.target.closest('[data-lang]'); if (!b) return;
  lang = b.dataset.lang; try { localStorage.setItem('pocketLang', lang); } catch {}
  applyLanguage();
};

function fillFilters() {
  const keep = id => $(id).value;
  const [set, rar, show, wr] = ['pkSet', 'pkRarity', 'pkShow', 'pkWorthRarity'].map(keep);
  const sets = [...data.sets].reverse();
  $('pkSet').replaceChildren(new Option(T().allSets, ''), ...sets.map(s => new Option(`${s.name[lang] || s.name.en} (${s.code})`, s.code)));
  $('pkSet').value = set ?? '';
  if (set === '' && !$('pkSet').dataset.init) { const size = code => data.cards.filter(c => c.s === code).length, newest = sets.find(s => !/^PROMO/.test(s.code));
    $('pkSet').value = sets.filter(s => !/^PROMO/.test(s.code) && s.release === newest?.release).sort((a, b) => size(b.code) - size(a.code))[0]?.code || ''; $('pkSet').dataset.init = '1'; }
  const rarities = Object.keys(data.rarities).filter(r => data.cards.some(c => c.r === r));
  const opts = all => [new Option(all, ''), ...rarities.map(r => new Option(`${rarity(r)} ${data.rarities[r].label}`, r))];
  $('pkRarity').replaceChildren(...opts(T().allRarities)); $('pkRarity').value = rar || '';
  $('pkWorthRarity').replaceChildren(...opts(T().allRarities).filter(o => !o.value || data.rarities[o.value].tradeable)); $('pkWorthRarity').value = wr || '';
  $('pkShow').replaceChildren(...Object.entries(T().show).map(([k, v]) => new Option(v, k))); $('pkShow').value = show || 'all';
}
function fillAccounts() {
  const keep = $('pkAccount').value;
  const accounts = record?.accounts || [];
  $('pkAccount').replaceChildren(...(accounts.length > 1 ? [new Option(T().allAccounts, 'all')] : []), ...accounts.map(a => new Option(a.name, a.id)));
  $('pkAccount').value = accounts.some(a => a.id === keep) || (keep === 'all' && accounts.length > 1) ? keep : accounts[0]?.id || 'all';
  $('pkAccount').disabled = accounts.length < 2;
  $('pkAccounts').hidden = !mine();
  $('pkPackBtn').hidden = !mine();
  $('pkQuickBtn').hidden = !mine();
  $('pkImportBtn').hidden = !mine();
}


 // Pokémon Zone CSV import is local-only until the user confirms a preview.
let zoneParsed = null;
const importText = () => lang === 'de' ? {
  help: 'CSV aus Pokémon Zone Exporter auswählen. Importiert nur in das ausgewählte Konto; Wunschlisten bleiben unverändert.',
  replace: 'Vollständige Sammlung ersetzen (nicht aufgeführte Karten entfernen)',
  apply: 'Änderungen übernehmen', close: 'Schließen', choose: 'Bitte zuerst ein Konto auswählen.',
  noFile: 'Bitte eine CSV-Datei auswählen.', error: 'CSV konnte nicht gelesen werden: ',
  unsafe: 'Unbekannte oder ungültige Zeilen gefunden. Bitte die Datei prüfen. Ersetzen ist deaktiviert.',
  ready: (n, u, bad) => n + ' Änderungen · ' + u + ' unbekannte Karten · ' + bad + ' ungültige Zeilen',
  done: n => n + ' Karten aktualisiert.'
} : {
  help: 'Choose a Pokémon Zone Exporter CSV. Imports into the selected account only; wishlists are preserved.',
  replace: 'Replace full collection (remove cards absent from CSV)',
  apply: 'Apply changes', close: 'Close', choose: 'Select one account first.',
  noFile: 'Choose a CSV file first.', error: 'Could not read CSV: ',
  unsafe: 'Unknown cards or invalid rows found. Check the file. Replace is disabled.',
  ready: (n, u, bad) => n + ' changes · ' + u + ' unknown cards · ' + bad + ' invalid rows',
  done: n => n + ' cards updated.'
};
function refreshZonePreview() {
  const t = importText(), account = scope(), target = record?.owned?.[account];
  $('pkImportApply').textContent = t.apply;
  $('pkImportClose').textContent = t.close;
  $('pkImportHelp').textContent = $('pkImportSource').value === 'bulk' ? (lang === 'de' ? 'Karten-IDs und Anzahl pro Zeile, z.B. A1-1 2 oder A1: 1-50. Fehlende Karten bleiben erhalten.' : 'Card IDs and counts per line, e.g. A1-1 2 or A1: 1-50. Absent cards are preserved.') : t.help;
  $('pkImportModeText').textContent = t.replace;
  if (!zoneParsed || !target || account === 'all') { $('pkImportApply').disabled = true; return; }
  const unsafe = zoneParsed.unknown.length || zoneParsed.invalid.length;
  $('pkImportReplace').disabled = !!unsafe || $('pkImportSource').value === 'bulk';
  if (unsafe) $('pkImportReplace').checked = false;
  const changes = previewZoneImport(target, zoneParsed.owned, $('pkImportReplace').checked);
  $('pkImportStatus').textContent = t.ready(changes.length, zoneParsed.unknown.length, zoneParsed.invalid.length) + (unsafe ? ' · ' + t.unsafe : '');
  $('pkImportPreview').textContent = changes.slice(0, 100).map(c => c.id + ': ' + c.before + ' → ' + c.after).join(' · ') + (changes.length > 100 ? ' …' : '');
  $('pkImportApply').disabled = !changes.length || !mine();
}
$('pkImportBtn').onclick = () => {
  if (!mine()) return;
  zoneParsed = null;
  $('pkImportFile').value = '';
  $('pkImportBulk').value = '';
  $('pkImportSource').value = 'csv';
  $('pkImportFileLabel').hidden = false;
  $('pkImportBulkLabel').hidden = true;
  $('pkImportReplace').checked = false;
  $('pkImportReplace').disabled = false;
  $('pkImportPreview').textContent = '';
  $('pkImportStatus').textContent = '';
  refreshZonePreview();
  if (scope() === 'all') { $('pkImportStatus').textContent = importText().choose; $('pkImportApply').disabled = true; }
  $('pkImportDlg').showModal();
};
$('pkImportFile').onchange = async () => {
  zoneParsed = null;
  $('pkImportApply').disabled = true;
  const file = $('pkImportFile').files?.[0];
  if (!file) { $('pkImportStatus').textContent = importText().noFile; return; }
  try {
    if (file.size > 3000000) throw Error('File too large');
    zoneParsed = parseZoneCsv(await file.text(), new Set(cards.keys()));
    refreshZonePreview();
  } catch (err) { $('pkImportStatus').textContent = importText().error + err.message; }
};
$('pkImportSource').onchange = () => {
  zoneParsed = null;
  const bulk = $('pkImportSource').value === 'bulk';
  $('pkImportBulkLabel').hidden = !bulk;
  $('pkImportFileLabel').hidden = bulk;
  $('pkImportReplace').checked = false;
  $('pkImportReplace').disabled = bulk;
  $('pkImportStatus').textContent = '';
  $('pkImportPreview').textContent = '';
  refreshZonePreview();
};
$('pkImportBulk').oninput = () => {
  try { zoneParsed = parseBulkCards($('pkImportBulk').value, new Set(cards.keys())); refreshZonePreview(); }
  catch (err) { zoneParsed = null; $('pkImportApply').disabled = true; $('pkImportStatus').textContent = err.message; }
};
$('pkImportReplace').onchange = refreshZonePreview;
$('pkImportApply').onclick = () => {
  if (!zoneParsed || !mine() || scope() === 'all') return;
  const account = scope(), target = record.owned[account];
  const replace = $('pkImportSource').value === 'csv' && $('pkImportReplace').checked && !zoneParsed.unknown.length && !zoneParsed.invalid.length;
  const changes = previewZoneImport(target, zoneParsed.owned, replace);
  if (!changes.length) return;
  change(r => {
    const owned = r.owned[account];
    for (const c of changes) { if (c.after) owned[c.id] = c.after; else delete owned[c.id]; }
  });
  $('pkImportDlg').close();
  $('pkStatus').textContent = importText().done(changes.length);
};

// ---------- collection ----------
function filtered() {
  const set = $('pkSet').value, rar = $('pkRarity').value, show = $('pkShow').value, q = $('pkSearch').value.trim().toLowerCase();
  const owned = counts(record, scope()), extra = spares(record), wish = new Set(record.wish), chase = new Set(record.chase);
  return data.cards.filter(c => (!set || c.s === set) && (!rar || c.r === rar)
    && (!q || c.id.toLowerCase() === q || c.id.toLowerCase().startsWith(q + '') && /\d/.test(q) || c.en.toLowerCase().includes(q) || (c.de || '').toLowerCase().includes(q))
    && (show === 'all' || (show === 'missing' && !owned.get(c.id)) || (show === 'owned' && owned.get(c.id)) || (show === 'spare' && extra.get(c.id))
      || (show === 'wish' && wish.has(c.id)) || (show === 'chase' && chase.has(c.id))));
}
function drawCards() {
  const list = filtered(), owned = counts(record, scope()), wish = new Set(record.wish), chase = new Set(record.chase);
  const edit = mine(), account = scope() !== 'all' ? record.accounts.find(a => a.id === scope()) : null;
  $('pkCardsHint').textContent = [T().shown(Math.min(limit, list.length), list.length),
    !person() ? '' : !edit ? T().viewOnly(person()) : account ? T().tapHint(account.name) : T().pickAccount].filter(Boolean).join(' · ');
  $('pkGrid').innerHTML = list.length ? list.slice(0, limit).map(c => {
    const n = owned.get(c.id) || 0, where = scope() === 'all' && record.accounts.length > 1 ? onAccounts(record, c.id) : [];
    return `<div class="pk-card${n ? '' : ' missing'}" data-id="${esc(c.id)}">
      <button type="button" class="pk-art" data-add${edit && account ? '' : ' disabled'} aria-label="${esc(label(c))}"><img src="${IMG(c)}" alt="" loading="lazy" decoding="async">
      ${chase.has(c.id) ? '<span class="pk-flag" title="Chase">★</span>' : wish.has(c.id) ? '<span class="pk-flag">♡</span>' : ''}${n ? `<span class="pk-count">${n}</span>` : ''}</button>
      <div class="pk-meta"><b>${esc(nameOf(c))}</b><small>${esc(c.id)} · <span class="pk-rar">${esc(rarity(c.r))}</span></small>
      ${where.length ? `<span class="pk-acc">${where.map(a => esc(a.name) + ' ×' + a.n).join(' · ')}</span>` : ''}
      <span class="pk-tools"><button type="button" data-minus${edit && account && n ? '' : ' disabled'} aria-label="−1">−</button><button type="button" data-wish class="${wish.has(c.id) ? 'on' : ''}"${edit ? '' : ' disabled'} title="${esc(T().wish)}">♡</button><button type="button" data-chase class="${chase.has(c.id) ? 'on' : ''}"${edit ? '' : ' disabled'} title="Chase">★</button><button type="button" data-info title="Details">ⓘ</button></span></div></div>`;
  }).join('') : `<p class="pk-hint">${esc(T().none)}</p>`;
  $('pkMore').hidden = list.length <= limit;
  $('pkMore').textContent = T().more(Math.min(PAGE, list.length - limit));
}
function change(fn) {
  if (!mine()) { $('pkStatus').textContent = T().confirmFirst(person() || '…'); return; }
  fn(record); record = normalize(record); people[person()] = record; queueSave(); draw();
}
function add(id, accountId, delta) {
  change(r => { const o = r.owned[accountId] ||= {}; o[id] = Math.max(0, Math.min(MAX_COPIES, (o[id] || 0) + delta)); if (!o[id]) delete o[id]; });
}
function toggle(list, id) {
  change(r => {
    const other = list === 'wish' ? 'chase' : 'wish';
    r[other] = r[other].filter(x => x !== id);
    r[list] = r[list].includes(id) ? r[list].filter(x => x !== id) : [...r[list], id];
  });
}
$('pkGrid').onclick = e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  if (e.target.closest('[data-info]')) return openCard(id);
  if (e.target.closest('[data-wish]')) return toggle('wish', id);
  if (e.target.closest('[data-chase]')) return toggle('chase', id);
  if (scope() === 'all') return openCard(id);
  if (e.target.closest('[data-minus]')) return add(id, scope(), -1);
  if (e.target.closest('[data-add]')) return add(id, scope(), 1);
};
$('pkMore').onclick = () => { limit += PAGE; drawCards(); };
for (const id of ['pkSet', 'pkRarity', 'pkShow']) $(id).onchange = () => { limit = PAGE; drawCards(); };
$('pkSearch').oninput = () => { limit = PAGE; drawCards(); };

// ---------- one card ----------
let openId = '';
function openCard(id) { openId = id; drawCard(); if (!$('pkCardDlg').open) $('pkCardDlg').showModal(); }
function drawCard() {
  const c = cards.get(openId); if (!c) return;
  const r = data.rarities[c.r], edit = mine();
  $('pkCardImg').src = IMG(c);
  $('pkCardTitle').textContent = nameOf(c);
  $('pkCardMeta').textContent = [`${setName(c.s)} · ${c.id} · ${rarity(c.r)} ${r?.label || ''}`, lang === 'de' && c.de ? c.en : '',
    tradeable(data, c) ? (r.tradePrice ? T().tradeCost(r.tradePrice) : '') : T().notTradeable, c.p?.length ? c.p.join(', ') : ''].filter(Boolean).join(' · ');
  $('pkCardMarks').innerHTML = ['wish', 'chase'].map(l => `<button type="button" class="pill${record[l].includes(c.id) ? ' primary' : ''}" data-mark="${l}"${edit ? '' : ' disabled'}>${l === 'wish' ? '♡ ' + esc(T().wish) : '★ Chase'}</button>`).join('');
  $('pkCardAccounts').innerHTML = record.accounts.map(a => { const n = record.owned[a.id]?.[c.id] || 0; return `<div class="pk-stepper"><span>${esc(a.name)}</span>
    <button type="button" class="pill" data-step="-1" data-account="${a.id}"${edit && n ? '' : ' disabled'}>−</button><b>${n}</b><button type="button" class="pill" data-step="1" data-account="${a.id}"${edit ? '' : ' disabled'}>+</button></div>`; }).join('');
  let group = '';
  if (tradeable(data, c)) {
    const values = worth(data, people, viewed()), v = values.get(c.id);
    const held = Object.entries(people).filter(([p]) => p !== viewed()).map(([p, rec]) => [p, spares(rec).get(c.id), onAccounts(rec, c.id)]).filter(x => x[1]);
    const names = list => list.length ? list.map(esc).join(', ') : esc(T().nobody);
    group = `<h2>${esc(T().group)}</h2><p class="pk-hint">${esc(T().value)}: <b class="pk-value">${(v?.value || 0).toFixed(2)}</b> · ${esc(T().wantedBy)} ${names(v?.wantedBy || [])}<br>
      ${esc(T().heldBy)} ${held.length ? held.map(([p, , acc]) => esc(p) + ' (' + acc.map(a => esc(a.name) + ' ×' + a.n).join(', ') + ')').join(', ') : esc(T().nobody)}</p>`;
    if (viewed() && spares(record).get(c.id)) {
      const gets = tradeFor(data, people, viewed(), c.id, values);
      group += `<p class="pk-hint">${esc(T().getsFor(gets.length))}</p><div class="pk-chips">${gets.slice(0, 40).map(g => chip(g.card, g.want, g.from)).join('')}</div>`;
    }
  }
  $('pkCardGroup').innerHTML = group;
}
$('pkCardDlg').onclick = e => {
  const step = e.target.closest('[data-step]'), mark = e.target.closest('[data-mark]'), other = e.target.closest('[data-card]');
  if (step) add(openId, step.dataset.account, Number(step.dataset.step));
  else if (mark) toggle(mark.dataset.mark, openId);
  else if (other) { openId = other.dataset.card; }
  else return;
  drawCard();
};
const chip = (c, want, from = '') => `<button type="button" class="pk-chip want${want || 1}" data-card="${esc(c.id)}" title="${esc(c.id + (from ? ' · ' + from : ''))}">${want === 3 ? '★ ' : want === 2 ? '♡ ' : ''}${esc(nameOf(c))} <small>${esc(c.id)}</small></button>`;

// ---------- progress ----------
function drawProgress() {
  const owned = counts(record, scope()), wanted = new Set([...record.wish, ...record.chase]);
  const odds = packOdds(data, owned, wanted).filter(p => p.missing).sort((a, b) => (wanted.size ? b.anyWanted - a.anyWanted : 0) || b.expected - a.expected).slice(0, 12);
  $('pkPacks').innerHTML = odds.length ? `<table class="pk-table"><thead><tr><th>${esc(T().pack)}</th><th class="num">${esc(T().newPerPack)}</th><th class="num">${esc(T().anyNew)}</th>${wanted.size ? `<th class="num">${esc(T().anyWanted)}</th>` : ''}<th class="num">${esc(T().missingCol)}</th></tr></thead><tbody>${
    odds.map((p, i) => `<tr${i ? '' : ' class="best"'}><td>${esc(setName(p.set))} · ${esc(p.pack)}${p.estimated ? ` <small class="pk-hint" title="${esc(T().estimated)}">≈</small>` : ''}</td><td class="num">${p.expected.toLocaleString(lang, { maximumFractionDigits: 2 })}</td><td class="num">${pct(p.anyNew)}</td>${wanted.size ? `<td class="num">${pct(p.anyWanted)}</td>` : ''}<td class="num">${p.missing}/${p.cards}</td></tr>`).join('')}</tbody></table>` : `<p class="pk-hint">${esc(T().noPacks)}</p>`;
  $('pkSets').innerHTML = completion(data, owned).reverse().map(s => `<button type="button" class="pk-set" data-set="${esc(s.code)}" title="${esc(T().setsClick)}">
    <b>${esc(s.set.name[lang] || s.set.name.en)} <small class="pk-hint">${esc(s.code)}</small></b><span class="pk-bar"><span style="width:${(s.have / s.total * 100).toFixed(1)}%"></span></span>
    <span>${s.have} / ${s.total} · ${pct(s.have / s.total)}</span>
    <span class="pk-rarities">${Object.entries(s.byRarity).map(([r, [h, t]]) => `<span>${esc(rarity(r))} ${h}/${t}</span>`).join('')}</span></button>`).join('');
}
$('pkSets').onclick = e => {
  const set = e.target.closest('[data-set]')?.dataset.set; if (!set) return;
  $('pkSet').value = set; $('pkShow').value = 'missing'; $('pkRarity').value = ''; $('pkSearch').value = ''; limit = PAGE; showTab('cards');
};

// ---------- trade ----------
function drawTrade() {
  const me = viewed(); if (!me) { $('pkOwn').innerHTML = ''; $('pkMatches').innerHTML = `<p class="pk-hint">${esc(T().readOnly)}</p>`; return; }
  const only = $('pkOnlyWanted').checked;
  const moves = ownMoves(data, record);
  $('pkOwn').innerHTML = moves.length ? `<div class="pk-friend"><div class="pk-friend-head"><b>${esc(T().ownTitle)}</b></div>${
    Object.values(Object.groupBy(moves, m => m.from.id + '>' + m.to.id)).map(list => `<div class="pk-trade"><span>${esc(T().ownLine(list[0].from.name, list[0].to.name))}</span><div class="pk-chips" style="grid-column:2/-1">${list.slice(0, 60).map(m => chip(m.card, 1)).join('')}</div></div>`).join('')}</div>` : '';
  let found = matches(data, people, me);
  if (only) found = found.map(f => ({ ...f, trades: f.trades.map(t => ({ ...t, give: t.give.filter(x => x.want > 1), get: t.get.filter(x => x.want > 1) })).filter(t => t.give.length && t.get.length) })).filter(f => f.trades.length);
  drawHistory();
  $('pkMatches').innerHTML = (found.length ? `<p class="pk-hint">${esc(T().tradePick)}</p>` : '') + (found.length ? found.map(f => {
    const ids = f.record.accounts.filter(a => a.friendId).map(a => `${esc(a.name)}: ${esc(a.friendId)}`).join(' · ');
    return `<div class="pk-friend" data-person="${esc(f.person)}"><div class="pk-friend-head"><b>${esc(f.person)}</b>${ids ? `<span class="pk-hint">${esc(T().friendId)} ${ids}</span>` : ''}<button type="button" class="pill" data-copy>${esc(T().copy)}</button>${mine() && picked.person === f.person && picked.give && picked.get ? `<button type="button" class="pill primary" data-traded="${esc(f.person)}">✓ ${esc(T().traded)}</button>` : ''}</div>${
      f.trades.map(t => `<div class="pk-trade"><span>${esc(rarity(t.rarity))}</span><div class="pk-chips"><small>${esc(T().give)}</small>${t.give.slice(0, 24).map(x => pickChip(x.card, x.want, 'give', f.person) + (record.accounts.length > 1 ? `<small style="width:auto">${x.accounts.map(a => esc(a.name)).join('/')}</small>` : '')).join('')}${t.give.length > 24 ? `<small>+${t.give.length - 24}</small>` : ''}</div>
        <div class="pk-chips"><small>${esc(T().get)}</small>${t.get.slice(0, 24).map(x => pickChip(x.card, x.want, 'get', f.person)).join('')}${t.get.length > 24 ? `<small>+${t.get.length - 24}</small>` : ''}</div></div>`).join('')}</div>`;
  }).join('') : `<p class="pk-hint">${esc(T().noMatches)}</p>`);
  $('pkMatches').dataset.only = only ? '1' : '';
  lastMatches = found;
}
let lastMatches = [], picked = { person: '', give: '', get: '' };
const pickChip = (c, want, side, p) => `<button type="button" class="pk-chip want${want || 1}${picked.person === p && picked[side] === c.id ? ' picked' : ''}" data-pick="${side}" data-card-id="${esc(c.id)}" title="${esc(c.id)}">${want === 3 ? '★ ' : want === 2 ? '♡ ' : ''}${esc(nameOf(c))} <small>${esc(c.id)}</small></button>`;
function drawHistory() {
  const me = viewed(), list = [...(record.trades || [])].reverse().slice(0, 8);
  $('pkHistory').innerHTML = list.length ? `<div class="pk-friend pk-history"><div class="pk-friend-head"><b>${esc(T().historyTitle)}</b></div><ul>${list.map(t => {
    const gave = cards.get(t.gave), got = cards.get(t.got);
    return `<li class="${t.undone ? 'undone' : ''}">${esc(T().tradeLine(t.a, t.b, gave ? label(gave) : t.gave, got ? label(got) : t.got))}${t.undone ? ' · ' + esc(T().undone) : mine() && me ? `<button type="button" class="pill" data-undo-trade="${esc(t.id)}">${esc(T().undo)}</button>` : ''}</li>`;
  }).join('')}</ul></div>` : '';
}
async function logTrade(partner) {
  const who = person(); if (!mine()) return;
  try {
    if (saving || saveTimer) { clearTimeout(saveTimer); saveTimer = 0; await save(); }
    const out = await call('/trade', { person: who, partner, gave: picked.give, got: picked.get }, stored.get(pinKey(who)));
    serverCopy[who] = out.record; serverCopy[partner] = out.partner; people[partner] = normalize(copy(out.partner));
    adopt(out.record); picked = { person: '', give: '', get: '' };
    $('pkSave').className = 'pk-save'; $('pkSave').textContent = T().tradeSaved; draw();
  } catch (err) { $('pkSave').className = 'pk-save err'; $('pkSave').textContent = err.message; }
}
async function undoTrade(id) {
  const who = person(); if (!mine()) return;
  try {
    const out = await call('/trade/undo', { person: who, id }, stored.get(pinKey(who)));
    const partner = out.trade.a === who ? out.trade.b : out.trade.a;
    if (out.partner) { serverCopy[partner] = out.partner; people[partner] = normalize(copy(out.partner)); }
    serverCopy[who] = out.record; adopt(out.record); draw();
  } catch (err) { $('pkSave').className = 'pk-save err'; $('pkSave').textContent = err.message; }
}
// a trade a friend logged with you since you last looked
function drawNotice() {
  const who = person(), box = $('pkNotice');
  const seen = stored.get('pocketSeenTrade:' + who);
  const fresh = mine() ? (record.trades || []).filter(t => t.by !== who && !t.undone && (!seen || t.at > seen)) : [];
  box.hidden = !fresh.length;
  if (!fresh.length) return;
  box.innerHTML = fresh.map(t => { const gave = cards.get(t.gave), got = cards.get(t.got); return `<span>${esc(T().notice(t.by, gave ? label(gave) : t.gave, got ? label(got) : t.got))}</span>`; }).join('') + `<button type="button" class="pill" id="pkNoticeOk">${esc(T().ok)}</button>`;
  $('pkNoticeOk').onclick = () => { stored.set('pocketSeenTrade:' + who, fresh.map(t => t.at).sort().pop()); box.hidden = true; };
}
$('pkOnlyWanted').onchange = drawTrade;
$('pkTrade').onclick = async e => {
  const undo = e.target.closest('[data-undo-trade]'); if (undo) return undoTrade(undo.dataset.undoTrade);
  const done = e.target.closest('[data-traded]'); if (done) return logTrade(done.dataset.traded);
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const p = pick.closest('[data-person]').dataset.person, side = pick.dataset.pick, id = pick.dataset.cardId;
    if (picked.person !== p) picked = { person: p, give: '', get: '' };
    picked[side] = picked[side] === id ? '' : id;
    // the other side must be the same rarity
    const other = side === 'give' ? 'get' : 'give';
    if (picked[other] && cards.get(picked[other])?.r !== cards.get(id)?.r) picked[other] = '';
    drawTrade(); return;
  }
  const c = e.target.closest('[data-card]'); if (c) return openCard(c.dataset.card);
  const copy = e.target.closest('[data-copy]'); if (!copy) return;
  const f = lastMatches.find(m => m.person === copy.closest('[data-person]').dataset.person); if (!f) return;
  const list = items => items.slice(0, 3).map(x => label(x.card)).join(T().or);
  const text = T().discord(f.person, f.trades.map(t => T().discordLine(rarity(t.rarity), list(t.give), list(t.get))));
  try { await navigator.clipboard.writeText(text); copy.textContent = T().copied; setTimeout(() => { copy.textContent = T().copy; }, 1500); } catch { prompt(T().copy, text); }
};

// ---------- worth ----------
function drawWorth() {
  const me = viewed(), rar = $('pkWorthRarity').value, values = worth(data, people, me);
  const row = (v, extra = '') => `<div class="pk-worth-row"><img src="${IMG(v.card)}" alt="" loading="lazy"><span><b>${esc(nameOf(v.card))}</b> <small class="pk-hint">${esc(v.card.id)} · ${esc(rarity(v.card.r))}</small><br>
    <small class="pk-hint">${esc(T().wantedBy)} ${v.wantedBy.length ? v.wantedBy.map(esc).join(', ') : esc(T().nobody)} · ${esc(T().heldBy)} ${v.heldBy.length ? v.heldBy.map(esc).join(', ') : esc(T().nobody)}</small></span><span class="pk-value">${v.value.toFixed(2)}</span>${extra}</div>`;
  if (me) {
    const mineSpare = [...spares(record).keys()].map(id => values.get(id)).filter(v => v && (!rar || v.card.r === rar)).sort((a, b) => b.value - a.value || b.demand - a.demand);
    $('pkWorthList').innerHTML = `<h2>${esc(T().worthMine)}</h2>` + (mineSpare.length ? mineSpare.slice(0, 150).map(v => {
      const gets = tradeFor(data, people, me, v.id, values);
      return row(v, gets.length ? `<details><summary>${esc(T().getsFor(gets.length))}</summary><div class="pk-chips">${gets.slice(0, 40).map(g => chip(g.card, g.want, g.from)).join('')}</div></details>` : '');
    }).join('') : `<p class="pk-hint">${esc(T().noSpares)}</p>`);
  } else {
    const top = [...values.values()].filter(v => v.demand && (!rar || v.card.r === rar)).sort((a, b) => b.value - a.value).slice(0, 60);
    $('pkWorthList').innerHTML = `<h2>${esc(T().worthGroup)}</h2>` + top.map(v => row(v)).join('');
  }
}
$('pkWorthRarity').onchange = drawWorth;
$('pkWorthList').onclick = e => { const c = e.target.closest('[data-card]'); if (c) openCard(c.dataset.card); };

// ---------- accounts ----------
function drawAccountList() {
  $('pkAccountList').innerHTML = record.accounts.map(a => `<div class="pk-account-row" data-account="${a.id}">
    <input class="pill" data-field="name" value="${esc(a.name)}" maxlength="30" aria-label="${esc(T().accountName)}">
    <input class="pill" data-field="friendId" value="${esc(a.friendId || '')}" maxlength="24" placeholder="${esc(T().friendId)}" inputmode="numeric" aria-label="${esc(T().friendId)}">
    ${record.accounts.length > 1 ? `<button type="button" class="pill" data-remove>${esc(T().remove)}</button>` : ''}</div>`).join('');
  $('pkAddAccount').hidden = record.accounts.length >= MAX_ACCOUNTS;
}
$('pkAccounts').onclick = () => { drawAccountList(); $('pkAccountsDlg').showModal(); };
$('pkAddAccount').onclick = () => {
  change(r => { const used = new Set(r.accounts.map(a => a.id)); let i = 2; while (used.has('alt' + i)) i++; r.accounts.push({ id: 'alt' + i, name: T().newAccount(i) }); r.owned['alt' + i] = {}; });
  fillAccounts(); drawAccountList();
};
$('pkAccountList').onchange = e => {
  const row = e.target.closest('[data-account]'), field = e.target.dataset.field; if (!row || !field) return;
  const value = e.target.value.trim();
  if (field === 'friendId' && value && !/^[\d -]{4,24}$/.test(value)) { e.target.value = ''; return; }
  change(r => { const a = r.accounts.find(x => x.id === row.dataset.account); if (!a) return; if (field === 'name') a.name = value || a.name; else if (value) a.friendId = value; else delete a.friendId; });
  fillAccounts();
};
$('pkAccountList').onclick = e => {
  const row = e.target.closest('[data-account]'); if (!row || !e.target.closest('[data-remove]')) return;
  const a = record.accounts.find(x => x.id === row.dataset.account);
  if (!a || !confirm(T().removeConfirm(a.name))) return;
  change(r => { r.accounts = r.accounts.filter(x => x.id !== a.id); delete r.owned[a.id]; });
  fillAccounts(); drawAccountList();
};

// ---------- quick entry ----------
// One tap per card, in the game's order: the number pad sets the count on one account and moves on.
let quick = { list: [], at: 0, done: 0 };
function quickSet(account, id, n) {
  const o = record.owned[account] ||= {};
  if (n > 0) o[id] = Math.min(MAX_COPIES, n); else delete o[id];
}
function quickChanged() { record = normalize(record); people[person()] = record; queueSave(); }
function openQuick() {
  if (!mine()) return;
  $('pkQuickAccount').replaceChildren(...record.accounts.map(a => new Option(a.name, a.id)));
  $('pkQuickAccount').value = scope() !== 'all' ? scope() : record.accounts[0].id;
  const sets = [...data.sets].reverse();
  $('pkQuickSet').replaceChildren(...sets.map(x => new Option(`${x.name[lang] || x.name.en} (${x.code})`, x.code)));
  $('pkQuickSet').value = $('pkSet').value || sets[0].code;
  quick = { list: [], at: 0, done: 0 };
  loadQuick(); $('pkQuickDlg').showModal();
}
function loadQuick() {
  quick.list = data.cards.filter(c => c.s === $('pkQuickSet').value).sort((a, b) => a.n - b.n);
  quick.at = 0;
  const acc = record.accounts.find(a => a.id === $('pkQuickAccount').value);
  $('pkQuickHint').textContent = T().quickHint(acc?.name || '');
  const owned = record.owned[$('pkQuickAccount').value] || {};
  $('pkQuickGrid').innerHTML = quick.list.map((c, i) => `<button type="button" data-q="${i}" class="${owned[c.id] ? '' : 'zero'}" aria-label="${esc(label(c))}"><img src="${IMG(c)}" alt="" loading="lazy"><span class="num">${c.n > 0 ? c.n : 'AN'}</span>${owned[c.id] ? `<span class="n">${owned[c.id]}</span>` : ''}</button>`).join('');
  drawQuick();
}
function drawQuickCell(i) {
  const c = quick.list[i], b = $('pkQuickGrid').querySelector(`[data-q="${i}"]`); if (!c || !b) return;
  const n = record.owned[$('pkQuickAccount').value]?.[c.id] || 0;
  b.classList.toggle('zero', !n);
  b.querySelector('.n')?.remove();
  if (n) b.insertAdjacentHTML('beforeend', `<span class="n">${n}</span>`);
}
function drawQuick(message = '') {
  const c = quick.list[quick.at], owned = record.owned[$('pkQuickAccount').value] || {};
  for (const b of $('pkQuickGrid').querySelectorAll('.cur')) b.classList.remove('cur');
  const cell = $('pkQuickGrid').querySelector(`[data-q="${quick.at}"]`);
  if (cell) { cell.classList.add('cur'); cell.scrollIntoView({ block: 'nearest' }); }
  $('pkPadCard').innerHTML = c ? `<img src="${IMG(c)}" alt=""><span><b>${esc(nameOf(c))}</b><small class="pk-hint">${esc(c.id)} · ${esc(rarity(c.r))} · ×${owned[c.id] || 0}</small>${message ? `<small class="pk-hint">${esc(message)}</small>` : ''}</span>` : '';
  $('pkQuickProgress').textContent = T().quickProgress(quick.list.filter(x => owned[x.id]).length, quick.list.length, quick.done);
}
function quickKey(key) {
  const c = quick.list[quick.at]; if (!c) return;
  const account = $('pkQuickAccount').value, n = record.owned[account]?.[c.id] || 0;
  let message = '';
  if (/^\d$/.test(key)) { quickSet(account, c.id, Number(key)); quickChanged(); quick.done++; drawQuickCell(quick.at); quick.at++; }
  else if (key === 'plus' || key === 'plus10') { quickSet(account, c.id, n + (key === 'plus' ? 1 : 10)); quickChanged(); drawQuickCell(quick.at); }
  else if (key === 'skip') quick.at++;
  else if (key === 'back') quick.at = Math.max(0, quick.at - 1);
  if (quick.at >= quick.list.length) { quick.at = quick.list.length - 1; message = T().quickEnd; }
  drawQuick(message);
}
$('pkQuickBtn').onclick = openQuick;
$('pkQuickClose').onclick = () => $('pkQuickDlg').close();
$('pkQuickDlg').addEventListener('close', () => draw());
$('pkQuickSet').onchange = loadQuick;
$('pkQuickAccount').onchange = loadQuick;
$('pkQuickGrid').onclick = e => { const b = e.target.closest('[data-q]'); if (b) { quick.at = Number(b.dataset.q); drawQuick(); } };
$('pkPad').onclick = e => { const b = e.target.closest('[data-key]'); if (b) quickKey(b.dataset.key); };
$('pkQuickDlg').addEventListener('keydown', e => {
  if (e.target.matches('select, input')) return;
  const key = /^\d$/.test(e.key) ? e.key : { ArrowRight: 'skip', ArrowLeft: 'back', Backspace: 'back', '+': 'plus' }[e.key];
  if (key) { e.preventDefault(); quickKey(key); }
});
$('pkQuickAll1').onclick = () => {
  const account = $('pkQuickAccount').value;
  for (const c of quick.list) if (!record.owned[account]?.[c.id]) quickSet(account, c.id, 1);
  quickChanged(); loadQuick();
};
$('pkQuickAll0').onclick = () => {
  const account = $('pkQuickAccount').value, acc = record.accounts.find(a => a.id === account);
  if (!confirm(T().quickAll0Confirm(setName($('pkQuickSet').value), acc?.name || ''))) return;
  for (const c of quick.list) quickSet(account, c.id, 0);
  quickChanged(); loadQuick();
};

// ---------- pack opened ----------
// The fewest taps: the last pack and account are preselected, you tap what you pulled, and once the pack is full
// it saves itself after a moment (a sixth card of a bonus pack still fits in), then the next pack starts.
let tray = [], trayTimer = 0, lastPack = null;
const packs = () => data ? packList(data) : [];
const packOf = key => packs().find(p => p.key === key) || packs()[0];
function openPack() {
  if (!mine()) return;
  const recent = (stored.get('pocketRecentPacks') || '').split('\n').filter(k => packs().some(p => p.key === k));
  $('pkPackAccount').replaceChildren(...record.accounts.map(a => new Option(a.name, a.id)));
  $('pkPackAccount').value = record.accounts.some(a => a.id === stored.get('pocketPackAccount')) ? stored.get('pocketPackAccount') : scope() !== 'all' ? scope() : record.accounts[0].id;
  $('pkPackPick').replaceChildren(...packs().map(p => new Option(`${setName(p.set)} · ${p.pack}`, p.key)));
  $('pkPackPick').value = packOf(recent[0] || '')?.key || '';
  tray = []; lastPack = null; $('pkPackUndo').hidden = true;
  drawPack(); $('pkPackDlg').showModal();
}
function drawPack(message = '') {
  const p = packOf($('pkPackPick').value), owned = counts(record, $('pkPackAccount').value), acc = record.accounts.find(a => a.id === $('pkPackAccount').value);
  const recent = (stored.get('pocketRecentPacks') || '').split('\n').filter(k => k && k !== p.key && packs().some(x => x.key === k)).slice(0, 4);
  $('pkPackRecent').innerHTML = recent.map(k => { const x = packOf(k); return `<button type="button" class="pk-chip" data-recent="${esc(k)}">${esc(setName(x.set))} · ${esc(x.pack)}</button>`; }).join('');
  $('pkTray').innerHTML = tray.map((id, i) => `<button type="button" data-tray="${i}" aria-label="${esc(label(cards.get(id)))}"><img src="${IMG(cards.get(id))}" alt=""></button>`).join('') + '<span class="slot"></span>'.repeat(Math.max(0, p.size - tray.length));
  $('pkPackHint').textContent = message || T().packHint(p.size, acc?.name || '');
  let group = '';
  $('pkPackGrid').innerHTML = packCards(data, p.set, p.pack).map(c => {
    const head = c.r !== group ? (group = c.r, `<h3>${esc(rarity(c.r))} ${esc(data.rarities[c.r]?.label || '')}</h3>`) : '';
    const n = owned.get(c.id) || 0;
    return head + `<button type="button" data-pull="${esc(c.id)}" aria-label="${esc(label(c))}"><img src="${IMG(c)}" alt="" loading="lazy">${n ? `<span class="pk-have">${n}</span>` : `<span class="pk-new">${esc(T().newCard)}</span>`}</button>`;
  }).join('');
}
function commitPack() {
  clearTimeout(trayTimer); trayTimer = 0;
  if (!tray.length) return;
  const account = $('pkPackAccount').value, p = packOf($('pkPackPick').value), pulled = [...tray];
  change(r => { const o = r.owned[account] ||= {}; for (const id of pulled) o[id] = Math.min(MAX_COPIES, (o[id] || 0) + 1); });
  lastPack = { account, pulled };
  stored.set('pocketPackAccount', account);
  stored.set('pocketRecentPacks', [p.key, ...(stored.get('pocketRecentPacks') || '').split('\n').filter(k => k && k !== p.key)].slice(0, 6).join('\n'));
  tray = []; $('pkPackUndo').hidden = false;
  drawPack(T().packSaved(pulled.length, record.accounts.find(a => a.id === account)?.name || ''));
}
$('pkPackBtn').onclick = openPack;
$('pkPackPick').onchange = () => { commitPack(); drawPack(); };
$('pkPackAccount').onchange = () => { commitPack(); drawPack(); };
$('pkPackDlg').addEventListener('close', commitPack);
$('pkPackUndo').onclick = () => {
  if (!lastPack) return;
  const { account, pulled } = lastPack; lastPack = null;
  change(r => { const o = r.owned[account] ||= {}; for (const id of pulled) { o[id] = (o[id] || 0) - 1; if (o[id] <= 0) delete o[id]; } });
  $('pkPackUndo').hidden = true; drawPack();
};
$('pkPackDlg').onclick = e => {
  const pull = e.target.closest('[data-pull]'), out = e.target.closest('[data-tray]'), recent = e.target.closest('[data-recent]');
  if (recent) { commitPack(); $('pkPackPick').value = recent.dataset.recent; drawPack(); return; }
  if (out) { tray.splice(Number(out.dataset.tray), 1); clearTimeout(trayTimer); trayTimer = 0; drawPack(); return; }
  if (!pull) return;
  tray.push(pull.dataset.pull);
  const p = packOf($('pkPackPick').value);
  clearTimeout(trayTimer);
  // full: save after a moment, so a bonus sixth card can still be added
  if (tray.length >= p.size) trayTimer = setTimeout(commitPack, tray.length > p.size ? 600 : 1800);
  drawPack();
};

// ---------- saving ----------
// "base" is the last copy the server confirmed; what you changed since then (diff) is what gets saved, and when the
// server has a newer copy (another device, or a friend logged a trade with you) your changes go on top of it.
const pendingKey = () => 'pocketPending:' + person();
const copy = r => JSON.parse(JSON.stringify(r));
function queueSave() {
  try { localStorage.setItem(pendingKey(), JSON.stringify({ base, record })); } catch {}
  $('pkSave').className = 'pk-save'; $('pkSave').textContent = T().saving;
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200);
}
function adopt(server) {
  // a newer copy from the server, with anything not yet saved put on top
  const change = base ? diff(base, record) : null;
  base = normalize(copy(server));
  record = change && !isEmptyDiff(change) ? applyDiff(base, change) : normalize(copy(server));
  people[person()] = record;
  return change && !isEmptyDiff(change);
}
async function save(retry = 0) {
  if (saving) { again = true; return; }
  const who = person(); if (!who || !mine()) return;
  saving = true;
  let more = false;
  try {
    const sent = copy(record), { at, trades, ...body } = sent;
    const out = await call('/pocket', { person: who, since: base?.at || '', record: body }, stored.get(pinKey(who)));
    if (out.conflict) {
      more = adopt(out.record) && retry < 3;
      fillAccounts(); draw();
      if (!more) { try { localStorage.removeItem(pendingKey()); } catch {} }
    } else {
      // edits made while this save was on its way stay, on top of what was saved
      const later = diff(sent, record);
      base = normalize(copy(out.record));
      record = isEmptyDiff(later) ? normalize(copy(out.record)) : applyDiff(base, later);
      people[who] = record;
      if (isEmptyDiff(later)) { try { localStorage.removeItem(pendingKey()); } catch {} } else again = true;
      if (!again) { $('pkSave').className = 'pk-save'; $('pkSave').textContent = T().saved; }
    }
  } catch (err) { $('pkSave').className = 'pk-save err'; $('pkSave').textContent = T().saveFailed(err.message); }
  saving = false;
  if (more) return save(retry + 1);
  if (again) { again = false; save(); }
}

// ---------- tabs and loading ----------
function showTab(name) {
  tab = name;
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab;
  draw();
}
document.querySelector('.pk-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
function draw() {
  if (!data || !record) return;
  drawNotice();
  if (tab === 'cards') drawCards(); else if (tab === 'progress') drawProgress(); else if (tab === 'trade') drawTrade(); else drawWorth();
}
function pickRecord() {
  const who = viewed();
  const server = normalize(copy(serverCopy[who] || (who ? emptyRecord() : { accounts: [{ id: 'main', name: '—' }] })));
  base = serverCopy[who] ? server : null;
  record = normalize(copy(server));
  if (who) people[who] = record;
  if (who && mine()) {
    try {
      // changes this device hadn't saved yet (closed too early, offline): on top of the newest copy
      const pending = JSON.parse(localStorage.getItem(pendingKey()) || 'null');
      if (pending?.record) {
        const change = diff(normalize(pending.base || emptyRecord()), normalize(pending.record));
        if (!isEmptyDiff(change)) { record = applyDiff(server, change); people[who] = record; queueSave(); }
        else localStorage.removeItem(pendingKey());
      }
    } catch {}
  }
  fillAccounts();
}
async function load() {
  const turn = ++loadTurn, keep = $('pkPerson').value || stored.get('pocketPerson');
  if (!api) { $('pkStatus').textContent = T().notSetUp; return; }
  $('pkStatus').textContent = T().loading;
  try {
    const out = await call('/pocket');
    if (turn !== loadTurn) return;
    serverCopy = Object.fromEntries(Object.entries(out.people || {}).filter(([, r]) => r?.accounts?.length).map(([p, r]) => [p, r]));
    people = Object.fromEntries(Object.keys(out.people || {}).map(p => [p, normalize(copy(serverCopy[p] || emptyRecord()))]));
    $('pkStatus').textContent = '';
  } catch (err) { if (turn === loadTurn) $('pkStatus').textContent = T().loadFailed(err.message); }
  fillPeople(keep);
  const who = person(), pin = who && stored.get(pinKey(who));
  if (who && pin && verified !== who) await login(who, pin, true);
  pickRecord(); drawLogin(); draw();
}
$('pkPerson').onchange = () => {
  const who = person(); verified = '';
  if ($('pkPerson').value !== JOIN) stored.set('pocketPerson', who);
  $('pkSave').textContent = ''; pickRecord(); drawLogin(); draw();
  const pin = who && stored.get(pinKey(who)); if (pin) login(who, pin, true);
};
$('pkAccount').onchange = () => { limit = PAGE; draw(); };
$('pkTheme').onclick = () => {
  const next = { '': 'light', light: 'dark', dark: '' }[stored.get('pocketTheme')] ?? '';
  stored.set('pocketTheme', next);
  if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
};

(async () => {
  applyLanguage();
  $('pkStatus').textContent = T().loading;
  const [settings, cardData] = await Promise.all([
    fetch('config.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('cards.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (!cardData?.cards?.length) { $('pkStatus').textContent = T().noCards; return; }
  data = cardData; cards = cardMap(data);
  if (typeof settings.api === 'string' && /^https:\/\//.test(settings.api)) api = settings.api.replace(/\/$/, '');
  fillFilters(); fillPeople(''); pickRecord(); showTab('cards');
  load();
})();
