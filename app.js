import { getDietaryIconData, renderDietaryBadges } from './dietary-icons.js?v=1.0.1';
import { supabase, APP_URL } from './auth-client.js?v=1.0.2';
const content=document.querySelector('#content'),search=document.querySelector('#searchInput'),loginPanel=document.querySelector('#loginPanel'),appPanel=document.querySelector('#appPanel'),userBadge=document.querySelector('#userBadge'),loginForm=document.querySelector('#loginForm'),loginMessage=document.querySelector('#loginMessage'),recipeDialog=document.querySelector('#recipeDialog'),menuDialog=document.querySelector('#menuDialog'),detailDialog=document.querySelector('#detailDialog'),importDialog=document.querySelector('#importDialog'),importQueue=document.querySelector('#importQueue');
let importItems=[],recipes=[],menus=[],view='all';
let saladRecipes=[],saladOffset=0,saladTotalCount=0,saladCuisine='',saladType='all',saladLoading=false,saladRequestId=0;
let starterRecipes=[],starterOffset=0,starterTotalCount=0,starterCuisine='',starterLoading=false,starterRequestId=0;
const categoryPageState={chutney:{recipes:[],offset:0,total:0,cuisine:'',loading:false,requestId:0,title:'Chutney/Dips',aria:'Chutney and Dips',filter:'recipe_type.ilike.%Chutney%,recipe_type.ilike.%Condiment%,recipe_type.ilike.%Dip%,course.ilike.%Chutney%,course.ilike.%Condiment%,course.ilike.%Dip%'},marinade:{recipes:[],offset:0,total:0,cuisine:'',loading:false,requestId:0,title:'Marinade/Rub',aria:'Marinade and Rub',filter:'recipe_type.ilike.%Marinade%,recipe_type.ilike.%Paste%,recipe_type.ilike.%Pickle%,recipe_type.ilike.%Rub%,recipe_type.ilike.%Spice Blend%,course.ilike.%Marinade%,course.ilike.%Paste%,course.ilike.%Pickle%,course.ilike.%Rub%,course.ilike.%Spice Blend%'}};
try{const returnView=sessionStorage.getItem('ccRecipeReturnView');if(['all','recipes','salads','starters','chutney','marinade','menus','favourites'].includes(returnView)){view=returnView;sessionStorage.removeItem('ccRecipeReturnView');}}catch{}
document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
const RECIPE_PAGE_SIZE=12;
const RECIPE_CARD_FIELDS='id,name,cuisine,country,region,course,recipe_type,rating,is_favourite,image_url,updated_at';
const SALAD_CARD_FIELDS='id,name,cuisine,country,region,course,recipe_type,rating,is_favourite,image_url,updated_at,created_at,created_by,dietary_tags,diet,free_from,lifestyle';
const RECIPE_DETAIL_FIELDS='id,name,description,cuisine,country,region,course,recipe_type,ingredients,method,personal_notes,rating,source_url,source_title,is_favourite,image_url,updated_at,servings,original_file_path,original_file_name,original_mime_type,source_type,created_by,dietary_tags,diet,free_from,lifestyle';
// Full recipe cache: fetch a recipe once when it is first opened during this session.
const recipeDetailCache=new Map(),creatorNameCache=new Map();
let recipeOffset=0,recipeTotalCount=0,recipeLoading=false,recipeRequestId=0,searchTimer=null;
let libraryFilter=(()=>{try{return JSON.parse(sessionStorage.getItem('ccLibraryFilterState')||'{"field":"","value":""}')}catch{return{field:'',value:''}}})();
try{if(search&&sessionStorage.getItem('ccLibrarySearchState')!==null)search.value=sessionStorage.getItem('ccLibrarySearchState')}catch{}
window.ccImportItems=importItems;
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const formatMenuDate=v=>{const s=String(v??'').trim();const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?m[3]+'-'+m[2]+'-'+m[1]:s};
const stars=n=>n?'★'.repeat(n):'';
const safeRichHtml=s=>{const raw=String(s??'');const doc=new DOMParser().parseFromString(`<div>${raw}</div>`,'text/html');const allowed=new Set(['A','B','STRONG','I','EM','U','UL','OL','LI','BR','P','DIV']);const cleanNode=node=>{if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');if(node.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');if(!allowed.has(node.tagName)){const f=document.createDocumentFragment();[...node.childNodes].forEach(x=>f.appendChild(cleanNode(x)));return f}const el=document.createElement(node.tagName.toLowerCase());if(node.tagName==='A'){const href=node.getAttribute('href')||'';if(!/^#recipe-\d+$/.test(href)){const f=document.createDocumentFragment();[...node.childNodes].forEach(x=>f.appendChild(cleanNode(x)));return f}el.setAttribute('href',href);el.setAttribute('data-recipe-id',href.slice(8))}[...node.childNodes].forEach(x=>el.appendChild(cleanNode(x)));return el};const out=document.createElement('div');[...(doc.body.firstElementChild?.childNodes||[])].forEach(x=>out.appendChild(cleanNode(x)));return out.innerHTML};
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
 const close=()=>{if(window.ccImportReviewActive){try{document.querySelector('#detailDialog')?.close()}catch{};try{document.querySelector('#importDialog')?.close()}catch{};window.ccImportReviewActive=false;window.ccReturnToImportInbox=false;}try{errorDialog.close()}catch{};if(typeof onClose==='function')onClose()};
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
  const favouriteOnly=view==='favourites'||libraryFilter.field==='favourite';
  const safeOffset=Math.max(0,Math.floor(Number(offset)||0));
  recipeOffset=safeOffset;
  recipeLoading=true;
  if(!silent)content.innerHTML='<div class="empty">Loading your recipes…</div>';
  try{
    const pageRequest=supabase.rpc('cc_search_recipe_cards_filtered_staging',{
      p_search:q,
      p_favourite_only:favouriteOnly,
      p_offset:safeOffset,
      p_limit:RECIPE_PAGE_SIZE,
      p_filter_field:libraryFilter.field==='favourite'?'':libraryFilter.field,
      p_filter_value:libraryFilter.field==='favourite'?'':libraryFilter.value
    });
    const countRequest=refreshCount||recipeTotalCount===0
      ?supabase.rpc('cc_count_recipe_cards_filtered_staging',{p_search:q,p_favourite_only:favouriteOnly,p_filter_field:libraryFilter.field==='favourite'?'':libraryFilter.field,p_filter_value:libraryFilter.field==='favourite'?'':libraryFilter.value})
      :Promise.resolve({data:recipeTotalCount,error:null});
    const [pageResult,countResult]=await Promise.all([pageRequest,countRequest]);
    if(requestId!==recipeRequestId)return;
    if(pageResult.error)throw new Error(pageResult.error.message);
    if(countResult.error)throw new Error(countResult.error.message);
    const rows=Array.isArray(pageResult.data)?pageResult.data:[];
    const rawCount=countResult.data;
    recipeTotalCount=Number(Array.isArray(rawCount)?rawCount[0]:rawCount)||0;
    const creatorIds=[...new Set(rows.map(r=>r.created_by).filter(Boolean))];
    const missingCreatorIds=creatorIds.filter(id=>!creatorNameCache.has(id));
    if(missingCreatorIds.length){const members=await supabase.from('cc_members').select('auth_user_id,display_name').in('auth_user_id',missingCreatorIds);if(!members.error){const found=new Map((members.data||[]).map(m=>[m.auth_user_id,m.display_name||'']));missingCreatorIds.forEach(id=>creatorNameCache.set(id,found.get(id)||''));}}
    recipes=rows.map(r=>({...r,creator_name:creatorNameCache.get(r.created_by)||''}));
    window.ccRecipes=recipes;
    if(!silent){render();window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));}
  }finally{
    if(requestId===recipeRequestId)recipeLoading=false;
  }
}

async function loadSaladPage({offset=0}={}) {
  const requestId=++saladRequestId;
  const q=String(search.value||'').trim();
  const safeOffset=Math.max(0,Math.floor(Number(offset)||0));
  saladOffset=safeOffset;saladLoading=true;
  content.innerHTML='<div class="empty">Loading soups, salads and dressings…</div>';
  try{
    let base=supabase.from('cc_recipes').select(SALAD_CARD_FIELDS,{count:'exact'});
    if(saladType==='soups')base=base.or('course.ilike.Soup,recipe_type.ilike.Soup');
    else if(saladType==='salads')base=base.ilike('course','%Salad%');
    else if(saladType==='dressings')base=base.ilike('recipe_type','%Dressing%');
    else base=base.or('course.ilike.Salad,recipe_type.ilike.Dressing,course.ilike.Soup,recipe_type.ilike.Soup');
    if(saladCuisine)base=base.eq('cuisine',saladCuisine);
    if(q)base=base.ilike('name','%'+q.replace(/[,%()]/g,' ')+'%');
    const pageResult=await base.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(safeOffset,safeOffset+RECIPE_PAGE_SIZE-1);
    if(requestId!==saladRequestId)return;
    if(pageResult.error)throw new Error(pageResult.error.message);
    const rows=Array.isArray(pageResult.data)?pageResult.data:[];
    saladTotalCount=Number(pageResult.count)||0;
    const creatorIds=[...new Set(rows.map(r=>r.created_by).filter(Boolean))];
    const missingCreatorIds=creatorIds.filter(id=>!creatorNameCache.has(id));
    if(missingCreatorIds.length){const members=await supabase.from('cc_members').select('auth_user_id,display_name').in('auth_user_id',missingCreatorIds);if(!members.error){const found=new Map((members.data||[]).map(m=>[m.auth_user_id,m.display_name||'']));missingCreatorIds.forEach(id=>creatorNameCache.set(id,found.get(id)||''));}}
    saladRecipes=rows.map(r=>({...r,creator_name:creatorNameCache.get(r.created_by)||''}));
    window.ccSaladRecipes=saladRecipes;window.ccRecipes=saladRecipes;
    if(requestId===saladRequestId)renderSalads();
  }finally{if(requestId===saladRequestId)saladLoading=false}
}
async function loadSaladCuisineOptions(){
  const result=await supabase.from('cc_recipes').select('cuisine').not('cuisine','is',null)
    .or('course.ilike.Salad,recipe_type.ilike.Dressing,course.ilike.Soup,recipe_type.ilike.Soup').limit(1000);
  if(result.error)throw new Error(result.error.message);
  const values=[...new Set((result.data||[]).map(r=>String(r.cuisine||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  return values;
}
function saladPager(){
  const pages=Math.max(1,Math.ceil(saladTotalCount/RECIPE_PAGE_SIZE)),page=Math.floor(saladOffset/RECIPE_PAGE_SIZE)+1;
  const prev=Math.max(0,(page-2)*RECIPE_PAGE_SIZE),next=Math.min((pages-1)*RECIPE_PAGE_SIZE,saladOffset+RECIPE_PAGE_SIZE),last=Math.max(0,(pages-1)*RECIPE_PAGE_SIZE);
  return `<nav class="recipe-pager" aria-label="Soups and Salads pages"><div class="pager-actions"><button class="pager-btn pager-edge" data-salad-offset="0"${page===1?' disabled':''}>« First</button><button class="pager-btn" data-salad-offset="${prev}"${page===1?' disabled':''}>‹ Previous</button></div><div class="pager-info"><span class="pager-count">${saladTotalCount} <small>recipes</small></span><span class="pager-page">Page ${page} <small>of ${pages}</small></span></div><div class="pager-actions"><button class="pager-btn" data-salad-offset="${next}"${page===pages?' disabled':''}>Next ›</button><button class="pager-btn pager-edge" data-salad-offset="${last}"${page===pages?' disabled':''}>Last »</button></div></nav>`;
}
function renderSalads(){
  const options=window.ccSaladCuisineOptions||[];
  content.innerHTML=`<div class="cc-salad-toolbar"><label for="ccSaladType">Filter by Type<select id="ccSaladType"><option value="all"${saladType==='all'?' selected':''}>Soups, Salads &amp; Dressings</option><option value="soups"${saladType==='soups'?' selected':''}>Soups</option><option value="salads"${saladType==='salads'?' selected':''}>Salads</option><option value="dressings"${saladType==='dressings'?' selected':''}>Dressings</option></select></label><label for="ccSaladCuisine">Filter by Cuisine<select id="ccSaladCuisine"><option value="">All cuisines</option>${options.map(v=>'<option value="'+esc(v)+'"'+(v===saladCuisine?' selected':'')+'>'+esc(v)+'</option>').join('')}</select></label></div>${saladPager()}<div class="section-head"><h2>Soups &amp; Salads</h2><span class="count">${saladRecipes.length?saladOffset+1+'–'+(saladOffset+saladRecipes.length):'0'} of ${saladTotalCount}</span></div>${saladRecipes.length?'<div class="grid">'+saladRecipes.map(recipeCard).join('')+'</div>':'<div class="empty">No soups, salads or dressings found for this cuisine.</div>'}${saladPager()}`;
  const typeSelect=content.querySelector('#ccSaladType');if(typeSelect)typeSelect.onchange=()=>{saladType=typeSelect.value;loadSaladPage({offset:0}).catch(e=>showUiError(e.message,'Could not filter soups and salads'))};
  const select=content.querySelector('#ccSaladCuisine');if(select)select.onchange=()=>{saladCuisine=select.value;loadSaladPage({offset:0}).catch(e=>showUiError(e.message,'Could not filter soups and salads'))};
  content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));
  content.querySelectorAll('[data-salad-offset]').forEach(btn=>btn.onclick=()=>{if(!btn.disabled&&!saladLoading)loadSaladPage({offset:Number(btn.dataset.saladOffset)||0}).catch(e=>showUiError(e.message,'Could not change salads page'))});
  window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));

}
async function loadStarterPage({offset=0}={}){
 const requestId=++starterRequestId,q=String(search.value||'').trim(),safeOffset=Math.max(0,Math.floor(Number(offset)||0));
 starterOffset=safeOffset;starterLoading=true;content.innerHTML='<div class="empty">Loading starters…</div>';
 try{
  let base=supabase.from('cc_recipes').select(SALAD_CARD_FIELDS,{count:'exact'}).ilike('course','%Starter%');
  if(starterCuisine)base=base.eq('cuisine',starterCuisine);
  if(q)base=base.ilike('name','%'+q.replace(/[,%()]/g,' ')+'%');
  const result=await base.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(safeOffset,safeOffset+RECIPE_PAGE_SIZE-1);
  if(requestId!==starterRequestId)return;if(result.error)throw new Error(result.error.message);
  const rows=Array.isArray(result.data)?result.data:[];starterTotalCount=Number(result.count)||0;
  const ids=[...new Set(rows.map(r=>r.created_by).filter(Boolean))],missing=ids.filter(id=>!creatorNameCache.has(id));
  if(missing.length){const members=await supabase.from('cc_members').select('auth_user_id,display_name').in('auth_user_id',missing);if(!members.error){const names=new Map((members.data||[]).map(m=>[m.auth_user_id,m.display_name||'']));missing.forEach(id=>creatorNameCache.set(id,names.get(id)||''));}}
  starterRecipes=rows.map(r=>({...r,creator_name:creatorNameCache.get(r.created_by)||''}));window.ccStarterRecipes=starterRecipes;window.ccRecipes=starterRecipes;
  if(requestId===starterRequestId)renderStarters();
 }finally{if(requestId===starterRequestId)starterLoading=false}
}
async function loadStarterCuisineOptions(){
 const result=await supabase.from('cc_recipes').select('cuisine').not('cuisine','is',null).ilike('course','%Starter%').limit(1000);
 if(result.error)throw new Error(result.error.message);
 return [...new Set((result.data||[]).map(r=>String(r.cuisine||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
function starterPager(){
 const pages=Math.max(1,Math.ceil(starterTotalCount/RECIPE_PAGE_SIZE)),page=Math.floor(starterOffset/RECIPE_PAGE_SIZE)+1,prev=Math.max(0,(page-2)*RECIPE_PAGE_SIZE),next=Math.min((pages-1)*RECIPE_PAGE_SIZE,starterOffset+RECIPE_PAGE_SIZE),last=Math.max(0,(pages-1)*RECIPE_PAGE_SIZE);
 return `<nav class="recipe-pager" aria-label="Starters pages"><div class="pager-actions"><button class="pager-btn pager-edge" data-starter-offset="0"${page===1?' disabled':''}>« First</button><button class="pager-btn" data-starter-offset="${prev}"${page===1?' disabled':''}>‹ Previous</button></div><div class="pager-info"><span class="pager-count">${starterTotalCount} <small>recipes</small></span><span class="pager-page">Page ${page} <small>of ${pages}</small></span></div><div class="pager-actions"><button class="pager-btn" data-starter-offset="${next}"${page===pages?' disabled':''}>Next ›</button><button class="pager-btn pager-edge" data-starter-offset="${last}"${page===pages?' disabled':''}>Last »</button></div></nav>`;
}
function renderStarters(){
 const options=window.ccStarterCuisineOptions||[];
 content.innerHTML=`<div class="cc-salad-toolbar cc-starter-toolbar"><label for="ccStarterCuisine">Filter by Cuisine<select id="ccStarterCuisine"><option value="">All cuisines</option>${options.map(v=>'<option value="'+esc(v)+'"'+(v===starterCuisine?' selected':'')+'>'+esc(v)+'</option>').join('')}</select></label></div>${starterPager()}<div class="section-head"><h2>Starters</h2><span class="count">${starterRecipes.length?starterOffset+1+'–'+(starterOffset+starterRecipes.length):'0'} of ${starterTotalCount}</span></div>${starterRecipes.length?'<div class="grid">'+starterRecipes.map(recipeCard).join('')+'</div>':'<div class="empty">No starters found for this cuisine.'}</div>'}${starterPager()}`;
 const select=content.querySelector('#ccStarterCuisine');if(select)select.onchange=()=>{starterCuisine=select.value;loadStarterPage({offset:0}).catch(e=>showUiError(e.message,'Could not filter starters'))};
 content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));
 content.querySelectorAll('[data-starter-offset]').forEach(btn=>btn.onclick=()=>{if(!btn.disabled&&!starterLoading)loadStarterPage({offset:Number(btn.dataset.starterOffset)||0}).catch(e=>showUiError(e.message,'Could not change starters page'))});
 window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));
}

async function loadCategoryCuisineOptions(key){
 const cfg=categoryPageState[key];
 const result=await supabase.from('cc_recipes').select('cuisine').not('cuisine','is',null).or(cfg.filter).limit(1000);
 if(result.error)throw new Error(result.error.message);
 return [...new Set((result.data||[]).map(r=>String(r.cuisine||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
async function loadCategoryPage(key,{offset=0}={}){
 const state=categoryPageState[key],requestId=++state.requestId,q=String(search.value||'').trim(),safeOffset=Math.max(0,Math.floor(Number(offset)||0));
 state.offset=safeOffset;state.loading=true;content.innerHTML='<div class="empty">Loading '+esc(state.title)+'…</div>';
 try{
  let base=supabase.from('cc_recipes').select(SALAD_CARD_FIELDS,{count:'exact'}).or(state.filter);
  if(state.cuisine)base=base.eq('cuisine',state.cuisine);
  if(q)base=base.ilike('name','%'+q.replace(/[,%()]/g,' ')+'%');
  const result=await base.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(safeOffset,safeOffset+RECIPE_PAGE_SIZE-1);
  if(requestId!==state.requestId)return;if(result.error)throw new Error(result.error.message);
  const rows=Array.isArray(result.data)?result.data:[];state.total=Number(result.count)||0;
  const ids=[...new Set(rows.map(r=>r.created_by).filter(Boolean))],missing=ids.filter(id=>!creatorNameCache.has(id));
  if(missing.length){const members=await supabase.from('cc_members').select('auth_user_id,display_name').in('auth_user_id',missing);if(!members.error){const names=new Map((members.data||[]).map(m=>[m.auth_user_id,m.display_name||'']));missing.forEach(id=>creatorNameCache.set(id,names.get(id)||''));}}
  state.recipes=rows.map(r=>({...r,creator_name:creatorNameCache.get(r.created_by)||''}));window.ccRecipes=state.recipes;
  if(requestId===state.requestId)renderCategoryPage(key);
 }finally{if(requestId===state.requestId)state.loading=false}
}
function renderCategoryPage(key){
 const state=categoryPageState[key],options=window['cc'+key[0].toUpperCase()+key.slice(1)+'CuisineOptions']||[];
 const pages=Math.max(1,Math.ceil(state.total/RECIPE_PAGE_SIZE)),page=Math.floor(state.offset/RECIPE_PAGE_SIZE)+1,prev=Math.max(0,(page-2)*RECIPE_PAGE_SIZE),next=Math.min((pages-1)*RECIPE_PAGE_SIZE,state.offset+RECIPE_PAGE_SIZE),last=Math.max(0,(pages-1)*RECIPE_PAGE_SIZE);
 const pager='<nav class="recipe-pager" aria-label="'+esc(state.aria)+' pages"><div class="pager-actions"><button class="pager-btn pager-edge" data-cat-offset="0"'+(page===1?' disabled':'')+'>« First</button><button class="pager-btn" data-cat-offset="'+prev+'"'+(page===1?' disabled':'')+'>‹ Previous</button></div><div class="pager-info"><span class="pager-count">'+state.total+' <small>recipes</small></span><span class="pager-page">Page '+page+' <small>of '+pages+'</small></span></div><div class="pager-actions"><button class="pager-btn" data-cat-offset="'+next+'"'+(page===pages?' disabled':'')+'>Next ›</button><button class="pager-btn pager-edge" data-cat-offset="'+last+'"'+(page===pages?' disabled':'')+'>Last »</button></div></nav>';
 content.innerHTML='<div class="cc-salad-toolbar cc-starter-toolbar"><label for="ccCategoryCuisine">Filter by Cuisine<select id="ccCategoryCuisine"><option value="">All cuisines</option>'+options.map(v=>'<option value="'+esc(v)+'"'+(v===state.cuisine?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label></div>'+pager+'<div class="section-head"><h2>'+esc(state.title)+'</h2><span class="count">'+(state.recipes.length?state.offset+1+'–'+(state.offset+state.recipes.length):'0')+' of '+state.total+'</span></div>'+(state.recipes.length?'<div class="grid">'+state.recipes.map(recipeCard).join('')+'</div>':'<div class="empty">No recipes found for this section.</div>')+pager;
 const select=content.querySelector('#ccCategoryCuisine');if(select)select.onchange=()=>{state.cuisine=select.value;loadCategoryPage(key,{offset:0}).catch(e=>showUiError(e.message,'Could not filter '+state.title))};
 content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));
 content.querySelectorAll('[data-cat-offset]').forEach(btn=>btn.onclick=()=>{if(!btn.disabled&&!state.loading)loadCategoryPage(key,{offset:Number(btn.dataset.catOffset)||0}).catch(e=>showUiError(e.message,'Could not change page'))});
 window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));
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
  if(view==='salads'){window.ccSaladCuisineOptions=await loadSaladCuisineOptions();await loadSaladPage({offset:0});await loadMenus();return}
  if(view==='chutney'||view==='marinade'){await loadCategoryPage(view,{offset:0});await loadMenus();return}
  if(view==='starters'){window.ccStarterCuisineOptions=await loadStarterCuisineOptions();await loadStarterPage({offset:0});await loadMenus();return}
  if(view==='menus'||view==='favourites')content.innerHTML='<div class="empty">Loading your library…</div>';
  else {const savedOffset=Number(sessionStorage.getItem('ccRecipeReturnOffset'));sessionStorage.removeItem('ccRecipeReturnOffset');await loadRecipePage({offset:Number.isFinite(savedOffset)&&savedOffset>=0?savedOffset:0,refreshCount:true});}
  await loadMenus();
  if(view==='menus')renderMenus(search.value.trim().toLowerCase());
  else if(view==='favourites')renderFavourites(search.value.trim().toLowerCase());
  else if(view==='all')renderAll(search.value.trim().toLowerCase());
}
window.ccReloadRecipes=()=>loadRecipePage({offset:recipeOffset,refreshCount:true});window.ccRecipePageOffset=()=>recipeOffset;
window.ccSetLibraryFilter=(field,value)=>{libraryFilter={field:String(field||''),value:String(value||'')};try{sessionStorage.setItem('ccLibraryFilterState',JSON.stringify(libraryFilter))}catch{}loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not filter recipes'));};
window.addEventListener('cc:library-filter-change',e=>window.ccSetLibraryFilter(e.detail?.field,e.detail?.value));
function classificationTags(r){const groups=['diet','free_from','lifestyle'];const values=groups.flatMap(key=>Array.isArray(r?.[key])?r[key]:[]);return values.length?values:(Array.isArray(r?.dietary_tags)?r.dietary_tags:[])}
function recipeCard(r){const tags=classificationTags(r);return `<article class="card" data-id="${r.id}"><div class="card-image" aria-hidden="true"></div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name)}</h3><div class="meta">${esc([r.course||'Recipe',r.recipe_type].filter(Boolean).join(' · '))} · ${stars(r.rating)}</div>${renderDietaryBadges(tags,'cc-dietary-badges cc-card-dietary')}<div class="created-by">Added by: <strong>${esc(r.creator_name||'')}</strong></div></div></article>`}
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
  if(view==='salads')return renderSalads();
  if(view==='chutney'||view==='marinade')return renderCategoryPage(view);
  if(view==='menus')return renderMenus(search.value.trim().toLowerCase());
  if(view==='all')return renderAll(search.value.trim().toLowerCase());
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
async function ccMenuAction(action){try{if(!window.ccMenuEditor){await import('./menu-editor.js?v=1.9.38')}const m=window.ccMenuEditor;if(!m||typeof m[action]!=='function')throw new Error('Menu editor action unavailable');m[action]()}catch(e){console.error('Cooking Confidential menu action:',e);window.ccShowError?.(e.message||'Could not open menu editor','Menu editor')}}
window.ccMenuAction=ccMenuAction;
function renderAll(q=''){
  const menuMatches=menus.filter(m=>menuMatchesSearch(m,q));
  const recipePagerHtml=recipePager();
  const recipeSection=`<div class="cc-all-section"><div class="section-head"><h2>Recipes</h2><span class="count">${recipes.length?recipeOffset+1+'–'+(recipeOffset+recipes.length):'0'} of ${recipeTotalCount}</span></div>${recipes.length?'<div class="grid">'+recipes.map(recipeCard).join('')+'</div>':'<div class="empty">No matching recipes.</div>'}${recipePagerHtml}</div>`;
  const menuSection=`<div class="cc-all-section"><div class="section-head"><h2>Menus</h2><span class="count">${menuMatches.length} menus</span></div>${menuMatches.length?'<div class="cc-menu-library-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start">'+menuMatches.map(m=>`<article class="menu-card"><span class="tag menu-date-only">${m.menu_date?formatMenuDate(m.menu_date):''}</span><h3>${esc(m.name)}</h3><div class="menu-items">${esc(m.occasion||'')}</div><div class="cc-menu-card-actions"><button class="secondary" data-menu-action="open" data-id="${m.id}">Edit</button><button class="secondary" data-menu-action="print" data-id="${m.id}">Print</button><button class="secondary" data-menu-action="share" data-id="${m.id}">Share</button><button class="secondary cc-favourite" data-active="${m.is_favourite?1:0}" data-menu-action="fav" data-id="${m.id}" aria-label="${m.is_favourite?'Unfavourite menu':'Favourite menu'}" title="${m.is_favourite?'Unfavourite menu':'Favourite menu'}">${m.is_favourite?'♥':'♡'}</button></div></article>`).join('')+'</div>':'<div class="empty">No matching menus.</div>'}</div>`;
  content.innerHTML=recipeSection+menuSection;
  content.querySelectorAll('.card').forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));
  wireRecipePager();
  window.ccMenus=menuMatches;
  window.ccRenderMenus=()=>view==='favourites'?renderFavourites(search.value.trim().toLowerCase()):view==='all'?renderAll(search.value.trim().toLowerCase()):renderMenus(search.value.trim().toLowerCase());
  setTimeout(()=>window.ccEnsureLibraryToolbar?.(),0);
  window.dispatchEvent(new CustomEvent('cc:recipes-rendered'));
}
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
  let creatorName=r.creator_name||creatorNameCache.get(r.created_by)||'';
  if(!creatorName&&r.created_by){
    const creatorResult=await supabase.from('cc_members').select('display_name').eq('auth_user_id',r.created_by).maybeSingle();
    if(!creatorResult.error&&creatorResult.data)creatorName=creatorResult.data.display_name||'';
    creatorNameCache.set(r.created_by,creatorName);
  }
  r={...r,creator_name:creatorName};
  recipeDetailCache.set(recipeId,r);
  window.ccCurrentRecipe=r;
  const dietaryTags=classificationTags(r).map(tag=>typeof tag==='string'?tag:String(tag?.label||tag?.name||'')).map(tag=>tag.trim()).filter(Boolean);
  const dietarySection=dietaryTags.length?'<div class="detail-section"><h4>Dietary / suitability</h4>'+renderDietaryBadges(dietaryTags)+'</div>':'';
  detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name)}</h2><div class="meta">${stars(r.rating)}</div><div class="created-by">Added by: <strong>${esc(r.creator_name||'')}</strong></div>${dietarySection}${r.description?'<div class="detail-section"><h4>Description</h4><div class="rich-display">'+safeRichHtml(r.description)+'</div></div>':''}<div class="detail-section"><h4>Ingredients</h4><div class="rich-display">${ingredientsHtml(r)||'—'}</div></div><div class="detail-section"><h4>Method</h4><div class="rich-display">${safeRichHtml(r.method||'')||'—'}</div></div>${r.personal_notes?'<div class="detail-section"><h4>My notes</h4><div class="rich-display">'+safeRichHtml(r.personal_notes)+'</div></div>':''}${r.source_url?'<div class="detail-section"><h4>Source</h4><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener">'+esc(r.source_title||r.source_url)+'</a></p></div>':''}<div class="detail-actions"><button class="secondary" id="favBtn">${r.is_favourite?'★ Remove favourite':'☆ Add to favourites'}</button></div>`;
  detailDialog.querySelector('#detailContent').querySelectorAll('a[data-recipe-id]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();showRecipe(Number(link.dataset.recipeId))}));
  window.ccOpenRecipe=showRecipe;
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
async function openRecipePrintWindow(id,recipeWindow){
  const win=recipeWindow||window.open('about:blank','_blank');
  if(!win)return showUiError('Please allow pop-ups for Cooking Confidential to open a linked recipe in a new tab.','Pop-up blocked');
  try{
    win.document.open();win.document.write('<!doctype html><html><head><title>Loading recipe…</title></head><body style="font:16px Arial;padding:32px">Loading recipe…</body></html>');win.document.close();
    const recipeId=Number(id);
    let r=recipeDetailCache.get(recipeId);
    if(!r){
      const{data,error}=await supabase.from('cc_recipes').select(RECIPE_DETAIL_FIELDS).eq('id',recipeId).single();
      if(error||!data)throw new Error(error?.message||'Recipe could not be found.');
      r=data;recipeDetailCache.set(recipeId,r);
    }
    let creatorName=r.creator_name||creatorNameCache.get(r.created_by)||'';
    if(!creatorName&&r.created_by){
      const result=await supabase.from('cc_members').select('display_name').eq('auth_user_id',r.created_by).maybeSingle();
      if(!result.error&&result.data)creatorName=result.data.display_name||'';
      creatorNameCache.set(r.created_by,creatorName);
    }
    const dietary=Array.isArray(r.dietary_tags)?r.dietary_tags.map(tag=>typeof tag==='string'?tag:String(tag?.label||tag?.name||'')).map(x=>x.trim()).filter(Boolean):[];
    const sections=[
      r.description?'<section><h2>Description</h2><div>'+safeRichHtml(r.description)+'</div></section>':'',
      '<section><h2>Ingredients</h2><div>'+ (ingredientsHtml(r)||'—') +'</div></section>',
      '<section><h2>Method</h2><div>'+(safeRichHtml(r.method||'')||'—')+'</div></section>',
      r.personal_notes?'<section><h2>My notes</h2><div>'+safeRichHtml(r.personal_notes)+'</div></section>':'',
      r.source_url?'<section><h2>Source</h2><p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.source_title||r.source_url)+'</a></p></section>':''
    ].join('');
    const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(r.name||'Recipe')+' · Cooking Confidential</title><style>'+
      '*{box-sizing:border-box}body{margin:0;background:#f5f1e8;color:#24231f;font:16px/1.6 Arial,sans-serif}.page{max-width:900px;margin:28px auto;background:#fffdfa;padding:44px 52px 52px;min-height:90vh;box-shadow:0 8px 30px #0001}.eyebrow{font-size:11px;letter-spacing:2px;color:#9b3f2f;text-transform:uppercase}.meta{color:#756d62;font:14px Georgia,serif;margin:8px 0 24px}h1{font:normal 36px/1.15 Georgia,serif;margin:8px 0 10px}h2{font:normal 14px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#9b3f2f;margin:26px 0 10px}section{margin-top:18px}a{color:#2457a6}ul,ol{padding-left:24px}.actions{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:10px;padding:14px 0;background:#fffdfa;border-top:1px solid #ddd6ca;margin-top:32px}button{border:1px solid #d8cdbd;border-radius:9px;padding:11px 20px;background:#f7f2e9;font-weight:600;cursor:pointer}.primary{background:#9b3f2f;color:white;border-color:#9b3f2f}.tags{color:#9b3f2f;font-size:12px;letter-spacing:1px;text-transform:uppercase}@media(max-width:650px){.page{margin:0;padding:26px 22px;min-height:100vh}h1{font-size:29px}}@media print{@page{size:A4;margin:17mm}body{background:white}.page{max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}.actions{display:none}a{color:#24231f;text-decoration:none}section{break-inside:avoid}}'+
      '</style></head><body><main class="page"><p class="eyebrow">Cooking Confidential · '+esc([r.cuisine,r.course||r.recipe_type||'Recipe'].filter(Boolean).join(' · '))+'</p><h1>'+esc(r.name||'Recipe')+'</h1><div class="meta">Added by: <strong>'+esc(creatorName||'')+'</strong></div>'+(dietary.length?'<p class="tags">'+dietary.map(esc).join(' · ')+'</p>':'')+sections+'<div class="actions"><button onclick="window.close()">Close tab</button><button class="primary" onclick="window.print()">Print / Save as PDF</button></div></main></body></html>';
    win.document.open();win.document.write(html);win.document.close();win.focus();
  }catch(error){
    try{win.document.body.innerHTML='<p style="font:16px Arial;padding:30px">Could not open this recipe: '+String(error.message||error).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</p>'}catch{}
  }
}
window.ccOpenRecipePrintWindow=openRecipePrintWindow;
async function copyMenu(id){const m=menus.find(x=>x.id===id);if(!m)return;const{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const{data,error}=await supabase.from('cc_menus').insert({name:m.name+' — Copy',menu_date:null,occasion:m.occasion,guest_count:m.guest_count,notes:m.notes,visibility:'private',created_by:user.id}).select().single();if(error)return showUiError(error.message,'Could not copy menu');const items=await supabase.from('cc_menu_items').select('*').eq('menu_id',m.id).order('sort_order');if(items.error)return showUiError(items.error.message,'Could not copy menu items');if(items.data?.length){const rows=items.data.map(x=>({menu_id:data.id,recipe_id:x.recipe_id,section:x.section,sort_order:x.sort_order,custom_label:x.custom_label}));const ins=await supabase.from('cc_menu_items').insert(rows);if(ins.error)return showUiError(ins.error.message,'Could not copy menu items')}await loadData()}
let ccOtpSent=false;let ccOtpEmail='';const ccOtpInput=document.createElement('input');ccOtpInput.id='otpInput';ccOtpInput.type='text';ccOtpInput.inputMode='numeric';ccOtpInput.autocomplete='one-time-code';ccOtpInput.pattern='[0-9]{8}';ccOtpInput.maxLength=8;ccOtpInput.placeholder='Enter 8-digit sign-in code';ccOtpInput.setAttribute('aria-label','8-digit sign-in code');ccOtpInput.hidden=true;ccOtpInput.style.marginTop='0';ccOtpInput.style.height=document.querySelector('#emailInput').getBoundingClientRect().height+'px';ccOtpInput.style.width='100%';ccOtpInput.style.boxSizing='border-box';ccOtpInput.style.padding='11px';ccOtpInput.style.font='15px Arial';ccOtpInput.style.border='1px solid #ddd';ccOtpInput.style.borderRadius='10px';loginForm.insertBefore(ccOtpInput,loginForm.querySelector('button'));loginForm.onsubmit=async e=>{e.preventDefault();const button=loginForm.querySelector('button');if(!button||button.disabled)return;const email=document.querySelector('#emailInput').value.trim();button.disabled=true;if(!ccOtpSent){button.textContent='Sending…';loginMessage.textContent='Sending your sign-in code…';const{error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error){const message=String(error.message||'').toLowerCase();loginMessage.textContent=message.includes('rate limit')?'Please wait about 60 seconds before requesting another code.':'We could not send the code. Please try again in a moment.';button.disabled=false;button.textContent='Send sign-in code';return}ccOtpSent=true;ccOtpEmail=email;document.querySelector('#emailInput').readOnly=true;ccOtpInput.hidden=false;ccOtpInput.required=true;button.disabled=false;button.textContent='Verify code';loginMessage.textContent='Check your email for the 8-digit code, then enter it above.';ccOtpInput.focus();return}button.textContent='Verifying…';loginMessage.textContent='Verifying your code…';const token=ccOtpInput.value.trim();const{error}=await supabase.auth.verifyOtp({email:ccOtpEmail,token,type:'email'});if(error){loginMessage.textContent='That code could not be verified. Check it and try again, or request a new code.';button.disabled=false;button.textContent='Verify code';return}loginMessage.textContent='Signed in. Opening your kitchen…'};
document.querySelector('#recipeForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const ingredients=String(f.get('ingredients')).split('\n').map(x=>x.trim()).filter(Boolean);const{error}=await supabase.from('cc_recipes').insert({name:f.get('name'),cuisine:f.get('cuisine')||null,course:f.get('course')||null,ingredients,method:f.get('method')||null,personal_notes:f.get('notes')||null,created_by:user.id,visibility:'private'});if(error)return showUiError(error.message,'Could not save recipe');recipeDialog.close();e.target.reset();await loadData()};
document.querySelector('#menuForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return showUiError('Please sign in again.','Sign-in required');const{error}=await supabase.from('cc_menus').insert({name:f.get('name'),menu_date:f.get('date')||null,guest_count:f.get('guests')?Number(f.get('guests')):null,occasion:f.get('occasion')||null,notes:f.get('notes')||null,visibility:'private',created_by:user.id});if(error)return showUiError(error.message,'Could not create menu');menuDialog.close();e.target.reset();await loadData();view='menus'};
document.querySelector('#addRecipeBtn').onclick=()=>recipeDialog.showModal();const closeRecipeDialog=()=>{recipeDialog.close();document.querySelector('#recipeForm').reset()};document.querySelector('#recipeForm .close').onclick=e=>{e.preventDefault();closeRecipeDialog()};document.querySelector('#recipeForm .dialog-actions button[value="cancel"]').onclick=e=>{e.preventDefault();closeRecipeDialog()};document.querySelector('#importBtn').onclick=()=>{importDialog.showModal();if(typeof window.ccOpenImportInbox==='function')window.ccOpenImportInbox();};document.querySelector('#closeImport').onclick=()=>importDialog.close();document.querySelector('#fileInput').onchange=e=>queueFiles([...e.target.files]);const addUrlBtn=document.querySelector('#addUrlBtn');if(addUrlBtn)addUrlBtn.onclick=(e)=>{e.preventDefault();e.stopPropagation();const input=document.querySelector('#sourceUrl'),url=String(input?.value||'').trim();if(!url){input?.focus();return}addImportItem({source_url:url,file_name:url.split('/').pop()||url,mime_type:'text/url'});input.value='';if(typeof window.ccOpenImportInbox==='function')window.ccOpenImportInbox()};function importAlreadyQueued(item){
  const key=item?.source_url?String(item.source_url).trim().toLowerCase():String(item?.file_name||'').trim().toLowerCase();
  if(!key)return false;
  return importItems.some(x=>{
    if(x?.status!=='Queued')return false;
    if(item?.source_url||x?.source_url)return String(x?.source_url||'').trim().toLowerCase()===key;
    return String(x?.file_name||'').trim().toLowerCase()===key && Number(x?.size||0)===Number(item?.size||0) && Number(x?.file?.lastModified||0)===Number(item?.file?.lastModified||0);
  });
}
function addImportItem(item){
  if(importAlreadyQueued(item))return false;
  item.localId=crypto.randomUUID();item.status='Queued';item.selected=false;importItems.push(item);window.ccImportItems=importItems;renderImportQueue();return true
}
function queueFiles(files){
  let added=0;
  files.forEach(file=>{if(addImportItem({file,file_name:file.name,mime_type:file.type||'application/octet-stream',size:file.size}))added++});
  if(added<files.length)window.ccShowError?.('The same file is already in the upload list. It has not been added twice.','Duplicate upload skipped');
}function renderImportQueue(){
 const queued=importItems.filter(x=>x.status==='Queued'),selected=queued.filter(x=>x.selected).length;
 importQueue.innerHTML=importItems.length?
 '<div class="queue-head"><label class="queue-select-all"><input id="selectAllImports" type="checkbox" '+(queued.length&&selected===queued.length?'checked':'')+' '+(!queued.length?'disabled':'')+'><span>Select all</span></label><button class="secondary" id="uploadAll" type="button" '+(!selected?'disabled':'')+'>Upload selected</button></div>'+
 importItems.map(x=>'<div class="queue-item"><label class="queue-select"><input class="import-select" type="checkbox" data-local-id="'+esc(x.localId||'')+'" '+(x.selected?'checked':'')+' '+(x.status!=='Queued'?'disabled':'')+'><span><strong>'+esc(x.file_name)+'</strong></span></label><span>'+esc(x.status)+(x.dbId?' · Item ID '+esc(x.dbId):'')+'</span>'+(x.status==='Uploaded'&&x.dbId?'<button type="button" class="secondary cc-local-review" data-db-id="'+esc(x.dbId)+'" data-image="'+(String(x.mime_type||'').startsWith('image/')?'1':'0')+'" data-docx="'+(/\.docx$/i.test(x.file_name||'')?'1':'0')+'">Review</button>':'')+'</div>').join(''):'';
 const selectAll=document.querySelector('#selectAllImports');
 if(selectAll)selectAll.onchange=()=>{queued.forEach(x=>x.selected=selectAll.checked);renderImportQueue()};importQueue.querySelectorAll('.cc-local-review').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.dbId);if(b.dataset.docx==='1'&&typeof window.ccReviewImportDocx==='function')return window.ccReviewImportDocx(id);if(typeof window.ccReviewImportItem==='function')return window.ccReviewImportItem(id,b.dataset.image==='1')});
 importQueue.querySelectorAll('.import-select').forEach(cb=>cb.onchange=()=>{const x=importItems.find(i=>i.localId===cb.dataset.localId);if(x)x.selected=cb.checked;renderImportQueue()});
}window.ccRenderImportQueue=renderImportQueue;window.addEventListener('cc:import-queue-changed',()=>render());
search.oninput=()=>{
  if(view==='salads'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadSaladPage({offset:0}).catch(e=>showUiError(e.message,'Could not search soups and salads')),350);return}
  if(view==='starters'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadStarterPage({offset:0}).catch(e=>showUiError(e.message,'Could not search starters')),350);return}
  if(view==='chutney'||view==='marinade'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadCategoryPage(view,{offset:0}).catch(e=>showUiError(e.message,'Could not search recipes')),350);return}
  if(view==='menus'||view==='favourites'){
    if(view==='menus')renderMenus(search.value.trim().toLowerCase());
    else loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not search favourites'));
    return;
  }
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not search recipes')),350);
};
document.querySelectorAll('.tab').forEach(t=>t.onclick=async()=>{
  view=t.dataset.view;
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
  if(view==='salads'){try{window.ccSaladCuisineOptions=await loadSaladCuisineOptions();await loadSaladPage({offset:0})}catch(e){showUiError(e.message,'Could not load soups and salads')}return}
  if(view==='starters'){try{window.ccStarterCuisineOptions=await loadStarterCuisineOptions();await loadStarterPage({offset:0})}catch(e){showUiError(e.message,'Could not load starters')}return}
  if(view==='chutney'||view==='marinade'){try{await loadCategoryPage(view,{offset:0})}catch(e){showUiError(e.message,'Could not load '+categoryPageState[view].title)}return}
  if(view==='menus'){renderMenus(search.value.trim().toLowerCase());return}
  if(view==='favourites'){
    try{await Promise.all([loadRecipePage({offset:0,refreshCount:true,silent:true}),loadMenus()]);renderFavourites(search.value.trim().toLowerCase())}
    catch(e){showUiError(e.message,'Could not load favourites')}
    return;
  }
  if(view==='all'){
    try{await Promise.all([loadRecipePage({offset:0,refreshCount:true,silent:true}),loadMenus()]);renderAll(search.value.trim().toLowerCase())}
    catch(e){showUiError(e.message,'Could not load all results')}
    return;
  }
  loadRecipePage({offset:0,refreshCount:true}).catch(e=>showUiError(e.message,'Could not load recipes'));
});
let bootedUserId=null,currentMember=null;
async function boot(sessionOverride=null){
  let session=sessionOverride;
  if(!session){
    try{
      const{data,error}=await supabase.auth.getSession();
      if(error)console.warn('Cooking Confidential session restore:',error.message);
      session=data?.session||null;
    }catch(error){
      console.warn('Cooking Confidential session restore failed:',error?.name||'Error');
      // Do not force an already-authenticated app back to login on a transient read failure.
      if(appPanel.hidden)return;
      session=null;
    }
  }
  if(!session){
    // On initial load, show login. If the app was already open, a temporary null
    // session read during browser/PWA resume must not masquerade as a sign-out.
    if(!appPanel.hidden)return;
    bootedUserId=null;
    currentMember=null;
    loginPanel.hidden=false;
    loginPanel.style.display='';
    appPanel.hidden=true;
    appPanel.style.display='none';
    const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}
    return;
  }
  if(bootedUserId===session.user.id)return;
  bootedUserId=session.user.id;
  const{data:member,error:memberError}=await supabase.from('cc_members').select('id,email,display_name,role,active').eq('auth_user_id',session.user.id).maybeSingle();
  if(memberError||!member||!member.active){
    bootedUserId=null;
    currentMember=null;
    appPanel.hidden=true;
    appPanel.style.display='none';
    loginPanel.hidden=false;
    loginPanel.style.display='';
    loginMessage.textContent='This email is not currently enabled for Cooking Confidential.';
    const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}
    await supabase.auth.signOut();
    return;
  }
  currentMember=member;
  window.ccCurrentMember=member;
  window.ccCurrentUserId=session.user.id;
  loginPanel.hidden=true;
  loginPanel.style.display='none';
  appPanel.hidden=false;
  appPanel.style.display='block';
  userBadge.textContent=member.display_name||session.user.email||'Signed in';
  userBadge.hidden=false;
  const adminLink=document.querySelector('#adminLink');
  if(adminLink){adminLink.hidden=member.role!=='owner';adminLink.style.display=member.role==='owner'?'inline-flex':'none'}
  try{await loadData()}catch(e){content.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
async function ccRestoreSession(reason){
  try{
    const{data,error}=await supabase.auth.getSession();
    if(error)console.warn('Cooking Confidential session check ('+reason+'):',error.message);
    if(data?.session)await boot(data.session);
    // No session on resume is not by itself proof of an explicit sign-out.
  }catch(error){
    console.warn('Cooking Confidential session check failed ('+reason+'):',error?.name||'Error');
  }
}
window.addEventListener('pageshow',()=>{ccRestoreSession('pageshow')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ccRestoreSession('visible')});
supabase.auth.onAuthStateChange((event,session)=>{
  if(session){setTimeout(()=>boot(session),0);return}
  if(event==='SIGNED_OUT'){
    bootedUserId=null;currentMember=null;
    loginPanel.hidden=false;loginPanel.style.display='';
    appPanel.hidden=true;appPanel.style.display='none';
    const adminLink=document.querySelector('#adminLink');if(adminLink){adminLink.hidden=true;adminLink.style.display='none'}
    return;
  }
  // Other null-session events may occur while the SDK restores persisted auth.
  // Re-read persisted state before changing the visible screen.
  setTimeout(()=>ccRestoreSession('auth-'+event),250);
});
boot();
