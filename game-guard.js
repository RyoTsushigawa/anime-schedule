// Shows a message instead of an empty board when a game can't start: a module that failed to load or
// doesn't fit (an older saved copy next to a newer one), or a browser too old for the game code.
// "Neu laden" drops the saved copies first, so the next load is the current version as a whole.
(() => {
  let shown = false;
  const show = detail => {
    if (shown) return;
    shown = true;
    const box = document.createElement('div');
    box.className = 'game-guard';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #c0504d;border-radius:10px;background:rgba(192,80,77,.14);line-height:1.5;width:100%;box-sizing:border-box';
    box.innerHTML = '<strong>Das Spiel konnte nicht starten.</strong> <span></span> <button type="button">Neu laden</button>';
    box.querySelector('span').textContent = detail;
    box.querySelector('button').addEventListener('click', async () => {
      try { await Promise.all((await caches.keys()).filter(k => /^schedule-v\d+$/.test(k)).map(k => caches.delete(k))); } catch {}
      location.reload();
    });
    const place = () => (document.querySelector('main') || document.body).prepend(box);
    document.body ? place() : document.addEventListener('DOMContentLoaded', place);
  };
  if (!('noModule' in HTMLScriptElement.prototype)) {
    show('Dieser Browser ist zu alt für die Spiele. Bitte Browser aktualisieren (oder Chrome/Firefox nutzen).');
    return;
  }
  const ours = file => !file || new URL(file, location.href).origin === location.origin;
  addEventListener('error', event => {
    const target = event.target;
    if (target && target.tagName === 'SCRIPT' && target.type === 'module') {
      show('Eine Datei des Spiels fehlt (Verbindung oder Werbeblocker?).');
    } else if (event instanceof ErrorEvent && ours(event.filename) && /SyntaxError|export|import|Unexpected|is not a function/i.test(`${event.message}`)) {
      show(/export|import/i.test(event.message)
        ? 'Eine gespeicherte ältere Version ist im Weg.'
        : 'Dieser Browser kennt Teile des Spiel-Codes nicht. Bitte Browser aktualisieren.');
    }
  }, true);
})();
