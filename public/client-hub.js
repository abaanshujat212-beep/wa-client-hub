(() => {
  const status = document.querySelector('#status'); const detail = document.querySelector('#detail');
  const show = (title, body) => { status.textContent = title; detail.textContent = body; };
  async function start(assertion) {
    const response = await fetch('/api/ghl/embedded/session', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assertion }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Embedded sign-in was rejected');
    location.replace(payload.redirect || '/');
  }
  window.addEventListener('message', event => { if (event.data?.type === 'ghl-signed-context' && event.data.assertion) start(event.data.assertion).catch(error => show('Could not sign in', error.message)); });
  window.parent?.postMessage({ type: 'wa-client-hub-ready' }, '*');
  if (window.GHL_EMBEDDED_ASSERTION) start(window.GHL_EMBEDDED_ASSERTION).catch(error => show('Could not sign in', error.message));
  setTimeout(() => { if (status.textContent === 'Connecting…') show('Waiting for HighLevel', 'The signed user context was not received. Refresh the custom page or contact the workspace administrator.'); }, 8000);
})();
