(function () {
  const view=document.querySelector('#contactsView');if(!view)return;
  view.innerHTML='<div class="section-heading"><h2>Contacts</h2><button id="contactRefresh" class="button secondary">Refresh</button></div><div class="form-grid"><label>Workspace / WhatsApp number<select id="contactConnection"></select></label><label>Search name or phone<input id="contactSearch" type="search" maxlength="100"></label></div><p id="contactSync" role="status"></p><div id="contactRows" class="table-card"></div><button id="contactMore" class="button secondary" hidden>Load more</button>';
  const $=id=>view.querySelector('#'+id);let next=null,generation=0,directory=[];
  async function get(path){const r=await fetch('/api/contacts'+path,{credentials:'same-origin'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Contacts unavailable');return data;}
  async function load(more=false){
    const gen=++generation;if(!more){next=null;$('contactRows').replaceChildren();} $('contactMore').hidden=true;
    if(!$('contactConnection').value){$('contactSync').textContent='Connect a WhatsApp number to view its contacts.';return;}
    try{
      const data=await get('/?'+new URLSearchParams({connectionId:$('contactConnection').value,search:$('contactSearch').value,offset:more?next||0:0}));if(gen!==generation)return;
      for(const c of data.contacts){const row=document.createElement('div');row.className='client-row';const name=document.createElement('strong');name.textContent=c.display_name||c.phone_e164;const detail=document.createElement('span');detail.textContent=c.phone_e164+' · '+(c.business_app?(c.business_app.removed?'Removed from Business app contacts':'WhatsApp Business app'):c.has_calls?'Calling contact':'Conversation contact');row.append(name,detail);$('contactRows').append(row);}
      next=data.nextOffset;$('contactMore').hidden=next===null;
      const sync=data.sync;
      $('contactSync').textContent=(sync?'Business app contact sync request: '+sync.state+'. Accepted means requested, not that every contact has arrived.':'Showing contacts from chats and calls. Phone address-book sync requires an eligible WhatsApp Business app coexistence connection.')+' Updated '+new Date().toLocaleTimeString()+'.';
      if(!$('contactRows').children.length)$('contactRows').textContent='No contacts found.';
    }catch(e){if(gen===generation)$('contactSync').textContent=e.message;}
  }
  async function refresh(){try{const previous=$('contactConnection').value;directory=(await get('/connections')).connections;$('contactConnection').replaceChildren();directory.forEach(c=>$('contactConnection').add(new Option(c.workspace_name+' · '+c.phone,c.id)));if(directory.some(c=>c.id===previous))$('contactConnection').value=previous;await load();}catch(e){$('contactSync').textContent=e.message;}}
  $('contactRefresh').onclick=refresh;$('contactConnection').onchange=()=>load();$('contactMore').onclick=()=>load(true);
  let timer;$('contactSearch').oninput=()=>{generation++;clearTimeout(timer);timer=setTimeout(()=>void load(),250);};
  window.addEventListener('workspaces-updated',()=>void refresh());
  document.querySelector('[data-view="contacts"]')?.addEventListener('click',()=>void refresh());
  document.querySelector('[data-tab="contacts"]')?.addEventListener('click',()=>void refresh());
  void refresh();
})();
