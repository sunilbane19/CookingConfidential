import { supabase } from './supabase-client.js?v=1.0.1';

const state=document.querySelector('#adminState');
const content=document.querySelector('#adminContent');
const list=document.querySelector('#memberList');
const form=document.querySelector('#addUserForm');
const baseUrl=location.href.replace(/admin\.html(?:\?.*)?$/,'');

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function getOwner(){
  const{data:{session}}=await supabase.auth.getSession();
  if(!session){location.href=baseUrl;return null}
  const{data:member,error}=await supabase.from('cc_members').select('id,display_name,role,active').eq('auth_user_id',session.user.id).maybeSingle();
  if(error||!member||member.role!=='owner'||!member.active){state.textContent='Administrator access required.';await supabase.auth.signOut();return null}
  return session;
}

async function loadMembers(){
  const{data,error}=await supabase.from('cc_members').select('id,email,display_name,role,active,auth_user_id').order('id');
  if(error){state.textContent=error.message;return}
  list.innerHTML=`<div style="overflow:auto"><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${(data||[]).map(m=>{
    const status=!m.active?'off':(m.auth_user_id?'active':'pending');
    const label=!m.active?'Inactive':(m.auth_user_id?'Active':'Pending sign-in');
    return `<tr>
      <td><strong>${esc(m.display_name||'—')}</strong></td>
      <td>${esc(m.email||'—')}</td>
      <td>${esc(m.role)}</td>
      <td><span class="status ${status}">${label}</span></td>
      <td><div class="member-actions">${m.role==='member'?(
        (m.auth_user_id?`<button class="secondary" data-toggle="${m.id}" data-active="${m.active?'1':'0'}">${m.active?'Deactivate':'Activate'}</button>`:
        `<button class="secondary" data-invite="${m.id}" data-email="${esc(m.email)}">${m.active?'Send sign-in link':'Activate & send link'}</button>`)
      ):''}</div></td>
    </tr>`
  }).join('')}</tbody></table></div>`;
  list.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{
    const id=Number(btn.dataset.toggle),active=btn.dataset.active!=='1';
    const{error}=await supabase.from('cc_members').update({active}).eq('id',id);
    if(error)alert(error.message);else loadMembers();
  });
  list.querySelectorAll('[data-invite]').forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true;btn.textContent='Sending…';
    const{error}=await supabase.auth.signInWithOtp({email:btn.dataset.email,options:{emailRedirectTo:baseUrl,shouldCreateUser:true}});
    if(error)alert(error.message);else alert('Sign-in link sent to '+btn.dataset.email);
    btn.disabled=false;btn.textContent='Send sign-in link';
    loadMembers();
  });
}

form.onsubmit=async e=>{
  e.preventDefault();
  const name=document.querySelector('#newName').value.trim();
  const email=document.querySelector('#newEmail').value.trim().toLowerCase();
  const{error}=await supabase.from('cc_members').insert({email,display_name:name,role:'member',active:true,auth_user_id:null});
  if(error){alert(error.message);return}
  form.reset();await loadMembers();
};

document.querySelector('#adminSignOut').onclick=async()=>{await supabase.auth.signOut();location.href=baseUrl};
(async()=>{
  const session=await getOwner();
  if(!session)return;
  state.hidden=true;content.hidden=false;
  await loadMembers();
})();