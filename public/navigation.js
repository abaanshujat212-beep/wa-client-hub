(function () {
  const aliases = { accounts: 'workspaces', guide: 'calls', ghlAssignments: 'number-assignments', adminSummary: 'summary', setupDocs: 'setup-docs' };
  let restoring = false;
  const buttons = () => [...document.querySelectorAll('.sidebar .nav-item[data-view]')];
  const slug = button => aliases[button.dataset.view] || button.dataset.view;
  const allowed = button => button && !button.hidden && !button.classList.contains('hidden') && getComputedStyle(button).display !== 'none';
  function write(button, replace) {
    const hash = '#/' + slug(button);
    if (location.hash === hash) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', location.pathname + location.search + hash);
  }
  function restore() {
    const app = document.querySelector('#appView');
    if (!app || app.classList.contains('hidden')) return;
    const route = location.hash.replace(/^#\/?/, '');
    const target = buttons().find(button => slug(button) === route && allowed(button));
    const selected = target || buttons().find(button => button.dataset.view === 'accounts');
    if (!allowed(selected)) return;
    restoring = true;
    try { selected.click(); write(selected, true); }
    finally { restoring = false; }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('.sidebar .nav-item[data-view]');
    if (!allowed(button)) return;
    if (!restoring) write(button, false);
    document.querySelector('.sidebar')?.classList.remove('open');
  });
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  window.WaNavigation = { restore };
})();
