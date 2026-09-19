(() => {
  const panel=document.createElement('div');panel.className='team-panel';
  panel.innerHTML='<div class="heading"><div><h2>GHL message sync</h2><p>Received and sent messages saved in this app sync automatically to the mapped GHL location.</p></div><button type="button">Refresh sync status</button></div><p role="status"></p><p>Older phone chats must first be imported into this app. Unavailable attachments and uncertain deliveries need attention.</p>';
  document.querySelector('#numbers').appendChild(panel);
  const status=panel.querySelector('[role="status"]');
  async function load(){const workspaceId=document.querySelector('#workspace').value;if(!workspaceId)return;try{const r=await fetch('/api/ghl/message-sync?'+new URLSearchParams({workspaceId}));const d=await r.json();if(!r.ok)throw Error(d.error);status.textContent=d.states.length?d.states.map(s=>`${s.count} ${s.state}`).join(' · '):'No saved messages to sync yet.';if(d.errors.length)status.textContent+=' — '+d.errors.map(e=>`${e.count}: ${e.error_code}`).join(' · ');}catch(e){status.textContent=e.message||'Sync status unavailable';}}
  panel.querySelector('button').onclick=load;
  document.querySelector('#workspace').addEventListener('change',load);
  new MutationObserver(load).observe(document.querySelector('#numberRows'),{childList:true});
  void load();
})();
