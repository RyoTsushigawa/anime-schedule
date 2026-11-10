// For the tool pages (Higher / Lower, Masterset Tracker): light or dark as chosen on the main page
// ("theme" in this browser; dark until something is chosen, like there; "auto" follows the device).
// With data-accent on the script tag, the page also takes the main page's accent colour.
(() => {
  try {
    const root = document.documentElement, theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else if (theme === null) root.dataset.theme = 'dark';
    if (!document.currentScript?.hasAttribute('data-accent')) return;
    const c = localStorage.getItem('accentNow') || localStorage.getItem('accent');
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    root.style.setProperty('--accent', c);
    root.style.setProperty('--accent-text', (l + 0.05) / 0.0556 > 1.05 / (l + 0.05) ? '#111' : '#fff');
  } catch {}
})();
