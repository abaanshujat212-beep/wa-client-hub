(function () {
  const panel = document.querySelector('#metaSignupPanel');
  if (!panel) return;
  const workspace = panel.querySelector('#metaSignupWorkspace');
  panel.querySelector('#metaSignupStatus').hidden=true;
  const detail = document.createElement('details');
  detail.innerHTML = '<summary>Connect with API credentials</summary><p>Use a WhatsApp Cloud API number you manage. Find these values in Meta Developer &gt; WhatsApp &gt; API setup.</p><form class="credentials-form" autocomplete="off"><label>Phone Number ID<input name="phoneNumberId" autocomplete="off" inputmode="numeric" pattern="[0-9]{1,64}" required></label><label>WhatsApp Business Account ID<input name="businessAccountId" autocomplete="off" inputmode="numeric" pattern="[0-9]{1,64}" required></label><label class="wide">Access Token<input name="accessToken" type="password" autocomplete="new-password" minlength="20" maxlength="4096" required></label><button class="button primary" type="submit">Verify &amp; save connection</button></form>';
  panel.appendChild(detail);
  const manage=document.createElement('a');manage.href='/whatsapp-settings.html';manage.className='button secondary';manage.textContent='Manage templates';manage.addEventListener('click',()=>sessionStorage.setItem('waSettingsWorkspace',workspace.value));panel.appendChild(manage);
  const list = document.createElement('div'); list.className = 'mini-list'; panel.appendChild(list);
  const feedback = document.createElement('p'); feedback.setAttribute('role','status'); panel.appendChild(feedback);
  let connections = [], generation = 0;
  async function request(url, body) {
    const options = {credentials:'same-origin'};
    if (body) { const session = await fetch('/api/session',options).then(r=>r.json()); options.method='POST'; options.headers={'content-type':'application/json','x-csrf-token':session.csrfToken}; options.body=JSON.stringify(body); }
    const response=await fetch(url,options); const result=await response.json().catch(()=>({error:"The service is temporarily unavailable. Try again shortly."}));
    if (!response.ok) throw new Error(result.error || 'Request failed. Refresh and try again.');
    return result;
  }
  function button(label, action) { const b=document.createElement('button'); b.type='button'; b.className='button secondary'; b.textContent=label; b.addEventListener('click',async()=>{ b.disabled=true; feedback.textContent='Working…'; try { await action(); } catch(e) { feedback.textContent=e.message; } finally { b.disabled=false; } }); return b; }
  async function load() {
    const selected=workspace.value, current=++generation; list.replaceChildren(); if(!selected)return;
    try {
      const result=await request('/api/meta/signup/status?workspaceId='+encodeURIComponent(selected));
      if(current!==generation || workspace.value!==selected)return;
      connections=result.connections||[];
      connections.forEach(c=>{
        const card=document.createElement('article');card.className='connection-card';
        const title=document.createElement('strong');title.textContent=c.label+(c.number?' · '+c.number.phone:'');card.appendChild(title);
        const status=document.createElement('p');status.textContent='Connection: '+c.status+' · Messaging: '+(c.number?.automationEnabled?'enabled':'not enabled');card.appendChild(status);
        if(c.coexistence){const sync=document.createElement('p');sync.textContent='Business app connected. Keep it open during synchronization. '+(c.syncJobs||[]).map(j=>j.step+': '+j.state).join(' � ')+(c.historySharing?' � History: '+c.historySharing:'');card.appendChild(sync);}
        const actions=document.createElement('div');actions.className='row-actions';card.appendChild(actions);
        const base='/api/meta/connections/'+encodeURIComponent(c.id), scope={workspaceId:selected};
        actions.appendChild(button('Check & activate',async()=>{
          const checked=await request(base+'/diagnostics',scope);
          if(!checked.webhookSubscribed || checked.tokenStatus!=='valid') { feedback.textContent='Connection saved. Subscribe this app to the WABA in Meta and confirm token access, then check again.';return; }
          if(checked.status!=='active')await request(base+'/activate',scope);
          feedback.textContent='Connection active. Sync templates, then enable messaging when ready.';await load();
        }));
        if(c.number) {
          actions.appendChild(button('Sync templates',async()=>{
            const result=await request(base+'/templates/sync',{...scope,numberId:c.number.id});
            const rows=result.templates||[]; feedback.textContent=rows.length?rows.length+' templates loaded.':'No templates returned by Meta. Create a template in WhatsApp Manager.';
            const catalog=document.createElement('div');catalog.className='mini-list'; rows.forEach(t=>{const row=document.createElement('p');row.textContent=t.name+' · '+t.language+' · '+t.status;catalog.appendChild(row);});
            card.querySelector('[data-catalog]')?.remove();catalog.dataset.catalog='true';card.appendChild(catalog);
          }));
          if(!c.number.automationEnabled)actions.appendChild(button('Enable messaging',async()=>{await request(base+'/diagnostics',scope);await request(base+'/enable-messaging',scope);feedback.textContent='Messaging enabled. You can now choose this number in New message / Template.';await load();}));
        }
        list.appendChild(card);
      });
    }catch(e){if(current===generation)feedback.textContent=e.message;}
  }
  detail.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget, submit=form.querySelector('button');if(submit.disabled)return;
    submit.disabled=true;feedback.textContent='Verifying number access with Meta…';
    try {const body=Object.fromEntries(new FormData(form));body.workspaceId=workspace.value;await request('/api/meta/signup/credentials',body);form.reset();detail.open=false;feedback.textContent='Connection saved securely. Use Check & activate to finish setup.';await load();}
    catch(e){feedback.textContent=e.message;}finally{submit.disabled=false;}
  });
  window.addEventListener('meta-connections-updated',load);
  workspace.addEventListener('change',load);
  new MutationObserver(load).observe(workspace,{childList:true});
  document.addEventListener('click',event=>{const target=event.target.closest('[data-select-workspace]');if(!target)return;workspace.value=target.dataset.selectWorkspace;workspace.dispatchEvent(new Event('change'));panel.scrollIntoView({behavior:'smooth',block:'start'});});
  new MutationObserver(()=>{if(!panel.classList.contains('hidden'))void load();}).observe(panel,{attributes:true,attributeFilter:['class']});
  void load();
})();