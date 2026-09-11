(() => {
  const publicOrigin = 'https://wa.10xcollab.com';
  const rows = [
    ['HighLevel OAuth callback', `${publicOrigin}/oauth/highlevel/callback`, 'Marketplace App → Advanced Settings → Auth → Redirect URLs'],
    ['HighLevel app events', `${publicOrigin}/webhooks/ghl/events`, 'Marketplace App → Advanced Settings → Webhooks'],
    ['HighLevel SMS delivery', `${publicOrigin}/webhooks/ghl/messages`, 'Conversation Provider → SMS → Delivery URL'],
    ['Meta WhatsApp webhook', `${publicOrigin}/webhooks/meta/whatsapp`, 'Meta App → WhatsApp → Configuration → Callback URL'],
    ['YCloud WhatsApp webhook', `${publicOrigin}/webhooks/ycloud/whatsapp`, 'YCloud → Webhooks'],
    ['OpenWA event receiver', `${publicOrigin}/api/openwa/webhook`, 'OPENWA_WEBHOOK_URL (only when OpenWA can reach this host)'],
    ['Stripe billing webhook', `${publicOrigin}/api/billing/stripe/webhook`, 'Stripe Workbench → Webhooks'],
    ['Swich billing webhook', `${publicOrigin}/api/billing/swich/webhook`, 'Swich merchant webhook settings'],
    ['Whop billing webhook', `${publicOrigin}/api/billing/whop/webhook`, 'Whop developer webhook settings']
  ];
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function copy(value, button) { navigator.clipboard.writeText(value).then(() => { const old = button.textContent; button.textContent = 'Copied'; setTimeout(() => button.textContent = old, 1200); }); }
  function install() {
    if (document.querySelector('#setupDocsView')) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;
    const navButton = document.createElement('button');
    navButton.className = 'nav-item'; navButton.dataset.view = 'setupDocs'; navButton.innerHTML = '<span>⚙</span> Setup docs';
    nav.appendChild(navButton);
    const view = document.createElement('section'); view.id = 'setupDocsView'; view.className = 'view hidden';
    view.innerHTML = `<div class="hero-card"><div><span class="kicker">Deployment runbook</span><h3>OAuth, webhooks and provider setup.</h3><p>Copy the exact permanent Cloudflare URLs. Never put client secrets in a browser or Git.</p></div><a class="button light" href="https://marketplace.gohighlevel.com" target="_blank" rel="noreferrer">Open HighLevel Marketplace</a></div>
      <div class="setup-grid">
        <article class="setup-card wide-card"><h3>Public endpoint directory</h3><p class="muted">Cloudflare must forward this hostname to <code>http://localhost:3131</code>. Every provider URL must remain HTTPS and unchanged.</p><div class="endpoint-list">${rows.map(([name,url,where]) => `<div class="endpoint-row"><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(where)}</small><code>${escapeHtml(url)}</code></div><button class="button secondary" data-copy="${escapeHtml(url)}">Copy</button></div>`).join('')}</div></article>
        <article class="setup-card"><h3>1. HighLevel OAuth ENV</h3><p>Put these values in local <code>.env</code>, then restart the app.</p><pre>APP_ORIGIN=${publicOrigin}
COOKIE_SECURE=true
GHL_CLIENT_ID=&lt;Marketplace Client ID&gt;
GHL_CLIENT_SECRET=&lt;Marketplace Client Secret&gt;
GHL_REDIRECT_URI=${publicOrigin}/oauth/highlevel/callback
GHL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
GHL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2023-02-21
GHL_REQUIRED_SCOPES=conversations.write</pre><button class="button secondary" data-copy="APP_ORIGIN=${publicOrigin}\nCOOKIE_SECURE=true\nGHL_REDIRECT_URI=${publicOrigin}/oauth/highlevel/callback\nGHL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation\nGHL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token\nGHL_API_BASE_URL=https://services.leadconnectorhq.com\nGHL_API_VERSION=2023-02-21\nGHL_REQUIRED_SCOPES=conversations.write">Copy non-secret ENV</button></article>
        <article class="setup-card"><h3>2. Marketplace app</h3><ol><li>Create a <strong>Private</strong> Marketplace app.</li><li>In Auth, add the callback URL and the exact scope shown here.</li><li>Create a Client Key and copy its ID and secret to <code>.env</code>.</li><li>In Webhooks, use the app-events URL.</li><li>Create an SMS Conversation Provider and use the separate delivery URL.</li></ol><p class="warning-text">The client secret is shown once. Store it locally; do not paste it into this page.</p></article>
        <article class="setup-card"><h3>3. Runtime requirements</h3><pre>STORE_DRIVER=postgres
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
CONNECTOR_MASTER_KEY=&lt;base64 32-byte key&gt;</pre><p>Run <code>npm run db:migrate</code>, restart with <code>npm start</code>, sign in, open <strong>Integrations</strong>, choose a workspace, then click <strong>Connect with HighLevel</strong>.</p></article>
        <article class="setup-card"><h3>4. Cloudflare check</h3><ul><li>DNS hostname: <code>wa.10xcollab.com</code></li><li>Origin service: <code>http://localhost:3131</code></li><li>SSL mode: HTTPS externally</li><li>Do not enable caching for <code>/api/*</code>, <code>/oauth/*</code>, or <code>/webhooks/*</code></li></ul><a href="${publicOrigin}/api/health" target="_blank" rel="noreferrer">Open public health check ↗</a></article>
        <article class="setup-card wide-card"><h3>Official references</h3><div class="reference-links"><a href="https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/" target="_blank" rel="noreferrer">OAuth 2.0 guide ↗</a><a href="https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/" target="_blank" rel="noreferrer">Webhook security ↗</a><a href="https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/" target="_blank" rel="noreferrer">Conversation Providers ↗</a><a href="https://marketplace.gohighlevel.com/docs/webhook/ProviderOutboundMessage/" target="_blank" rel="noreferrer">Provider outbound payload ↗</a></div></article>
      </div>`;
    content.appendChild(view);
    navButton.addEventListener('click', () => { document.querySelectorAll('.view').forEach(x => x.classList.add('hidden')); document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active')); view.classList.remove('hidden'); navButton.classList.add('active'); document.querySelector('#pageTitle').textContent = 'Setup docs'; document.querySelector('.sidebar').classList.remove('open'); });
    view.addEventListener('click', event => { const button = event.target.closest('[data-copy]'); if (button) copy(button.dataset.copy, button); });
  }
  window.addEventListener('load', install);
})();
