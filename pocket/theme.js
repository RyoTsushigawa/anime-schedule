// Pocket-Sammlung: light / dark before the page draws (auto follows the device; the ◐ button switches)
(() => { try { const t = localStorage.getItem('pocketTheme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch {} })();
