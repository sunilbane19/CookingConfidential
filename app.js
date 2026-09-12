import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const APP_URL = 'https://cookingconfidential.in/';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const content = document.querySelector('#content');
const search = document.querySelector('#searchInput');
const loginPanel = document.querySelector('#loginPanel');
const appPanel = document.querySelector('#appPanel');
const userBadge = document.querySelector('#userBadge');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const menuDialog = document.querySelector('#menuDialog');
const detailDialog = document.querySelector('#detailDialog');
const importDialog = document.querySelector('#importDialog');
const importQueue = document.querySelector('#importQueue');
let importItems = [];
let recipes = [], menus = [], view = 'recipes';
const esc = (s='') => String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const stars = n => n ? '★'.repeat(n) : '';

function ingredientsText(r){
  const value = r?.ingredients;
  if (Array.isArray(value)) return value.map(x => typeof x === 'string' ? x : [x?.amount,x?.quantity,x?.unit,x?.name,x?.ingredient].filter(Boolean).join(' ')).filter(Boolean);
  if (typeof value === 'string') return value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return [];
}

function ensureNoticeStyles(){
  if(document.querySelector('#ccNoticeStyles'))return;
  const s=document.createElement('style');s.id='ccNoticeStyles';s.textContent=`
  #ccNotice{border:0;border-radius:24px;padding:0;max-width:min(520px,calc(100vw - 32px));width:calc(100% - 32px);background:transparent;box-shadow:0 24px 70px rgba(0,0,0,.24)}
  #ccNotice::backdrop{background:rgba(20,18,15,.48);backdrop-filter:blur(2px)}
  .cc-notice-card{background:#fbf8f2;border:1px solid #ddd5c8;border-radius:24px;padding:30px 28px 24px;color:#25221e;font-family:Arial,sans-serif}
  .cc-notice-card .eyebrow{margin:0 0 10px;color:#a94432;font-weight:700;letter-spacing:.16em;font-size:12px}
  .cc-notice-card h3{margin:0 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.1}
  .cc-notice-card p{margin:0;color:#746f66;font-size:16px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
  .cc-notice-actions{display:flex;justify-content:flex-end;margin-top:22px}.cc-notice-actions button{min-width:120px}
  @media(max-width:600px){#ccNotice{max-width:none}.cc-notice-card{padding:26px 22px 20px}.cc-notice-card h3{font-size:25px}.cc-notice-actions button{width:100%}}
  `;document.head.appendChild(s);
}
function showNotice(message){
  ensureNoticeStyles();
  let d=document.querySelector('#ccNotice');
  if(!d){d=document.createElement('dialog');d.id='ccNotice';document.body.appendChild(d)}
  const text=String(message??'Something went wrong.');
  const looksError=/(error|could not|couldn't|unable|failed|failure|invalid|select at least|please sign|not found|try again|problem|loading)/i.test(text);
  d.innerHTML=`<div class="cc-notice-card"><p class="eyebrow">${looksError?'ERROR':'NOTICE'}</p><h3>${looksError?'Something went wrong':'Cooking Confidential'}</h3><p>${esc(text)}</p><div class="cc-notice-actions"><button class="primary" type="button" id="ccNoticeOk">OK</button></div></div>`;
  d.querySelector('#ccNoticeOk').onclick=()=>d.close();
  if(!d.open)d.showModal();
}
window.alert=showNotice;

async function loadData() {
  content.innerHTML = '<div class="empty">Loading your recipes…</div>';
  const recipesResult = await supabase.from('cc_recipes').select('*').order('updated_at',{ascending:false});
  if (recipesResult.error) throw new Error(recipesResult.error.message);
  recipes = recipesResult.data || [];
  render();
  try {
    const menusResult = await supabase.from('cc_menus').select('*').order('menu_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false});
    if (!menusResult.error) menus = menusResult.data || [];
  } catch (_) { menus = []; }
}
function recipeCard(r) { return `<article class="card" data-id="${r.id}"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name)}</h3><div class="meta">${esc(r.course||'Recipe')} · ${stars(r.rating)}</div></div></article>`; }
function render() {
  const q = search.value.trim().toLowerCase();
  if (view === 'menus') return renderMenus(q);
  let list = recipes.filter(r => view !== 'favourites' || r.is_favourite).filter(r => (r.name+' '+(r.cuisine||'')+' '+(r.country||'')+' '+(r.region||'')+' '+(r.course||'')+' '+ingredientsText(r).join(' ')+' '+(r.personal_notes||'')).toLowerCase().includes(q));
  content.innerHTML = `<div class="section-head"><h2>${view==='favourites'?'Favourites':'Your recipes'}</h2><span class="count">${list.length} recipes</span></div>${list.length ? '<div class="grid">'+list.map(recipeCard).join('')+'</div>' : '<div class="empty">No recipes found. Try another ingredient, cuisine or dish.</div>'}`;
  content.querySelectorAll('.card').forEach(c => c.onclick = () => showRecipe(+c.dataset.id));
}
function renderMenus(q) {
  const list = menus.filter(m => (m.name+' '+(m.occasion||'')+' '+(m.notes||'')).toLowerCase().includes(q));
  content.innerHTML = `<div class="section-head"><h2>Your menus</h2><span class="count">${list.length} menus</span></div><button class="primary" id="newMenuBtn">＋ New menu</button><div style="margin-top:18px">${list.length ? list.map(m => `<article class="menu-card"><span class="tag">${m.guest_count ? m.guest_count+' guests' : 'Menu'} ${m.menu_date ? '· '+esc(m.menu_date) : ''}</span><h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div><button class="tab copy-menu" data-id="${m.id}">Copy & modify</button></article>`).join('') : '<div class="empty">No menus yet. Create one from a blank page.</div>'}</div>`;
  document.querySelector('#newMenuBtn').onclick = () => menuDialog.showModal(); content.querySelectorAll('.copy-menu').forEach(b => b.onclick = () => copyMenu(+b.dataset.id));
}
async function showRecipe(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  detailDialog.querySelector('#detailContent').innerHTML = `<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name)}</h2><div class="meta">${stars(r.rating)}</div><div class="detail-section"><h4>Ingredients</h4><ul>${ingredientsText(r).map(i=>'<li>'+esc(i)+'</li>').join('')}</ul></div><div class="detail-section"><h4>Method</h4><p>${esc(r.method||'')}</p></div>${r.personal_notes ? '<div class="detail-section"><h4>My notes</h4><p>'+esc(r.personal_notes)+'</p>' : ''}${r.source_url ? '<div class="detail-section"><h4>Source</h4><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.source_title||r.source_url)+'</a></p></div>' : ''}<div class="detail-actions" style="display:flex;gap:12px;align-items:stretch;flex-wrap:nowrap"><button class="secondary" id="editRecipeBtn" type="button" style="flex:1;min-width:0">Edit recipe</button><button class="secondary" id="favBtn" type="button" style="flex:1;min-width:0">${r.is_favourite?'★ Remove favourite':'☆ Add to favourites'}</button></div>`;
  detailDialog.showModal();
  document.querySelector('#editRecipeBtn').onclick = async () => {
    try {
      if (typeof window.CCOpenEditor !== 'function') await import('./recipe-management-fix.js?v=1.3.4');
      if (typeof window.CCOpenEditor === 'function') await window.CCOpenEditor(r); else alert('Recipe editor could not be loaded. Please try again.');
    } catch (e) { console.error('Cooking Confidential recipe editor:', e); alert('Recipe editor could not be loaded. Please try again.'); }
  };
  document.querySelector('#favBtn').onclick = async () => { const {error}=await supabase.from('cc_recipes').update({is_favourite:!r.is_favourite}).eq('id',r.id); if(error)return alert(error.message); r.is_favourite=!r.is_favourite; detailDialog.close(); render(); };
}
async function copyMenu(id) { const m=menus.find(x=>x.id===id);if(!m)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('cc_menus').insert({name:m.name+' — Copy',menu_date:null,occasion:m.occasion,guest_count:m.guest_count,notes:m.notes,visibility:'private',created_by:user.id}).select().single();if(error)return alert(error.message);const items=await supabase.from('cc_menu_items').select('*').eq('menu_id',m.id).order('sort_order');if(items.error)return alert(items.error.message);if(items.data?.length){const rows=items.data.map(x=>({menu_id:data.id,recipe_id:x.recipe_id,section:x.section,sort_order:x.sort_order,custom_label:x.custom_label}));const ins=await supabase.from('cc_menu_items').insert(rows);if(ins.error)return alert(ins.error.message);}await loadData();alert('Menu copied. You can now edit the new version without changing the original.');}
loginForm.onsubmit=async e=>{e.preventDefault();const button=loginForm.querySelector('button');if(!button||button.disabled)return;const email=document.querySelector('#emailInput').value.trim();button.disabled=true;button.textContent='Sending…';loginMessage.textContent='Sending sign-in link…';const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:APP_URL}});if(error){const message=String(error.message||'').toLowerCase();loginMessage.textContent=message.includes('rate limit')?'Please wait about 60 seconds before requesting another sign-in link.':'We could not send the sign-in link right now. Please try again in a moment.';button.disabled=false;button.textContent='Send me a sign-in link';}else loginMessage.textContent='Check your email for the sign-in link.';};
document.querySelector('#menuForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('cc_menus').insert({name:f.get('name'),menu_date:f.get('date')||null,guest_count:f.get('guests')?Number(f.get('guests')):null,occasion:f.get('occasion')||null,notes:f.get('notes')||null,visibility:'private',created_by:user.id});if(error)return alert(error.message);menuDialog.close();e.target.reset();await loadData();view='menus';};
document.querySelector('#importBtn').onclick=()=>importDialog.showModal();
document.querySelector('#closeImport').onclick=()=>importDialog.close();
document.querySelector('#fileInput').onchange=e=>queueFiles([...e.target.files]);
document.querySelector('#addUrlBtn').onclick=()=>{const input=document.querySelector('#sourceUrl');const url=input.value.trim();if(!url)return;addImportItem({source_url:url,file_name:url.split('/').pop()||url,mime_type:'text/url'});input.value='';};
function addImportItem(item){item.localId=crypto.randomUUID();item.status='Queued';importItems.push(item);renderImportQueue();}
function queueFiles(files){files.forEach(file=>addImportItem({file,file_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size}));}
function renderImportQueue(){importQueue.innerHTML=importItems.length?'<div class="queue-head"><strong>'+importItems.length+' selected</strong><button class="secondary" id="uploadAll" type="button">Upload all</button></div>'+importItems.map(x=>'<div class="queue-item"><div><strong>'+esc(x.file_name)+'</strong><small>'+esc(x.mime_type||'')+(x.size?' · '+Math.round(x.size/1024)+' KB':'')+'</small></div><span>'+esc(x.status)+'</span></div>').join(''):'<div class="empty compact">Select files or add a URL to begin.</div>';}
search.oninput=()=>render();
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{view=t.dataset.view;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));render();});
window.addEventListener('cc:recipes-changed',()=>loadData().catch(e=>showNotice(e.message||'Could not refresh your recipes.')));
async function boot(sessionOverride=null){let session=sessionOverride;if(!session){const {data:{session:currentSession}}=await supabase.auth.getSession();session=currentSession;}if(!session){loginPanel.hidden=false;appPanel.hidden=true;return;}loginPanel.hidden=true;appPanel.hidden=false;userBadge.textContent=session.user.email||'Signed in';try{await loadData();}catch(e){console.error('Cooking Confidential load:',e);showNotice(e.message||'Could not load your recipes.');}}
supabase.auth.onAuthStateChange((_event,session)=>{if(session){setTimeout(()=>boot(session),0);}else{loginPanel.hidden=false;appPanel.hidden=true;}});
ensureNoticeStyles();
boot();
