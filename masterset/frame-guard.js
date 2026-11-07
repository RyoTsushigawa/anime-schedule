// The frame guard, loaded first on every page: shown inside another website's frame, the page stays
// invisible. A trick site can then neither overlay it nor get someone with the edit key to click
// Edit, Move or Verspätung without knowing. It tries to open the page on its own instead, which
// browsers only allow after a click, so it may simply stay blank there. Normal visits never notice.
(function () {
  let framed;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (!framed) return;
  document.documentElement.style.setProperty('display', 'none', 'important');
  try { window.top.location.replace(window.location.href); } catch { /* the other site doesn't allow it */ }
})();
