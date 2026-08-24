(function(){
  async function loadAdminSummary(){
    const target = document.querySelector('#adminSummaryList');
    if(!target) return;
    try {
      const response = await fetch('/api/admin/summary');
      if(!response.ok) return;
      const body = await response.json();
      const clients = body.clients || [];
      target.innerHTML = clients.length ? clients.map(function(c){
        return '<div class="client-row">' +
          '<div><strong>' + c.name + '</strong><small>' + c.email + '</small></div>' +
          '<span>' + c.workspaces + ' workspaces</span>' +
          '<span>' + c.whatsappNumbers + ' numbers / ' + c.runningWhatsappNumbers + ' running</span>' +
          '<span class="badge ' + (c.active ? '' : 'off') + '">' + (c.active ? 'Active' : 'Disabled') + '</span>' +
        '</div>';
      }).join('') : '<div class="empty">No clients yet.</div>';
    } catch {}
  }
  window.loadAdminSummary = loadAdminSummary;
  setInterval(loadAdminSummary, 10000);
  window.addEventListener('load', loadAdminSummary);
})();
