import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const APP_URL='https://cookingconfidential.in/';
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const content=document.querySelector('#content');
const search=document.querySelector('#searchInput');
const loginPanel=document.querySelector('#loginPanel');
const appPanel=document.querySelector('#appPanel');
const userBadge=document.querySelector('#userBadge');
const loginForm=document.querySelector('#loginForm');
const loginMessage=document.querySelector('#loginMessage');
const menuDialog=document.querySelector('#menuDialog');
const detailDialog=document.querySelector('#detailDialog');
const importDialog=document.querySelector('#importDialog');
const importQueue=document.querySelector('#importQueue');
let importItems=[],recipes=[],menus=[],view='recipes';
let recipePage=0,recipeTotal=0;
const PAGE_SIZE=12;
let bootGeneration=0;

const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const stars=n=>n?'★'.repeat(n):'';
function ingredientsText(r){const v=r?.ingredients;if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:[x?.amount,x?.quantity,x?.unit,x?.name,x?.ingredient].filter(Boolean).join(' ')).filter(Boolean);if(typeof v==='string')return v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);return []}
function ensureNoticeStyles(){if(document.querySelector('#ccNoticeStyles'))return;const s=document.createElement('style');s.id='ccNoticeStyles';s.textContent=`#ccNotice{border:0;border-radius:24px;padding:0;max-width:min(520px,calc(100vw - 32px));width:calc(100% - 32px);background:transparent;box-shadow:0 24px 70px rgba(0,0,0,.24)}#ccNotice::backdrop{background:rgba(20,18,15,.48);backdrop-filter:blur(2px)}.cc-notice-card{background:#fbf8f2;border:1px solid #ddd5c8;border-radius:24px;padding:30px 28px 24px;color:#25221e;font-family:Arial,sans-serif}.cc-notice-card .eyebrow{margin:0 0 10px;color:#a94432;font-weight:700;letter-spacing:.16em;font-size:12px}.cc-notice-card h3{margin:0 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.1}.cc-notice-card p{margin:0;color:#746f66;font-size:16px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.cc-notice-actions{display:flex;justify-content:flex-end;margin-top:22px}.cc-notice-actions button{min-width:120px}@media(max-width:600px){#ccNotice{max-width:none}.cc-notice-card{padding:26px 22px 20px}.cc-notice-card h3{font-size:25px}.cc-notice-actions button{width:100%}}`;document.head.appendChild(s)}
function showNotice(message){ensureNoticeStyles();let d=document.querySelector('#ccNotice');if(!d){d=document.createElement('dialog');d.id='ccNotice';document.body.appendChild(d)}const text=String(message??'Something went wrong.');const looksError=/(error|could not|couldn't|unable|failed|failure|invalid|not found|try again|problem|loading|jwt)/i.test(text);d.innerHTML=`<div class="cc-notice-card"><p class="eyebrow">${looksError?'ERROR':'NOTICE'}</p><h3>${looksError?'Something went wrong':'Cooking Confidential'}</h3><p>${esc(text)}</p><div class="cc-notice-actions"><button class="primary" type="button" id="ccNoticeOk">OK</button></div></div>`;d.querySelector('#ccNoticeOk').onclick=()=>d.close();if(!d.open)d.showModal()}
window.alert=showNotice;
function isFutureJwtError(e){return /jwt.*(issued|iat).*future|issued at future/i.test(String(e?.message||e||''))}
function searchFilter(q){const safe=String(q||'').trim();if(!safe)return null;const like=`*${safe.replace(/[(),%]/g,' ')}*`;return `(name.ilike.${like},cuisine.ilike.${like},country.ilike.${like},region.ilike.${like},course.ilike.${like},personal_notes.ilike.${like})`}
function renderPagination(){const pages=Math.max(1,Math.ceil(recipeTotal/PAGE_SIZE));recipePage=Math.min(recipePage,pages-1);if(recipeTotal<=PAGE_SIZE)return '';const start=recipePage*PAGE_SIZE+1,end=Math.min((recipePage+1)*PAGE_SIZE,recipeTotal);return `<div class="cc-pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:24px 0 8px"><button class="secondary cc-page" data-page="0" ${recipePage===0?'disabled':''}>First</button><button class="secondary cc-page" data-page="${Math.max(0,recipePage-1)}" ${recipePage===0?'disabled':''}>‹ Prev</button><span style="padding:0 8px;color:#746f66;font-size:14px">${start}–${end} of ${recipeTotal} · Page ${recipePage+1} of ${pages}</span><button class="secondary cc-page" data-page="${Math.min(pages-1,recipePage+1)}" ${recipePage>=pages-1?'disabled':''}>Next ›</button><button class="secondary cc-page" data-page="${pages-1}" ${recipePage>=pages-1?'disabled':''}>Last</button></div>`}
function bindPagination(){content.querySelectorAll('.cc-page').forEach(b=>b.onclick=async()=>{if(b.disabled)return;recipePage=Number(b.dataset.page);try{await loadRecipePage()}catch(e){showNotice(e.message||'Could not load your recipes.')}})}
async function loadRecipePage(){content.innerHTML='<div class="empty">Loading your recipes…</div>';let q=supabase.from('cc_recipes').select('*',{count:'exact'}).order('updated_at',{ascending:false}).range(recipePage*PAGE_SIZE,recipePage*PAGE_SIZE+PAGE_SIZE-1);const f=searchFilter(search?.value);if(f)q=q.or(f);if(view==='favourites')q=q.eq('is_favourite',true);const {data,error,count}=await q;if(error)throw new Error(error.message);recipes=data||[];recipeTotal=count||0;render()}
async function loadMenus(){const r=await supabase.from('cc_menus').select('*').order('menu_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false});if(!r.error)menus=r.data||[]}
async function loadData(){if(view==='menus'){await loadMenus();render();return}await loadRecipePage()}
function recipeCard(r){return `<article class="card" data-id="${r.id}"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name||'Untitled recipe')}</h3><div class="meta">${esc(r.course||'Recipe')} · ${stars(r.rating)}</div></div></article>`}
function render(){const q=(search?.value||'').trim().toLowerCase();if(view==='menus')return renderMenus(q);content.innerHTML=`<div class="section-head"><h2>${view==='favourites'?'Favourites':'Your recipes'}</h2><span class="count">${recipeTotal} recipes</span></div>${recipes.length?'<div class="grid">'+recipes.map(recipeCard).join('')+'</div>':'<div class="empty">No recipes found. Try another ingredient, cuisine or dish.</div>'}${renderPagination()}`;content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));bindPagination()}
function renderMenus(q){const list=menus.filter(m=>(m.name+' '+(m.occasion||'')+' '+(m.notes||'')).toLowerCase().includes(q));content.innerHTML=`<div class="section-head"><h2>Your menus</h2><span class="count">${list.length} menus</span></div><button class="primary" id="newMenuBtn">＋ New menu</button><div style="margin-top:18px">${list.length?list.map(m=>`<article class="menu-card"><span class="tag">${m.guest_count?m.guest_count+' guests':'Menu'} ${m.menu_date?'· '+esc(m.menu_date):''}</span><h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div><button class="tab copy-menu" data-id="${m.id}">Copy & modify</button></article>`).join(''):'<div class="empty">No menus yet. Create one from a blank page.</div>'}</div>`;document.querySelector('#newMenuBtn').onclick=()=>menuDialog.showModal();content.querySelectorAll('.copy-menu').forEach(b=>b.onclick=()=>copyMenu(+b.dataset.id))}
async function showRecipe(id){const r=recipes.find(x=>x.id===id);if(!r)return;detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name)}</h2><div class="meta">${stars(r.rating)}</div><div class="detail-section"><h4>Ingredients</h4><ul>${ingredientsText(r).map(i=>'<li>'+esc(i)+'</li>').join('')}</ul></div><div class="detail-section"><h4>Method</h4><p>${esc(r.method||'')}</p></div>${r.personal_notes?'<div class="detail-section"><h4>My notes</h4><p>'+esc(r.personal_notes)+'</p>':''}${r.source_url?'<div class="detail-section"><h4>Source</h4><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.source_title||r.source_url)+'</a></p></div>':''}<div class="detail-actions" style="display:flex;gap:12px;align-items:stretch;flex-wrap:nowrap"><button class="secondary" id="editRecipeBtn" type="button" style="flex:1;min-width:0">Edit recipe</button><button class="secondary" id="favBtn" type="button" style="flex:1;min-width:0">${r.is_favourite?'★ Remove favourite':'☆ Add to favourites'}</button></div>`;detailDialog.showModal();document.querySelector('#editRecipeBtn').onclick=async()=>{try{if(typeof window.CCOpenEditor!=='function')await import('./recipe-management-fix.js?v=1.3.5');if(typeof window.CCOpenEditor==='function')await window.CCOpenEditor(r);else alert('Recipe editor could not be loaded. Please try again.')}catch(e){console.error(e);alert('Recipe editor could not be loaded. Please try again.')}};document.querySelector('#favBtn').onclick=async()=>{const {error}=await supabase.from('cc_recipes').update({is_favourite:!r.is_favourite}).eq('id',r.id);if(error)return alert(error.message);r.is_favourite=!r.is_favourite;detailDialog.close();await loadRecipePage()}}
async function copyMenu(id){const m=menus.find(x=>x.id===id);if(!m)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('cc_menus').insert({name:m.name+' — Copy',menu_date:null,occasion:m.occasion,guest_count:m.guest_count,notes:m.notes,visibility:'private',created_by:user.id}).select().single();if(error)return alert(error.message);const items=await supabase.from('cc_menu_items').select('*').eq('menu_id',m.id).order('sort_order');if(items.error)return alert(items.error.message);if(items.data?.length){const rows=items.data.map(x=>({menu_id:data.id,recipe_id:x.recipe_id,section:x.section,sort_order:x.sort_order,custom_label:x.custom_label}));const ins=await supabase.from('cc_menu_items').insert(rows);if(ins.error)return alert(ins.error.message)}await loadData();alert('Menu copied. You can now edit the new version without changing the original.')}
loginForm.onsubmit=async e=>{e.preventDefault();const b=loginForm.querySelector('button');if(!b||b.disabled)return;const email=document.querySelector('#emailInput').value.trim();if(!email){loginMessage.textContent='Please enter your email address.';return}b.disabled=true;b.textContent='Sending…';loginMessage.textContent='Sending sign-in link…';try{const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:APP_URL}});if(error)throw error;loginMessage.textContent='Check your email for the sign-in link.'}catch(error){console.error('Cooking Confidential sign-in:',error);const m=String(error?.message||error||'Unable to send the sign-in link.');loginMessage.textContent=/rate limit|too many requests/i.test(m)?'Please wait about 60 seconds before requesting another sign-in link.':m}finally{b.disabled=false;b.textContent='Send me a sign-in link'}};
document.querySelector('#menuForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('cc_menus').insert({name:f.get('name'),menu_date:f.get('date')||null,guest_count:f.get('guests')?Number(f.get('guests')):null,occasion:f.get('occasion')||null,notes:f.get('notes')||null,visibility:'private',created_by:user.id});if(error)return alert(error.message);menuDialog.close();e.target.reset();view='menus';await loadData()};
document.querySelector('#importBtn').onclick=()=>importDialog.showModal();document.querySelector('#closeImport').onclick=()=>importDialog.close();document.querySelector('#fileInput').onchange=e=>queueFiles([...e.target.files]);document.querySelector('#addUrlBtn').onclick=()=>{const i=document.querySelector('#sourceUrl'),url=i.value.trim();if(!url)return;addImportItem({source_url:url,file_name:url.split('/').pop()||url,mime_type:'text/url'});i.value=''};
function addImportItem(item){item.localId=crypto.randomUUID();item.status='Queued';importItems.push(item);renderImportQueue()}
function queueFiles(files){files.forEach(file=>addImportItem({file,file_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size}))}
function renderImportQueue(){importQueue.innerHTML=importItems.length?'<div class="queue-head"><strong>'+importItems.length+' selected</strong><button class="secondary" id="uploadAll" type="button">Upload all</button></div>'+importItems.map(x=>'<div class="queue-item"><div><strong>'+esc(x.file_name)+'</strong><small>'+esc(x.mime_type||'')+(x.size?' · '+Math.round(x.size/1024)+' KB':'')+'</small></div><span>'+esc(x.status)+'</span></div>').join(''):'<div class="empty compact">Select files or add a URL to begin.</div>'}
search.oninput=()=>{if(view==='menus')render();else{recipePage=0;clearTimeout(window.__ccRecipeSearchTimer);window.__ccRecipeSearchTimer=setTimeout(()=>loadRecipePage().catch(e=>showNotice(e.message||'Could not load your recipes.')),250)}};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{view=t.dataset.view;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));recipePage=0;loadData().catch(e=>showNotice(e.message||'Could not load your recipes.'))});
window.addEventListener('cc:recipes-changed',()=>loadData().catch(e=>showNotice(e.message||'Could not refresh your recipes.')));

async function boot(sessionOverride){
  const generation=++bootGeneration;
  let session=sessionOverride;
  if(!session){const r=await supabase.auth.getSession();if(r.error)throw r.error;session=r.data.session}
  if(generation!==bootGeneration)return;
  if(!session){loginPanel.hidden=false;appPanel.hidden=true;return}
  loginPanel.hidden=true;appPanel.hidden=false;userBadge.textContent=session.user.email||'Signed in';
  try{await loadData()}
  catch(error){
    if(generation!==bootGeneration)return;
    console.error('Cooking Confidential load:',error);
    if(isFutureJwtError(error)){
      console.warn('Future-issued JWT detected; refreshing session instead of signing the user out.');
      try{const refreshed=await supabase.auth.refreshSession();if(generation!==bootGeneration)return;if(!refreshed.error&&refreshed.data.session){await loadData();return}}catch(refreshError){console.error('Session refresh failed:',refreshError)}
    }
    showNotice(error?.message||'Could not load your recipes.');
  }
}

supabase.auth.onAuthStateChange((event,session)=>{
  if(event==='INITIAL_SESSION'||event==='SIGNED_IN'){
    setTimeout(()=>boot(session).catch(e=>{console.error('Cooking Confidential auth:',e);showNotice(e.message||'Could not initialise your session.')}),0);
  }else if(event==='SIGNED_OUT'){
    ++bootGeneration;loginPanel.hidden=false;appPanel.hidden=true;content.innerHTML='';
  }
});
ensureNoticeStyles();
