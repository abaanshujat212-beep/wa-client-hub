(function(){
  async function loadRemoteDesktop(){
    try {
      const response = await fetch('/api/remote-desktop');
      if(!response.ok) return;
      const body = await response.json();
      const cfg = body.remoteDesktop || {};
      if(!cfg.enabled || !cfg.url) return;
      document.querySelectorAll('.workspace-card').forEach(function(card){
        if(card.querySelector('[data-remote-desktop-link]')) return;
        const actions = card.querySelector('.workspace-actions');
        if(!actions) return;
        const link = document.createElement('a');
        link.href = cfg.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'button secondary';
        link.dataset.remoteDesktopLink = '1';
        link.textContent = cfg.label || 'Open Remote Desktop';
        link.title = cfg.help || 'Open secured Windows desktop access';
        actions.appendChild(link);
      });
    } catch {}
  }
  setInterval(loadRemoteDesktop, 2000);
  window.addEventListener('load', loadRemoteDesktop);
})();
