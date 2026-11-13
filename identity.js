// Who is acting on the Awards and the Börse: the votes helper checks it (workers/season-votes, verifiedPerson).
// A person with an AniList account in "Wer ist wer" (wrapped-profiles.json) is confirmed by their AniList login in
// this browser (connected on the main page); a person without one uses a PIN, set the first time and kept for
// this browser session only. MaRyo's two accounts are two people.
const Identity = (() => {
  const ACCOUNT_PERSON = { ryotsushigawa: 'Ryo', milkyway95: 'Marvin' };
  const SHARED_COLUMN = { MaRyo: ['Marvin', 'Ryo'] };
  let byAccount = new Map();
  const ready = fetch('wrapped-profiles.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(profiles => {
    for (const [person, accounts] of Object.entries(profiles || {})) for (const a of accounts || [])
      if (a?.provider === 'anilist' && typeof a.name === 'string') { const key = a.name.toLowerCase(); const who = ACCOUNT_PERSON[key] || (SHARED_COLUMN[person] ? null : person); if (who) byAccount.set(key, who); }
  });
  const logins = () => { try { return (JSON.parse(localStorage.getItem('anilistAccounts')) || []).filter(a => a?.token && a.provider !== 'mal' && (!a.expires || a.expires > Date.now())); } catch { return []; } };
  const accountsOf = person => [...byAccount].filter(([, p]) => p === person).map(([a]) => a);
  const loginFor = person => logins().find(a => byAccount.get(String(a.name).toLowerCase()) === person) || null;
  const myPeople = () => [...new Set(logins().map(a => byAccount.get(String(a.name).toLowerCase())).filter(Boolean))];
  const pinKey = person => 'personPin:' + person;
  const pinOf = person => { try { return sessionStorage.getItem(pinKey(person)) || ''; } catch { return ''; } };
  function headers(person) {
    const login = loginFor(person);
    if (login) return { 'X-AniList-Token': login.token };
    const pin = !accountsOf(person).length && pinOf(person);
    return pin ? { 'X-Person-Pin': pin } : {};
  }
  const canAct = person => !!(loginFor(person) || (!accountsOf(person).length && pinOf(person)));
  // the line under the person choice: confirmed, connect AniList, or the PIN field
  function draw(box, person, onChange) {
    box.replaceChildren();
    if (!person) return;
    const login = loginFor(person), accounts = accountsOf(person);
    const line = text => Object.assign(document.createElement('span'), { textContent: text });
    if (login) { box.className = 'identity-box ok'; box.append(line(`✓ ${person}, bestätigt über AniList (${login.name})`)); return; }
    if (accounts.length) {
      box.className = 'identity-box need';
      box.append(line(`${person} meldet sich mit AniList an. `));
      const a = Object.assign(document.createElement('a'), { href: './', textContent: 'Auf der Hauptseite das Konto verbinden', target: '_blank', rel: 'noopener' });
      box.append(a, line(` (${accounts.join(', ')}), dann diese Seite neu laden.`));
      return;
    }
    box.className = 'identity-box pin';
    const has = pinOf(person);
    const input = Object.assign(document.createElement('input'), { type: 'password', className: 'pill', placeholder: 'PIN', autocomplete: 'off', maxLength: 32 });
    input.setAttribute('aria-label', 'PIN für ' + person);
    const save = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: has ? 'PIN ändern' : 'PIN merken' });
    save.onclick = () => {
      if (!/^\S{4,32}$/.test(input.value)) { hint.textContent = 'Mindestens 4 Zeichen, ohne Leerzeichen.'; return; }
      try { sessionStorage.setItem(pinKey(person), input.value); } catch {}
      input.value = ''; draw(box, person, onChange); onChange?.();
    };
    const hint = line(has ? `✓ PIN für ${person} ist für diese Sitzung gemerkt.` : `${person} hat kein AniList: mit einer PIN bestätigen. Beim ersten Mal legst du sie fest; vergessen? Ryo kann sie zurücksetzen.`);
    box.append(hint, input, save);
    // the owner (the browser with the site's GitHub key) resets a forgotten PIN
    let key = ''; try { key = localStorage.getItem('movesKey') || ''; } catch {}
    if (key) {
      const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: 'PIN zurücksetzen' });
      reset.onclick = async () => {
        if (!confirm(`Die PIN von ${person} zurücksetzen? Die nächste PIN legt ${person} dann neu fest.`)) return;
        try {
          const api = (await config()).previewVotesUrl.replace(/\/$/, '');
          const res = await fetch(api + '/identity/pin-reset', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Owner-Key': key }, body: JSON.stringify({ person }) });
          hint.textContent = res.ok ? `PIN von ${person} zurückgesetzt.` : 'Nicht zurückgesetzt: ' + ((await res.json().catch(() => ({}))).error || res.status);
        } catch (e) { hint.textContent = 'Nicht zurückgesetzt: ' + e.message; }
      };
      box.append(reset);
    }
  }
  // the group code is missing on this device: one field to enter it, then the page loads again
  function askGroupCode(box, retry) {
    if (!box || box.querySelector('.group-code')) return;
    box.className = 'identity-box need';
    box.replaceChildren();
    const form = Object.assign(document.createElement('span'), { className: 'group-code' });
    const text = Object.assign(document.createElement('span'), { textContent: 'Der Gruppencode fehlt auf diesem Gerät (derselbe wie in der Season Preview):' });
    const input = Object.assign(document.createElement('input'), { type: 'password', className: 'pill', placeholder: 'Gruppencode', autocomplete: 'off' });
    input.setAttribute('aria-label', 'Gruppencode');
    const save = Object.assign(document.createElement('button'), { type: 'button', className: 'pill primary', textContent: 'Speichern' });
    save.onclick = () => { const code = input.value.trim(); if (code.length < 16) { text.textContent = 'Der Gruppencode ist mindestens 16 Zeichen lang.'; return; } rememberGroupCode(code); box.replaceChildren(); retry?.(); };
    form.append(text, input, save);
    box.append(form);
  }
  return { ready, headers, canAct, myPeople, draw, accountsOf, askGroupCode };
})();
