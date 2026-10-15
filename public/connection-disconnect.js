(function () {
  function addDisconnectButtons() {
    document.querySelectorAll('.connection-card').forEach(function (card) {
      if (card.querySelector('[data-disconnect-connection]')) return;
      var source = card.querySelector('[data-action]');
      if (!source || !source.dataset.id) return;
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary';
      button.dataset.disconnectConnection = source.dataset.id; button.textContent = 'Disconnect number';
      button.addEventListener('click', async function () {
        if (!window.confirm('Disconnect this WhatsApp number? Messaging and templates will stop for this connection.')) return;
        button.disabled = true;
        try {
          var session = await fetch('/api/session').then(function (r) { return r.json(); });
          var workspace = document.querySelector('#workspace')?.value;
          var response = await fetch('/api/meta/connections/' + encodeURIComponent(source.dataset.id) + '/disconnect', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify({ workspaceId: workspace }) });
          var result = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(result.error || 'Could not disconnect this number.');
          window.alert('Number disconnected.'); window.location.reload();
        } catch (error) { window.alert(error.message); button.disabled = false; }
      });
      card.querySelector('.row-actions')?.appendChild(button);
    });
  }
  new MutationObserver(addDisconnectButtons).observe(document.body, { childList: true, subtree: true }); addDisconnectButtons();
})();
