(function(){
  async function api(path, options){
    var csrf = window.state && window.state.csrf;
    var response = await fetch(path, Object.assign({}, options || {}, { headers: Object.assign({ 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, (options && options.headers) || {}) }));
    var body = await response.json().catch(function(){ return {}; });
    if(!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  document.addEventListener('click', async function(event){
    var tokenTest = event.target.closest('[data-whop-token-test]');
    var membership = event.target.closest('[data-whop-membership-test]');
    try {
      if(tokenTest){
        await api('/api/billing/whop/token-test', { method: 'POST', body: '{}' });
        alert('Whop API key configured');
      }
      if(membership){
        var id = prompt('Whop membership ID');
        if(!id) return;
        var result = await api('/api/billing/whop/membership/' + encodeURIComponent(id));
        prompt('Whop membership response. Copy if needed:', JSON.stringify(result, null, 2));
      }
    } catch(error){ alert(error.message); }
  });

  function addButtons(){
    var monitoring = document.querySelector('#monitoringView .section-heading');
    if(!monitoring) return;
    if(!monitoring.querySelector('[data-whop-token-test]')){
      var token = document.createElement('button');
      token.type = 'button';
      token.className = 'button secondary admin-only';
      token.dataset.whopTokenTest = '1';
      token.textContent = 'Test Whop key';
      monitoring.appendChild(token);
    }
    if(!monitoring.querySelector('[data-whop-membership-test]')){
      var member = document.createElement('button');
      member.type = 'button';
      member.className = 'button secondary admin-only';
      member.dataset.whopMembershipTest = '1';
      member.textContent = 'Check Whop membership';
      monitoring.appendChild(member);
    }
  }

  setInterval(addButtons, 2000);
  window.addEventListener('load', addButtons);
})();
