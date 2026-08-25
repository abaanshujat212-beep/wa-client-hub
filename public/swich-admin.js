(function(){
  async function api(path, options){
    var csrf = window.state && window.state.csrf;
    var response = await fetch(path, Object.assign({}, options || {}, { headers: Object.assign({ 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, (options && options.headers) || {}) }));
    var body = await response.json().catch(function(){ return {}; });
    if(!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  function addSwichButtons(){
    document.querySelectorAll('[data-billing-workspace]').forEach(function(billingButton){
      var card = billingButton.closest('.workspace-card');
      if(!card || card.querySelector('[data-swich-checkout]')) return;
      var workspaceId = billingButton.dataset.billingWorkspace;
      var actions = card.querySelector('.workspace-actions');
      if(!actions) return;
      var checkout = document.createElement('button');
      checkout.type = 'button';
      checkout.className = 'button secondary admin-only';
      checkout.dataset.swichCheckout = workspaceId;
      checkout.textContent = 'Swich checkout';
      actions.appendChild(checkout);
    });
  }

  document.addEventListener('click', async function(event){
    var tokenTest = event.target.closest('[data-swich-token-test]');
    var checkout = event.target.closest('[data-swich-checkout]');
    try {
      if(tokenTest){
        var result = await api('/api/billing/swich/token-test', { method: 'POST', body: '{}' });
        alert('Swich token OK: ' + (result.tokenPreview || 'received'));
      }
      if(checkout){
        var amount = prompt('Swich amount in PKR', '5000');
        if(!amount) return;
        var result = await api('/api/billing/swich/checkout', { method: 'POST', body: JSON.stringify({ workspaceId: checkout.dataset.swichCheckout, amount: Number(amount) }) });
        var text = JSON.stringify(result.payment || result, null, 2);
        prompt('Swich checkout created. Copy response:', text);
      }
    } catch(error){ alert(error.message); }
  });

  function addGlobalTokenButton(){
    var monitoring = document.querySelector('#monitoringView .section-heading');
    if(!monitoring || monitoring.querySelector('[data-swich-token-test]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary admin-only';
    button.dataset.swichTokenTest = '1';
    button.textContent = 'Test Swich token';
    monitoring.appendChild(button);
  }

  setInterval(function(){ addSwichButtons(); addGlobalTokenButton(); }, 2000);
  window.addEventListener('load', function(){ addSwichButtons(); addGlobalTokenButton(); });
})();
