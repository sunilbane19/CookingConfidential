import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd210ZmJxYnluaW1xdnd4b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI3MDYsImV4cCI6MjEwMzE1ODcwNn0.pwfoCI_ajYfrON8kxIV9XWMo9k2GvzCWqwcpsMxI1As';
const CC_SITE_BASE=(window.location.hostname.endsWith('github.io')?('/'+(window.location.pathname.split('/').filter(Boolean)[0]||'')+'/'):'/');
const APP_URL=`${window.location.origin}${CC_SITE_BASE}`;
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const content=document.querySelector('#content'),search=document.querySelector('#searchInput'),loginPanel=document.querySelector('#loginPanel'),appPanel=document.querySelector('#appPanel'),userBadge=document.querySelector('#userBadge'),loginForm=document.querySelector('#loginForm'),loginMessage=document.querySelector('#loginMessage'),recipeDialog=document.querySelector('#recipeDialog'),menuDialog=document.querySelector('#menuDialog'),detailDialog=document.querySelector('#detailDialog'),importDialog=document.querySelector('#importDialog'),importQueue=document.querySelector('#importQueue');
let importItems=[],recipes=[],menus=[],view='recipes';
const RECIPE_PAGE_SIZE=12;
const RECIPE_CARD_FIELDS='id,name,cuisine,country,region,course,recipe_type,rating,is_favourite,image_url,updated_at';
const RECIPE_DETAIL_FIELDS='id,name,description,cuisine,country,region,course,recipe_type,ingredients,method,personal_notes,rating,source_url,source_title,is_favourite,image_url,updated_at,servings,original_file_path,original_file_name,original_mime_type,source_type';
// Full recipe cache: fetch a recipe once when it is first opened during this session.
const recipeDetailCache=new Map();
let recipeOffset=0,recipeTotalCount=0,recipeLoading=false,recipeRequestId=0,searchTimer=null;
window.ccImportItems=importItems;
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const formatMenuDate=v=>{const s=String(v??'').trim();const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?m[3]+'-'+m[2]+'-'+m[1]:s};
const stars=n=>n?'★'.repeat(n):'';
const safeRichHtml=s=>{const raw=String(s??'');const doc=new DOMParser().parseFromString(`<div>${raw}</div>`,'text/html');const allowed=new Set(['B','STRONG','I','EM','U','UL','OL','LI','BR','P','DIV']);const cleanNode=node=>{if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');if(node.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');if(!allowed.has(node.tagName)){const f=document.createDocumentFragment();[...node.childNodes].forEach(x=>f.appendChild(cleanNode(x)));return f}const el=document.createElement(node.tagName.toLowerCase());[...node.childNodes].forEach(x=>el.appendChild(cleanNode(x)));return el};const out=document.createElement('div');[...(doc.body.firstElementChild?.childNodes||[])].forEach(x=>out.appendChild(cleanNode(x)));return out.innerHTML};
const ingredientsHtml=r=>{const a=r?.ingredients;if(a&&typeof a==='object'&&!Array.isArray(a)&&typeof a.html==='string')return safeRichHtml(a.html);if(Array.isArray(a))return a.map(x=>{const t=typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ');return esc(t)}).join('<br>');return esc(a||'')};
const ingredientsPlain=r=>{const a=r?.ingredients;if(a&&typeof a==='object'&&!Array.isArray(a)&&typeof a.html==='string')return a.html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(Array.isArray(a))return a.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join(' ');return String(a||'')};
function showUiError(message,title='Something went wrong',onClose=null){
 const raw=String(message||'Something went wrong'),lower=raw.toLowerCase();
 let heading=title,friendly=raw;
 if(lower.includes('cc_recipes_no_duplicate_names')||lower.includes('duplicate key value violates unique constraint')){
   heading='Recipe already saved';
   friendly='This recipe is already in your collection. Please use Edit on the recipe card to make changes.';
 }
 let errorDialog=document.querySelector('#ccErrorDialog');
 if(!errorDialog){
   errorDialog=document.createElement('dialog');
   errorDialog.id='ccErrorDialog';
   errorDialog.innerHTML='<div class="dialog-card error-card"><button class="close" type="button" aria-label="Close">×</button><p class="eyebrow">COOKING CONFIDENTIAL · ERROR</p><h2></h2><p class="error-message"></p><div class="detail-actions"><button class="primary" id="uiErrorClose">Close</button></div></div>';
   document.body.appendChild(errorDialog);
 }
 errorDialog.querySelector('h2').textContent=heading;
 errorDialog.querySelector('.error-message').textContent=friendly;
 const close=()=>{try{errorDialog.close()}catch{};if(typeof onClose==='function')onClose()};
 errorDialog.querySelector('.close').onclick=close;
 errorDialog.querySelector('#uiErrorClose').onclick=close;
 if(!errorDialog.open)errorDialog.showModal();
}
window.ccShowError=showUiError;
const cleanSearchTerm=value=>String(value||'').trim().replace(/\s+/g,' ').slice(0,80);
function menuSearchText(m){
  const parts=[m?.name,m?.occasion,m?.notes,m?.menu_date,m?.guest_count];
  const sources=[m?.document,m?.content];
  const seen=new Set();
  const addValue=value=>{
    if(value==null)return;
    if(typeof value==='string'){
      const s=value.trim();
      if(!s)return;
      try{
        const parsed=JSON.parse(s);
        if(parsed&&typeof parsed==='object')return addValue(parsed);
      }catch{}
      const holder=document.createElement('div');
      holder.innerHTML=s;
      const text=holder.textContent||holder.innerText||s;
      if(text.trim())parts.push(text);
      return;
    }
    if(Array.isArray(value)){value.forEach(addValue);return}
    if(typeof value==='object'){
      Object.entries(value).forEach(([key,val])=>{
        if(key==='version'||key==='type')return;
        addValue(val);
      });
    }
  };
  sources.forEach(addValue);
  return parts.filter(Boolean).map(x=>String(x)).join(' ').replace(/\s+/g,' ').trim().toLowerCase();
}
const menuMatchesSearch=(m,q)=>!q||menuSearchText(m).includes(q);

async function loadRecipePage({offset=0,refreshCount=true,silent=false}={}) {
  const requestId=++recipeRequestId;
  const q=cleanSearchTerm(search.value);
  const favouriteOnly=view==='favourites';
  const safeOffset=Math.max(0,Math.floor(Number(offset)||0));
  recipeOffset=safeOffset;
  recipeLoading=true;
  if(!silent)content.innerHTML='<div class="empty">Loading your recipes…</div>';
  try{
    const pageRequest=supabase.rpc('cc_search_recipe_cards',{
      p_search:q,
      p_favourite_only:favouriteOnly,
      p_offset:safeOffset,
      p_limit:RECIPE_PAGE_SIZE
    });
    const countRequest=refreshCount||recipeTotalCount===0
      ?supabase.rpc('cc_count_recipe_cards',{p_search:q,p_favourite_only:favouriteOnly})
      :Promise.resolve({data:recipeTotalCount,error:null});
    const [pageResult,countResult]=await Promise.all([pageRequest,countRequest]);
    if(requestId!==recipeRequestId)return;
    if(pageResult.error)throw new Error(pageResult.error.message);
    if(countResult.error)throw new Error(countResult.error.message);
    const rows=Array.isArray(pageResult.data)?pageResult.data:[];
    const rawCount=countResult.data;
    recipeTotalCount=Number(Array.isArray(rawCount)?rawCount[0]:rawCount)||0;
    recipes=rows;
    window.ccRecipes=recipes;
    if(!silent){render();window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));}
  }finally{
    if(requestId===recipeRequestId)recipeLoading=false;
  }
}

async function loadMenus(){
  try{
    const menuFields='id,name,menu_date,occasion,guest_count,notes,created_at,updated_at,menu_type,content,document,original_file_path,original_file_name,original_mime_type,is_favourite,status';
    const menusResult=await supabase.from('cc_menus').select(menuFields).or('status.is.null,status.eq.published').order('menu_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false});
    if(menusResult.error)throw new Error(menusResult.error.message);
    menus=menusResult.data||[];
  }catch(_){menus=[]}
}

async function loadData(){
  if(view==='menus'||view==='favourites')content.innerHTML='<div class="empty">Loading your library…</div>';
  else {const savedOffset=Number(sessionStorage.getItem('ccRecipeReturnOffset'));sessionStorage.removeItem('ccRecipeReturnOffset');await loadRecipePage({offset:Number.isFinite(savedOffset)&&savedOffset>=0?savedOffset:0,refreshCount:true});}
  await loadMenus();
  if(view==='menus')renderMenus(search.value.trim().toLowerCase());
  else if(view==='favourites')renderFavourites(search.value.trim().toLowerCase());
}
window.ccReloadRecipes=()=>loadRecipePage({offset:recipeOffset,refreshCount:true});window.ccRecipePageOffset=()=>recipeOffset;
function recipeCard(r){return `<article class="card" data-id="${r.id}"><div class="card-image" aria-hidden="true"></div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name)}</h3><div class="meta">${esc([r.course||'Recipe',r.recipe_type].filter(Boolean).join(' · '))} · ${stars(r.rating)}</div></div></article>`}
function recipePager(){
  const totalPages=Math.max(1,Math.ceil(recipeTotalCount/RECIPE_PAGE_SIZE));
  const page=Math.floor(recipeOffset/RECIPE_PAGE_SIZE)+1;
  const first=0;
  const prev=Math.max(0,(page-2)*RECIPE_PAGE_SIZE);
  const next=Math.min(Math.max(0,(totalPages-1)*RECIPE_PAGE_SIZE),recipeOffset+RECIPE_PAGE_SIZE);
  const last=Math.max(0,(totalPages-1)*RECIPE_PAGE_SIZE);
  const disabled=(condition)=>condition?' disabled':'';
  return `<nav class="recipe-pager" aria-label="Recipe pages">
    <div class="pager-actions">
      <button class="pager-btn pager-edge" data-page-offset="${first}"${disabled(page===1)}>« First</button>
      <button class="pager-btn" data-page-offset="${prev}"${disabled(page===1)}>‹ Previous</button>
    </div>
    <div class="pager-info">
      <span class="pager-count">${recipeTotalCount} <small>recipes</small></span>
      <span class="pager-page">Page ${page} <small>of ${totalPages}</small></span>
    </div>
    <div class="pager-actions">
      <button class="pager-btn" data-page-offset="${next}"${disabled(page===totalPages)}>Next ›</button>
      <button class="pager-btn pager-edge" data-page-offset="${last}"${disabled(page===totalPages)}>Last »</button>
    </div>
  </nav>`;
}
function wireRecipePager(){
  content.querySelectorAll('.pager-btn').forEach(btn=>btn.onclick=async()=>{
    if(btn.disabled||recipeLoading)return;
    const offset=Number(btn.dataset.pageOffset)||0;
    btn.disabled=true;
    try{await loadRecipePage({offset,refreshCount:false})}
    catch(e){showUiError(e.message,'Could not change recipe page')}
  });
}
function render(){
  if(view==='menus')return renderMenus(search.value.trim().toLowerCase());
  if(view==='favourites')return renderFavourites(search.value.trim().toLowerCase());
  const list=recipes; const pager=recipePager();
  content.innerHTML=`${pager}<div class="section-head"><h2>Your recipes</h2><span class="count">${list.length?recipeOffset+1+'–'+(recipeOffset+list.length):'0'} of ${recipeTotalCount}</span></div>${list.length?'<div class="grid">'+list.map(recipeCard).join('')+'</div>':'<div class="empty">No recipes found. Try another ingredient, cuisine or dish.</div>'}${pager}`;
  content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id)); wireRecipePager(); window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));
}
function favouriteMenuCard(m){return `<article class="menu-card"><span class="tag menu-date-only">${m.menu_date?formatMenuDate(m.menu_date):''}</span><h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div><div class="cc-menu-card-actions"><button class="secondary" data-menu-action="open" data-id="${m.id}">Edit</button><button class="secondary" data-menu-action="print" data-id="${m.id}">Print</button><button class="secondary" data-menu-action="share" data-id="${m.id}">Share</button><button class="secondary cc-favourite" data-active="1" data-menu-action="fav" data-id="${m.id}" aria-label="Unfavourite menu" title="Unfavourite menu">♥</button></div></article>`}
function renderFavourites(q=''){
  const menuMatches=menus.filter(m=>m.is_favourite&&menuMatchesSearch(m,q));
  const recipeSection=`<div class="section-head"><h2>Recipes</h2><span class="count">${recipeTotalCount} recipes</span></div>${recipes.length?'<div class="grid">'+recipes.map(recipeCard).join('')+'</div>':'<div class="empty">No favourite recipes.</div>'}`;
  const menuSection=`<div class="section-head cc-favourites-subhead"><h2>Menus</h2><span class="count">${menuMatches.length} menus</span></div>${menuMatches.length?'<div class="cc-menu-library-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start">'+menuMatches.map(favouriteMenuCard).join('')+'</div>':'<div class="empty">No favourite menus.</div>'}`;
  content.innerHTML=recipeSection+menuSection; content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id)); window.ccMenus=menuMatches; window.ccRenderMenus=()=>view==='favourites'?renderFavourites(search.value.trim().toLowerCase()):renderMenus(search.value.trim().toLowerCase()); setTimeout(()=>window.ccEnsureLibraryToolbar?.(),0); window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));
}
async function ccMenuAction(action){try{if(!window.ccMenuEditor){await import('./menu-editor.js?v=1.9.24')}const m=window.ccMenuEditor;if(!m||typeof m[action]!=='function')throw new Error('Menu editor action unavailable');m[action]()}catch(e){console.error('Cooking Confidential menu action:',e);window.ccShowError?.(e.message||'Could not open menu editor','Menu editor')}}
window.ccMenuAction=ccMenuAction;
function renderMenus(q){const list=menus.filter(m=>menuMatchesSearch(m,q));window.ccMenus=list;content.innerHTML=`<div class="section-head"><h2>Your menus</h2><span class="count">${list.length} menus</span></div><div class="cc-menu-library-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start">${list.length?list.map(m=>`<article class="menu-card"><span class="tag menu-date-only">${m.menu_date?formatMenuDate(m.menu_date):''}</span><h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div><div class="cc-menu-card-actions"><button class="secondary" data-menu-action="open" data-id="${m.id}">Edit</button><button class="secondary" data-menu-action="print" data-id="${m.id}">Print</button><button class="secondary" data-menu-action="share" data-id="${m.id}">Share</button><button class="secondary cc-favourite" data-active="${m.is_favourite?1:0}" data-menu-action="fav" data-id="${m.id}" aria-label="${m.is_favourite?'Unfavourite menu':'Favourite menu'}" title="${m.is_favourite?'Unfavourite menu':'Favourite menu'}">${m.is_favourite?'♥':'♡'}</button></div></article>`).join(''):'<div class="empty">No menus yet. Create a new menu or upload an existing one.</div>'}</div>`;
 window.ccRenderMenus=()=>renderMenus(search.value.trim().toLowerCase()); setTimeout(()=>window.ccEnsureLibraryToolbar?.(),0);
}
/* Contain iOS page scrolling at the top and bottom of the main site scroll surface. */
(()=>{const scroller=document.querySelector('main');if(!scroller)return;let lastY=0;scroller.addEventListener('touchstart',e=>{if(e.touches?.length)lastY=e.touches[0].clientY},{passive:true});scroller.addEventListener('touchmove',e=>{if(!e.touches?.length)return;const target=e.target?.closest?.('dialog,[contenteditable="true"],textarea,input,select');if(target)return;const y=e.touches[0].clientY,dy=y-lastY,atTop=scroller.scrollTop<=0,atBottom=scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2;if((atTop&&dy>0)||(atBottom&&dy<0))e.preventDefault();lastY=y},{passive:false})})();
window.ccReloadMenus=async()=>{await loadMenus();if(view==='menus')renderMenus(search.value.trim().toLowerCase())};
async function showRecipe(id){
  const recipeId=Number(id);
  detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="small-note">Loading recipe…</p></div>';
  detailDialog.showModal();
  let r=recipeDetailCache.get(recipeId);
  if(!r){
    const{data,error}=await supabase.from('cc_recipes').select(RECIPE_DETAIL_FIELDS).eq('id',recipeId).single();
    if(error||!data){
      detailDialog.close();
      return showUiError(error?.message||'Recipe could not be found.','Could not load recipe');
    }
    r=data;
    recipeDetailCache.set(recipeId,r);
  }
  window.ccCurrentRecipe=r;
  detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name)}</h2><div class="meta">${stars(r.rating)}</div>${r.description?'<div class="detail-section"><h4>Description</h4><div class="rich-display">'+safeRichHtml(r.description)+'</div></div>':''}<div class="detail-section"><h4>Ingredients</h4><div class="rich-display">${ingredientsHtml(r)||'—'}</div></div><div class="detail-section"><h4>Method</h4><div class="rich-display">${safeRichHtml(r.method||'')||'—'}</div></div>${r.personal_notes?'<div class="detail-section"><h4>My notes</h4><div class="rich-display">'+safeRichHtml(r.personal_notes)+'</div></div>':''}${r.source_url?'<div class="detail-section"><h4>Source</h4><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.source_title||r.source_url)+'</a></p></div>':''}<div class="detail-actions"><button class="secondary" id="favBtn">${r.is_favourite?'★ Remove favourite':'☆ Add to favourites'}</button></div>`;
  document.querySelector('#favBtn').onclick=async()=>{
    const next=!r.is_favourite;
    const{error}=await supabase.from('cc_recipes').update({is_favourite:next}).eq('id',r.id);
    if(error)return showUiError(error.message,'Could not update favourite');
    const card=recipes.find(x=>Number(x.id)===Number(r.id));
    if(card)card.is_favourite=next;
    r.is_favourite=next;
    recipeDetailCache.set(Number(r.id),r);
    detailDialog.close();
    if(view==='favourites'&&!next)recipes=recipes.filter(x=>Number(x.id)!==Number(r.id));
    window.ccRecipes=recipes;
    render();
  };
}
async function copyMenu(id){const m=menus.find(x=>x.id===id);if(!m)return;const{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const{data,error}=await supabase.from('cc_menus').insert({name:m.name+' — Copy',menu_date:null,occasion:m.occasion,guest_count:m.guest_count,notes:m.notes,visibility:'private',created_by:user.id}).select().single();if(error)return showUiError(error.message,'Could not copy menu');const items=await supabase.from('cc_menu_items').select('*').eq('menu_id',m.id).order('sort_order');if(items.error)return showUiError(items.error.message,'Could not copy menu items');if(items.data?.length){const rows=items.data.map(x=>({menu_id:data.id,recipe_id:x.recipe_id,section:x.section,sort_order:x.sort_order,custom_label:x.custom_label}));const ins=await supabase.from('cc_menu_items').insert(rows);if(ins.error)return showUiError(ins.error.message,'Could not copy menu items')}await loadData()}
loginForm.onsubmit=async e=>{e.preventDefault();const button=loginForm.querySelector('button');if(!button||button.disabled)return;const email=document.querySelector('#emailInput').value.trim();button.disabled=true;button.textContent='Sending…';loginMessage.textContent='Sending sign-in link…';const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:APP_URL}});if(error){const message=String(error.message||'').toLowerCase();loginMessage.textContent=message.includes('rate limit')?'Please wait about 60 seconds before requesting another sign-in link.':'We could not send the sign-in link right now. Please try again in a moment.';button.disabled=false;button.textContent='Send me a sign-in link'}else loginMessage.textContent='Check your email for the sign-in link.'};
document.querySelector('#recipeForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const ingredients=String(f.get('ingredients')).split('\n').map(x=>x.trim()).filter(Boolean);const{error}=await supabase.from('cc_recipes').insert({name:f.get('name'),cuisine:f.get('cuisine')||null,course:f.get('course')||null,ingredients,method:f.get('method')||null,personal_notes:f.get('notes')||null,created_by:user.id,visibility:'private'});if(error)return showUiError(error.message,'Could not save recipe');recipeDialog.close();e.target.reset();await loadData()};
document.querySelector('#menuForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const{error}=await supabase.from('cc_menus').insert({name:f.get('name'),menu_date:f.get('date')||null,guest_count:f.get('guests')?Number(f.get('guests')):null,occasion:f.get('occasion')||null,notes:f.get('notes')||null,visibility:'private',created_by:user.id});if(error)return showUiError(error.message,'Could not create menu');menuDialog.close();e.target.reset();await loadData();view='menus'};
document.querySelector('#addRecipeBtn').onclick=()=>recipeDialog.showModal();const closeRecipeDialog=()=>{recipeDialog.close();document.querySelector('#recipeForm').reset()};document.querySelector('#recipeForm .close').onclick=e=>{e.preventDefault();closeRecipeDialog()};document.querySelector('#recipeForm .dialog-actions button[value="cancel"]').onclick=e=>{e.preventDefault();closeRecipeDialog()};document.querySelector('#importBtn').onclick=()=>{importDialog.showModal();if(typeof window.ccOpenImportInbox==='function')window.ccOpenImportInbox();};document.querySelector('#closeImport').onclick=()=>importDialog.close();document.querySelector('#fileInput').onchange=e=>queueFiles([...e.target.files]);document.querySelector('#addUrlBtn').onclick=(e)=>{e.preventDefault();e.stopPropagation();const input=document.querySelector('#sourceUrl'),url=String(input?.value||'').trim();if(!url){input?.focus();return}addImportItem({source_url:url,file_name:url.split('/').pop()||url,mime_type:'text/url'});input.value='';if(typeof window.ccOpenImportInbox==='function')window.ccOpenImportInbox()};function addImportItem(item){item.localId=crypto.randomUUID();item.status='Queued';item.selected=false;importItems.push(item);window.ccImportItems=importItems;renderImportQueue()}function queueFiles(files){files.forEach(file=>addImportItem({file,file_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size}))}function renderImportQueue(){
 const queued=importItems.filter(x=>x.status==='Queued'),selected=queued.filter(x=>x.selected).length;
 importQueue.innerHTML=importItems.length?
 '<div class="queue-head"><label class="queue-select-all"><input id="selectAllImports" type="checkbox" '+(queued.length&&selected===queued.length?'checked':'')+' '+(!queued.length?'disabled':'')+'><span>Select all</span></label><button class="secondary" id="uploadAll" type="button" '+(!selected?'disabled':'')+'>Upload selected</button></div>'+
 importItems.map(x=>'<div class="queue-item"><label class="queue-select"><input class="import-select" type="checkbox" data-local-id="'+esc(x.localId||'')+'" '+(x.selected?'checked':'')+' '+(x.status!=='Queued'?'disabled':'')+'><span><strong>'+esc(x.file_name)+'</strong></span></label><span>'+esc(x.status)+(x.dbId?' · Item ID '+esc(x.dbId):'')+'</span>'+(x.status==='Uploaded'&&x.dbId?'<button type="button" class="secondary cc-local-review" data-db-id="'+esc(x.dbId)+'" data-image="'+(String(x.mime_type||'').startsWith('image/')?'1':'0')+'" data-docx="'+(/\.docx$/i.test(x.file_name||'')?'1':'0')+'">Review</button>':'')+'</div>').join(''):
 '<div class="empty compact">Select files or add a URL to begin.</div>';
 const selectAll=document.querySelector('#selectAllImports');
 if(selectAll)selectAll.onchange=()=>{queued.forEach(x=>x.selected=selectAll.checked);renderImportQueue()};importQueue.querySelectorAll('.cc-local-review').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.dbId);if(b.dataset.docx==='1'&&typeof window.ccReviewImportDocx==='function')return window.ccReviewImportDocx(id);if(typeof window.ccReviewImportItem==='function')return window.ccReviewImportItem(id,b.dataset.image==='1')});
 importQueue.querySelectorAll('.import-select').forEach(cb=>cb.onchange=()=>{const x=importItems.find(i=>i.localId===cb.dataset.localId);if(x)x.selected=cb.checked;renderImportQueue()});
}window.addEventListener('cc:import-queue-changed',()=>render());
search.oninput=()=>{
  if(view==='menus'||view==='favourites'){
    if(view==='menus')renderMenus(search.value.trim().toLowerCase());
    else loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not search favourites'));
    return;
  }
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not search recipes')),250);
};
document.querySelectorAll('.tab').forEach(t=>t.onclick=async()=>{
  view=t.dataset.view;
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
  if(view==='menus'){renderMenus(search.value.trim().toLowerCase());return}
  if(view==='favourites'){
    try{await Promise.all([loadRecipePage({offset:0,refreshCount:true,silent:true}),loadMenus()]);renderFavourites(search.value.trim().toLowerCase())}
    catch(e){showUiError(e.message,'Could not load favourites')}
    return;
  }
  loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not load recipes'));
});
let bootedUserId=null,currentMember=null;
async function boot(sessionOverride=null){
  let session=sessionOverride;
  if(!session){
    const{data:{session:currentSession}}=await supabase.auth.getSession();
    session=currentSession
  }
  if(!session){
    bootedUserId=null;
    currentMember=null;
    loginPanel.hidden=false;
    appPanel.hidden=true;
    const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}
    return
  }
  if(bootedUserId===session.user.id)return;
  bootedUserId=session.user.id;
  const{data:member,error:memberError}=await supabase.from('cc_members').select('id,email,display_name,role,active').eq('auth_user_id',session.user.id).maybeSingle();
  if(memberError||!member||!member.active){
    bootedUserId=null;
    currentMember=null;
    appPanel.hidden=true;
    loginPanel.hidden=false;
    loginMessage.textContent='This email is not currently enabled for Cooking Confidential.';
    const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}
    await supabase.auth.signOut();
    return
  }
  currentMember=member;
  loginPanel.hidden=true;
  appPanel.hidden=false;
  userBadge.textContent=member.display_name||session.user.email||'Signed in';
  userBadge.hidden=false;
  const adminLink=document.querySelector('#adminLink');
  if(adminLink){adminLink.hidden=member.role!=='owner';adminLink.style.display=member.role==='owner'?'inline-flex':'none'}
  try{await loadData()}catch(e){content.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
supabase.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(()=>boot(session),0);else{bootedUserId=null;currentMember=null;loginPanel.hidden=false;appPanel.hidden=true;const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}}});boot();
