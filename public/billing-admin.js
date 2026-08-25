(function(){
  var providers = ['manual', 'stripe', 'whop', 'swich'];
  var statuses = ['manual', 'trialing', 'active', 'pending', 'past_due', 'canceled', 'unpaid'];

  async function patchWorkspace(id, updates){
    var csrf = window.state && window.state.csrf;
    var response = await fetch('/api/workspaces/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' },
      body: JSON.stringify(updates)
    });
    var body = await response.json().catch(function(){ return {}; });
    if(!response.ok) throw new Error(body.error || 'Could not update billing');
    return body;
  }

  function enhanceBillingControls(){
    document.querySelectorAll('[data-select-workspace]').forEach(function(button){
      var card = button.closest('.workspace-card');
      if(!card || card.querySelector('[data-billing-workspace]')) return;
      var workspaceId = button.dataset.selectWorkspace;
      var actions = card.querySelector('.workspace-actions');
      if(!actions) return;
      var billing = document.createElement('button');
      billing.type = 'button';
      billing.className = 'button secondary admin-only';
      billing.dataset.billingWorkspace = workspaceId;
      billing.textContent = 'Billing';
      actions.appendChild(billing);
    });
  }

  document.addEventListener('click', async function(event){
    var btn = event.target.closest('[data-billing-workspace]');
    if(!btn) return;
    try {
      var provider = prompt('Billing provider: ' + providers.join(', '), 'manual');
      if(!provider) return;
      var status = prompt('Billing status: ' + statuses.join(', '), provider === 'manual' ? 'manual' : 'active');
      if(!status) return;
      await patchWorkspace(btn.dataset.billingWorkspace, { billingProvider: provider, billingStatus: status });
      alert('Billing updated');
      if(window.location) window.location.reload();
    } catch(error) { alert(error.message); }
  });

  setInterval(enhanceBillingControls, 2000);
  window.addEventListener('load', enhanceBillingControls);
})();
