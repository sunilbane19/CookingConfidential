import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const content = document.querySelector('#content');
const search = document.querySelector('#searchInput');
const loginPanel = document.querySelector('#loginPanel');
const appPanel = document.querySelector('#appPanel');
const userBadge = document.querySelector('#userBadge');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const recipeDialog = document.querySelector('#recipeDialog');
const menuDialog = document.querySelector('#menuDialog');
const detailDialog = document.querySelector('#detailDialog');
const importDialog = document.querySelector('#importDialog');
const importQueue = document.querySelector('#importQueue');
let importItems = [];

let recipes = [], menus = [], view = 'recipes';

const esc = (s='') => String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const stars = n => n ? '★'.repeat(n) : '';
const ingredientsText = r => Array.isArray(r.ingredients) ? r.ingredients.map(x => typeof x === 'string' ? x : [x.quantity,x.unit,x.name].filter(Boolean).join(' ')) : [];

async function loadData() {
  const [{data:r,error:re},{data:m,error:me}] = await Promise.all([
    supabase.from('cc_recipes').select('*').order('updated_at',{ascending:false}),
    supabase.from('cc_menus').select('*').order('menu_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false})
  ]);
  if (re || me) throw new Error((re||me).message);
  recipes = r || []; menus = m || [];
  render();
}

function recipeCard(r) {
  return `<article class="card" data-id="${r.id}">
    <div class="card-image">🍽</div><div class="card-body">
      <span class="tag">${esc(r.cuisine||'Uncategorised')}</span>
      <h3>${esc(r.name)}</h3>
      <div class="meta">${esc(r.course||'Recipe')} · ${stars(r.rating)}</div>
    </div></article>`;
}

function render() {
  const q = search.value.trim().toLowerCase();
  if (view === 'menus') return renderMenus(q);
  let list = recipes.filter(r => view !== 'favourites' || r.is_favourite)
    .filter(r => (r.name+' '+(r.cuisine||'')+' '+(r.country||'')+' '+(r.region||'')+' '+(r.course||'')+' '+ingredientsText(r).join(' ')+' '+(r.personal_notes||'')).toLowerCase().includes(q));
  content.innerHTML = `<div class="section-head"><h2>${view==='favourites'?'Favourites':'Your recipes'}</h2><span class="count">${list.length} recipes</span></div>
    ${list.length ? '<div class="grid">'+list.map(recipeCard).join('')+'</div>' : '<div class="empty">No recipes found. Try another ingredient, cuisine or dish.</div>'}`;
  content.querySelectorAll('.card').forEach(c => c.onclick = () => showRecipe(+c.dataset.id));
}

function renderMenus(q) {
  const list = menus.filter(m => (m.name+' '+(m.occasion||'')+' '+(m.notes||'')).toLowerCase().includes(q));
  content.innerHTML = `<div class="section-head"><h2>Your menus</h2><span class="count">${list.length} menus</span></div>
    <button class="primary" id="newMenuBtn">＋ New menu</button>
    <div style="margin-top:18px">${list.length ? list.map(m => `<article class="menu-card">
      <span class="tag">${m.guest_count ? m.guest_count+' guests' : 'Menu'} ${m.menu_date ? '· '+esc(m.menu_date) : ''}</span>
      <h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div>
      <button class="tab copy-menu" data-id="${m.id}">Copy & modify</button>
    </article>`).join('') : '<div class="empty">No menus yet. Create one from a blank page.</div>'}</div>`;
  document.querySelector('#newMenuBtn').onclick = () => menuDialog.showModal();
  content.querySelectorAll('.copy-menu').forEach(b => b.onclick = () => copyMenu(+b.dataset.id));
}

async function showRecipe(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  detailDialog.querySelector('#detailContent').innerHTML = `<button class="close" onclick="detailDialog.close()">×</button>
    <span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name)}</h2>
    <div class="meta">${stars(r.rating)}</div>
    <div class="detail-section"><h4>Ingredients</h4><ul>${ingredientsText(r).map(i=>'<li>'+esc(i)+'</li>').join('')}</ul></div>
    <div class="detail-section"><h4>Method</h4><p>${esc(r.method||'')}</p></div>
    ${r.personal_notes ? '<div class="detail-section"><h4>My notes</h4><p>'+esc(r.personal_notes)+'</p></div>' : ''}
    ${r.source_url ? '<div class="detail-section"><h4>Source</h4><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.source_title||r.source_url)+'</a></p></div>' : ''}
    <div class="detail-actions"><button class="secondary" id="favBtn">${r.is_favourite?'★ Remove favourite':'☆ Add to favourites'}</button></div>`;
  detailDialog.showModal();
  document.querySelector('#favBtn').onclick = async () => {
    const {error}=await supabase.from('cc_recipes').update({is_favourite:!r.is_favourite}).eq('id',r.id);
    if(error) return alert(error.message); r.is_favourite=!r.is_favourite; detailDialog.close(); render();
  };
}

async function copyMenu(id) {
  const m = menus.find(x=>x.id===id); if(!m) return;
  const {data:{user}}=await supabase.auth.getUser(); if(!user) return;
  const {data,error}=await supabase.from('cc_menus').insert({name:m.name+' — Copy',menu_date:null,occasion:m.occasion,guest_count:m.guest_count,notes:m.notes,visibility:'private',created_by:user.id}).select().single();
  if(error) return alert(error.message);
  const items = await supabase.from('cc_menu_items').select('*').eq('menu_id',m.id).order('sort_order');
  if(items.error) return alert(items.error.message);
  if(items.data?.length) {
    const rows=items.data.map(x=>({menu_id:data.id,recipe_id:x.recipe_id,section:x.section,sort_order:x.sort_order,custom_label:x.custom_label}));
    const ins=await supabase.from('cc_menu_items').insert(rows); if(ins.error) return alert(ins.error.message);
  }
  await loadData();
  alert('Menu copied. You can now edit the new version without changing the original.');
}

loginForm.onsubmit = async e => {
  e.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  if (button?.disabled) return;
  const email=document.querySelector('#emailInput').value.trim();
  button.disabled = true;
  button.textContent = 'Sending…';
  loginMessage.textContent='Sending sign-in link…';
  const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});
  if (error) {
    const message = String(error.message || '').toLowerCase();
    loginMessage.textContent = message.includes('rate limit')
      ? 'Please wait about 60 seconds before requesting another sign-in link.'
      : 'We could not send the sign-in link right now. Please try again in a moment.';
    button.disabled = false;
    button.textContent = 'Send me a sign-in link';
  } else {
    loginMessage.textContent = 'Check your email for the sign-in link.';
  }
};

document.querySelector('#recipeForm').onsubmit = async e => {
  e.preventDefault();
  const f=new FormData(e.target), {data:{user}}=await supabase.auth.getUser();
  if(!user) return;
  const ingredients=String(f.get('ingredients')).split('\n').map(x=>x.trim()).filter(Boolean);
  const {error}=await supabase.from('cc_recipes').insert({
    name:f.get('name'), cuisine:f.get('cuisine')||null, course:f.get('course')||null,
    ingredients, method:f.get('method')||null, personal_notes:f.get('notes')||null,
    created_by:user.id, visibility:'private'
  });
  if(error) return alert(error.message);
  recipeDialog.close(); e.target.reset(); await loadData();
};

document.querySelector('#menuForm').onsubmit = async e => {
  e.preventDefault();
  const f=new FormData(e.target), {data:{user}}=await supabase.auth.getUser();
  if(!user) return;
  const {error}=await supabase.from('cc_menus').insert({
    name:f.get('name'), menu_date:f.get('date')||null, guest_count:f.get('guests')?Number(f.get('guests')):null,
    occasion:f.get('occasion')||null, notes:f.get('notes')||null, visibility:'private', created_by:user.id
  });
  if(error) return alert(error.message);
  menuDialog.close(); e.target.reset(); await loadData(); view='menus';
};

document.querySelector('#addRecipeBtn').onclick=()=>recipeDialog.showModal();
document.querySelector('#importBtn').onclick=()=>{importDialog.showModal();openImportReview();};
document.querySelector('#closeImport').onclick=()=>importDialog.close();
document.querySelector('#fileInput').onchange=e=>queueFiles([...e.target.files]);
document.querySelector('#addUrlBtn').onclick=()=>{const input=document.querySelector('#sourceUrl');const url=input.value.trim();if(!url)return;addImportItem({source_url:url,file_name:url.split('/').pop()||url,mime_type:'text/url'});input.value='';};
function addImportItem(item){item.localId=crypto.randomUUID();item.status='Queued';importItems.push(item);renderImportQueue();}
function queueFiles(files){files.forEach(file=>addImportItem({file,file_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size}));}
async function openImportReview(){
 const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
 const {data,error}=await supabase.from('cc_import_items').select('*').eq('created_by',user.id).order('created_at',{ascending:false}).limit(50);
 if(error)return alert(error.message);
 const rows=data||[];
 importQueue.innerHTML=(rows.length?'<div class="queue-head"><strong>Import Inbox</strong><span>'+rows.length+' items</span></div>':'<div class="empty compact">No imports yet.</div>')+
 rows.map(x=>'<article class="review-item"><div><strong>'+esc(x.file_name||x.source_url||'Import')+'</strong><small>'+esc(x.extraction_status||'pending')+' · '+esc(x.review_status||'pending')+'</small></div><button class="secondary review-btn" data-id="'+x.id+'">Review</button></article>').join('');
 importQueue.querySelectorAll('.review-btn').forEach(b=>b.onclick=()=>reviewImport(Number(b.dataset.id)));
}
async function reviewImport(id){
 const {data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single(); if(error)return alert(error.message);
 let recipe={name:x.file_name?.replace(/\.[^.]+$/,'')||'Imported recipe',ingredients:[],method:'',cuisine:x.inferred_cuisine||'',course:x.inferred_course||'',servings:''};
 if(x.extraction_status==='ready' && x.extracted_text){
   try{const j=JSON.parse(x.extracted_text);recipe={...recipe,name:j.name||recipe.name,ingredients:j.recipeIngredient||[],method:Array.isArray(j.recipeInstructions)?j.recipeInstructions.map(v=>typeof v==='string'?v:v.text||v.name||'').join('\n'):j.recipeInstructions||'',cuisine:j.recipeCuisine||recipe.cuisine,course:j.recipeCategory||recipe.course,servings:j.recipeYield||''};}catch{}
 }
 const ing=Array.isArray(recipe.ingredients)?recipe.ingredients.join('\n'):recipe.ingredients||'';
 detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" onclick="detailDialog.close()">×</button>
 <p class="eyebrow">REVIEW IMPORT</p><h2>Check the recipe before saving</h2>
 <form id="importReviewForm">
 <label>Recipe name<input name="name" required value="${esc(recipe.name)}"></label>
 <div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(recipe.cuisine)}"></label><label>Course<input name="course" value="${esc(recipe.course)}"></label></div>
 <label>Servings<input name="servings" value="${esc(recipe.servings)}"></label>
 <label>Ingredients<textarea name="ingredients" rows="8">${esc(ing)}</textarea></label>
 <label>Method<textarea name="method" rows="9">${esc(recipe.method)}</textarea></label>
 <div class="detail-actions"><button class="primary">Save to recipes</button></div>
 </form>`;
 detailDialog.showModal();
 document.querySelector('#importReviewForm').onsubmit=async e=>{
   e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return;
   const ingredients=String(f.get('ingredients')).split('\n').map(v=>v.trim()).filter(Boolean);
   const {data:r,error:re}=await supabase.from('cc_recipes').insert({name:f.get('name'),cuisine:f.get('cuisine')||null,course:f.get('course')||null,servings:f.get('servings')||null,ingredients,method:f.get('method')||null,source_type:x.source_url?'social':'file',source_url:x.source_url||null,source_title:x.source_title||x.file_name||null,created_by:user.id,visibility:'private'}).select().single();
   if(re)return alert(re.message);
   await supabase.from('cc_import_items').update({review_status:'approved',extraction_status:'ready'}).eq('id',id);
   detailDialog.close();await loadData();
 };
}

function renderImportQueue(){
 importQueue.innerHTML=importItems.length ? '<div class="queue-head"><strong>'+importItems.length+' selected</strong><button class="secondary" id="uploadAll">Upload all</button></div>'+importItems.map(x=>'<div class="queue-item"><div><strong>'+esc(x.file_name)+'</strong><small>'+esc(x.mime_type||'')+(x.size?' · '+Math.round(x.size/1024)+' KB':'')+'</small></div><span>'+esc(x.status)+'</span></div>').join('') : '<div class="empty compact">Select files or add a URL to begin.</div>';
 const b=document.querySelector('#uploadAll'); if(b)b.onclick=uploadAllImports;
}
async function uploadAllImports(){
 const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
 for(const item of importItems){
  if(item.status!=='Queued')continue;
  item.status='Uploading…';renderImportQueue();
  const importRow=await supabase.from('cc_imports').insert({source_type:item.source_url?'social_url':'file',source_url:item.source_url||null,original_file_path:null,created_by:user.id}).select().single();
  if(importRow.error){item.status='Failed';item.error=importRow.error.message;continue;}
  let path=null;
  if(item.file){
   path=user.id+'/'+Date.now()+'-'+item.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
   const up=await supabase.storage.from('cooking-confidential').upload('originals/'+path,item.file,{upsert:false});
   if(up.error){item.status='Failed';item.error=up.error.message;continue;}
  }
  const ins=await supabase.from('cc_import_items').insert({import_id:importRow.data.id,file_name:item.file_name,file_path:path?'originals/'+path:null,mime_type:item.mime_type,source_url:item.source_url||null,created_by:user.id}).select().single();
  if(!ins.error){ const itemId=ins.data?.id || ins.data?.[0]?.id; const fx=itemId?await supabase.functions.invoke('cc-import-extract',{body:{import_item_id:itemId}}):{error:null}; item.status=fx.error?'Uploaded — review pending':'Queued for extraction'; item.import_item_id=itemId; } else item.status='Failed';
  if(ins.error)item.error=ins.error.message;
  renderImportQueue();
 }
}

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');view=t.dataset.view;render()});
search.oninput=render;

async function boot() {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) { loginPanel.hidden=false; appPanel.hidden=true; return; }
  loginPanel.hidden=true; appPanel.hidden=false; userBadge.textContent=session.user.email||'Signed in';
  try { await loadData(); } catch(e) { content.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; }
}
supabase.auth.onAuthStateChange((_event,session)=>{ if(session) boot(); });
boot();
