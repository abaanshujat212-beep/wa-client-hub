(function(){
  function addClientHelpPanel(){
    var accountsView = document.querySelector('#accountsView');
    if(!accountsView || document.querySelector('#clientHelpPanel')) return;
    var panel = document.createElement('div');
    panel.id = 'clientHelpPanel';
    panel.className = 'notice';
    panel.innerHTML = '<strong>Client quick actions</strong><p>1) Create/select workspace  2) Add WhatsApp number  3) Click Link account/Open WhatsApp  4) Open Remote Desktop if configured  5) Allow microphone/camera in Chrome or Edge.</p>';
    accountsView.appendChild(panel);
  }
  window.addEventListener('load', addClientHelpPanel);
  setInterval(addClientHelpPanel, 3000);
})();
