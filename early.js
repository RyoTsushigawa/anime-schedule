// Runs before the page first shows: the theme and accent color from the last visit, so nothing flashes
// the default colors until app.js and the Guckplan have loaded.
try {
  const root = document.documentElement;
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  const c = localStorage.getItem('accentNow');
  if (/^#[0-9a-f]{6}$/i.test(c || '')) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    root.style.setProperty('--accent', c);
    root.style.setProperty('--accent-text', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff');
    root.style.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
  }
} catch {}
