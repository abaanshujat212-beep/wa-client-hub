(() => {
  const status = document.querySelector('#status'); const detail = document.querySelector('#detail');
  const show = (title, body) => { status.textContent = title; detail.textContent = body; };
  let started = false;
  let attempts = 0;
  let retryTimer;
  async function start(encryptedData) {
    if (started) return;
    started = true;
    clearTimeout(retryTimer);
    show('Verifying HighLevel', 'User context received. Signing in securely…');
    const response = await fetch('/api/ghl/embedded/session', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ encryptedData }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Embedded sign-in was rejected');
    location.replace('/whatsapp-settings.html');
  }
  const parents = new Set(['https://crm.10xcollab.com', 'https://app.gohighlevel.com', 'https://marketplace.gohighlevel.com', 'https://app.leadconnectorhq.com']);
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !parents.has(event.origin)) return;
    if (event.data?.message === 'REQUEST_USER_DATA_RESPONSE' && typeof event.data.payload === 'string') start(event.data.payload).catch(error => show('Could not sign in', error.message));
  });
  function requestContext() {
    if (started) return;
    if (window.parent === window) return show('Open inside HighLevel', 'Open 10x WA Hub from your HighLevel location to sign in automatically.');
    if (attempts >= 10) return show('HighLevel did not respond', 'No user-context reply after 10 attempts. Check that this page is configured in this app’s Marketplace Custom Page module. Handshake version: 20260918-2.');
    attempts += 1;
    window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
    retryTimer = setTimeout(requestContext, 2000);
  }
  requestContext();
})();
