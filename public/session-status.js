(function(){
  function enhanceStatusLabels(){
    document.querySelectorAll('[data-session-status-label]').forEach(function(el){
      var status = el.dataset.sessionStatus || '';
      el.classList.toggle('off', status === 'needs_qr_scan');
    });
  }
  window.addEventListener('load', enhanceStatusLabels);
  setInterval(enhanceStatusLabels, 2000);
})();
