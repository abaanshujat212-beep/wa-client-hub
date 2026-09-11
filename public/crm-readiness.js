(() => {
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
  const get = selector => document.querySelector(selector);
  async function load(workspaceId) {
    const panel = get('#ghlReadinessPanel');
    if (!panel || !workspaceId) return;
    panel.innerHTML = '<div class="empty compact">Checking CRM OAuth, webhook, and exact number mapping readiness…</div>';
    try {
      const response = await fetch(`/api/ghl/readiness?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: 'same-origin' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Readiness request failed (${response.status})`);
      const rows = body.installations || [];
      const endpointRows = `<div class="mini-row"><div><strong>OAuth callback</strong><small>${esc(body.redirectUri || 'Not configured')}</small></div><span class="badge ${body.configured ? '' : 'off'}">${body.configured ? 'Configured' : 'Missing configuration'}</span></div><div class="mini-row"><div><strong>Webhook receivers</strong><small>${esc(body.webhooks?.events || '')}<br>${esc(body.webhooks?.messages || '')}</small></div><span class="badge">Routes active</span></div>`;
      const installationRows = rows.length ? rows.map(row => `<div class="mini-row multi"><div><strong>${esc(row.companyId || 'Company unavailable')} · ${esc(row.locationId)}</strong><small>Workspace ${esc(row.workspaceId)} · scopes ${esc((row.scopes || []).join(', ') || 'none')}<br>Number ${esc(row.numberLabel || 'not mapped')} ${row.numberPhone ? `· ${esc(row.numberPhone)}` : ''}<br>Provider ${esc(row.provider || 'not mapped')} · connection ${esc(row.providerConnectionId || 'not mapped')}<br>conversationProviderId ${esc(row.conversationProviderId || 'missing')}</small></div><div class="row-actions"><span class="badge ${row.oauthReady ? '' : 'off'}">OAuth ${row.oauthReady ? 'ready' : 'incomplete'}</span><span class="badge ${row.mappingReady ? '' : 'off'}">Mapping ${row.mappingReady ? 'ready' : 'incomplete'}</span><span class="badge ${row.ready ? '' : 'off'}">${row.ready ? 'Ready' : 'Action required'}</span></div></div>`).join('') : '<div class="empty compact">No CRM installation is connected for this workspace.</div>';
      panel.innerHTML = `<div class="notice"><strong>Required scope:</strong> ${esc((body.requiredScopes || []).join(', ') || 'not configured')}<br><strong>Do not request:</strong> ${esc((body.unsupportedScopes || []).join(', '))}<br>Mapping requires the exact workspace, WhatsApp number, provider connection, location, and <code>conversationProviderId</code>.</div>${endpointRows}<div class="mini-list">${installationRows}</div>`;
    } catch (error) {
      panel.innerHTML = `<div class="empty compact">${esc(error.message)}. Check PostgreSQL, CRM credentials, and the deployment readiness warnings.</div>`;
    }
  }
  function install() {
    const view = get('#integrationsView');
    if (!view) return setTimeout(install, 50);
    const card = [...view.querySelectorAll('.integration-card')].find(node => node.textContent.includes('HighLevel private pilot'));
    if (!card || get('#ghlReadinessPanel')) return;
    const connect = get('#ghlConnect');
    if (connect) {
      const replacement = connect.cloneNode(true);
      replacement.textContent = 'Connect / reconnect CRM';
      connect.replaceWith(replacement);
      replacement.addEventListener('click', () => { const workspaceId = get('#ghlWorkspace')?.value; if (workspaceId) window.location.href = `/oauth/crm/start?workspaceId=${encodeURIComponent(workspaceId)}`; });
    }
    const panel = document.createElement('div');
    panel.id = 'ghlReadinessPanel';
    panel.className = 'mini-list';
    const list = get('#ghlList');
    card.insertBefore(panel, list || null);
    const workspace = get('#ghlWorkspace');
    workspace?.addEventListener('change', () => load(workspace.value));
    get('#ghlRefresh')?.addEventListener('click', () => setTimeout(() => load(workspace?.value), 0));
    load(workspace?.value);
    const gate = document.createElement('div');
    gate.className = 'notice';
    gate.innerHTML = '<strong>Calling — POC / provider approval required.</strong><p>CRM readiness does not enable live calling. Calling remains blocked by issue #51.</p>';
    card.parentElement.insertBefore(gate, card);
  }
  window.addEventListener('load', () => setTimeout(install, 0));
})();
