try {
const root = document.documentElement;
if (localStorage.getItem('theme') === null)
for (const [key, value] of Object.entries({ theme: 'dark', time: 'watch', markOnOpen: '0', who: '0', behind: '0', dropButtons: '0' }))
if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
const theme = localStorage.getItem('theme');
if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
const c = localStorage.getItem('accentNow');
if (/^#[0-9a-f]{6}$/i.test(c || '')) {
const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
root.style.setProperty('--accent', c);
const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
root.style.setProperty('--accent-text', (l + 0.05) / 0.0556 > 1.05 / (l + 0.05) ? '#111' : '#fff');
root.style.setProperty('--today', `color-mix(in srgb, ${c} 14%, var(--bg))`);
}
} catch {}

