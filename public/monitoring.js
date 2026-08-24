(function(){
  async function loadMonitoring(){
    const target = document.querySelector('#monitoringPanel');
    if(!target) return;
    try {
      const response = await fetch('/api/monitoring');
      if(!response.ok) return;
      const body = await response.json();
      const h = body.health || {};
      const counts = h.counts || {};
      target.innerHTML = [
        ['Users', counts.users],
        ['Workspaces', counts.workspaces],
        ['WhatsApp numbers', counts.whatsappNumbers],
        ['Running numbers', counts.runningWhatsappNumbers],
        ['Invites', counts.invites],
        ['Audit events', counts.auditEvents],
        ['Uptime', (h.uptimeSeconds || 0) + 's'],
        ['Platform', h.platform || '-']
      ].map(function(row){ return '<div class="metric-card"><strong>' + row[1] + '</strong><span>' + row[0] + '</span></div>'; }).join('');
    } catch {}
  }
  window.loadMonitoring = loadMonitoring;
  setInterval(loadMonitoring, 10000);
  window.addEventListener('load', loadMonitoring);
})();
