// Advent preview for the owner (advent.html?preview=1): every door gets "✓ Passt" or "✎ Ändern …" with a note.
// The verdicts are kept in the repository (advent-review.json, written with the GitHub key of this browser), so the
// changes can be read and made there. Visitors never see any of this.
const API = 'https://api.github.com/repos/RyoTsushigawa/anime-schedule/contents/advent-review.json';
const key = () => { try { return localStorage.getItem('movesKey') || ''; } catch { return ''; } };
const headers = () => ({ Authorization: 'Bearer ' + key(), Accept: 'application/vnd.github+json' });
const decode = text => JSON.parse(decodeURIComponent(escape(atob(text.replace(/\s/g, '')))));
const encode = data => btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 1) + '\n')));
export let review = { doors: {} };
export const canReview = () => !!key();

// the newest saved file and its sha (none yet: an empty review)
async function load() {
  const res = await fetch(API + '?ref=main&_=' + Date.now(), { headers: headers(), cache: 'no-store' });
  if (res.status === 404) return { data: { doors: {} }, sha: null };
  if (!res.ok) throw Error(res.status === 401 || res.status === 403 ? 'der GitHub-Schlüssel darf hier nicht schreiben' : 'GitHub antwortet ' + res.status);
  const meta = await res.json();
  return { data: decode(meta.content), sha: meta.sha };
}
export async function loadReview() {
  if (!canReview()) return review;
  review = (await load()).data;
  review.doors ||= {};
  return review;
}
// one door's verdict, merged into the newest file (another tab's verdicts stay)
export async function saveVerdict(n, verdict) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await load();
    data.doors ||= {};
    if (verdict) data.doors[n] = { ...verdict, at: new Date().toISOString() }; else delete data.doors[n];
    const res = await fetch(API, { method: 'PUT', headers: headers(), body: JSON.stringify({ message: `Adventskalender: Türchen ${n} ${verdict ? verdict.status === 'ok' ? 'freigegeben' : 'Änderungswunsch' : 'zurückgesetzt'}`, content: encode(data), branch: 'main', ...(sha && { sha }) }) });
    if (res.ok) { review = data; return review; }
    if (res.status !== 409 && res.status !== 422) throw Error('GitHub antwortet ' + res.status);
  }
  throw Error('gerade gleichzeitig gespeichert, bitte nochmal');
}
export function summary() {
  const all = Object.values(review.doors || {});
  const ok = all.filter(d => d.status === 'ok').length, change = all.filter(d => d.status === 'change').length;
  return `${ok} freigegeben · ${change} Änderungswünsche · ${24 - ok - change} offen`;
}
// the buttons under a door in the preview
export function mountReview(box, n, onChange) {
  const el = (tag, text, cls) => Object.assign(document.createElement(tag), text ? { textContent: text } : {}, cls ? { className: cls } : {});
  const draw = message => {
    const v = review.doors?.[n];
    box.replaceChildren();
    box.append(el('h3', 'Freigabe'));
    if (!canReview()) { box.append(el('p', 'Speichern geht nur in einem Browser mit Bearbeitungszugang (GitHub-Schlüssel).', 'advent-prompt-note')); return; }
    const row = el('div', null, 'advent-review-row');
    const ok = el('button', '✓ Passt', 'pill' + (v?.status === 'ok' ? ' primary' : '')), change = el('button', '✎ Ändern …', 'pill' + (v?.status === 'change' ? ' primary' : ''));
    ok.type = change.type = 'button';
    ok.setAttribute('aria-pressed', String(v?.status === 'ok')); change.setAttribute('aria-pressed', String(v?.status === 'change'));
    row.append(ok, change);
    if (v) { const reset = el('button', 'Zurücksetzen', 'pill'); reset.type = 'button'; reset.onclick = () => store(null); row.append(reset); }
    box.append(row);
    const form = el('div', null, 'advent-review-form'); form.hidden = v?.status !== 'change';
    const note = el('textarea'); note.rows = 3; note.maxLength = 600; note.placeholder = 'Was soll anders werden? (z. B. „andere Frage zu One Piece“, „zu schwer“, „Titel lustiger“)'; note.value = v?.note || '';
    note.setAttribute('aria-label', 'Änderungswunsch für Türchen ' + n);
    const send = el('button', 'Wunsch speichern', 'pill primary'); send.type = 'button';
    form.append(note, send); box.append(form);
    const status = el('p', message || (v ? (v.status === 'ok' ? 'Freigegeben.' : 'Änderungswunsch gespeichert.') : ''), 'advent-prompt-note'); status.setAttribute('role', 'status'); box.append(status);
    ok.onclick = () => store({ status: 'ok' });
    change.onclick = () => { form.hidden = false; note.focus(); };
    send.onclick = () => { const text = note.value.trim(); if (!text) { status.textContent = 'Kurz beschreiben, was anders werden soll.'; return; } store({ status: 'change', note: text }); };
  };
  const store = async verdict => {
    for (const b of box.querySelectorAll('button, textarea')) b.disabled = true;
    try { await saveVerdict(n, verdict); draw(); onChange?.(); }
    catch (e) { draw('Nicht gespeichert: ' + e.message); }
  };
  draw();
}
