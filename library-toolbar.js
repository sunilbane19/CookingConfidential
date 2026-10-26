// Event-driven recipe library toolbar. No MutationObserver.
const state={filter:(()=>{try{const f=JSON.parse(sessionStorage.getItem('ccLibraryFilterState')||'null');return f?.field&&f?.value?`${f.field}:${f.value}`:'latest'}catch{return'latest'}})()};
const css=document.createElement('style');
css.textContent=`#importBtn,#addRecipeBtn{display:none!important}#ccLibraryTools{display:block!important;position:relative;z-index:20;margin:0 0 10px}.cc-library-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.cc-library-actions{display:flex;gap:7px;align-items:center;padding-top:14px}.cc-library-icon{width:44px!important;height:40px!important;padding:0!important;display:grid!important;place-items:center!important;font-size:23px!important;line-height:1!important}.cc-library-filter{display:flex!important;gap:8px;align-items:flex-end;min-width:340px;max-width:48vw}.cc-library-filter label{display:block!important;flex:1;margin:0!important;font:10px Arial!important;color:var(--muted);letter-spacing:.04em}.cc-library-filter select{display:block;width:100%;min-width:145px;height:40px;box-sizing:border-box;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);padding:8px 10px;font:13px Arial;margin-top:4px;line-height:22px}.cc-library-filter select:disabled{opacity:.65}@media(max-width:760px){.cc-library-actions{padding-top:24px}.hero{padding:8px 18px 6px!important}.hero .eyebrow{margin-bottom:5px!important}.hero h1{margin-bottom:6px!important}.search-wrap{margin-top:8px!important}.tab{padding:8px 0!important}#content{padding:4px 18px!important}.section-head{margin-bottom:6px!important}.cc-library-filter{min-width:0;max-width:none;flex:1}.cc-library-filter label{flex:1}.cc-library-filter select{min-width:0}}`;
document.head.appendChild(css);
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const knownOptions={
  cuisine:['American','British','Chinese','French','Greek','Indian','Italian','Japanese','Korean','Malay','Mediterranean','Mexican','Middle Eastern','Spanish','Thai','Vietnamese','Other / custom…'],
  course:['Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage','Ingredient'],
  recipe_type:['Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment']
};
const values=field=>[...new Set((window.ccRecipes||[]).map(r=>String(r?.[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const allOptions=field=>[...new Set([...(knownOptions[field]||[]),...values(field)])].sort((a,b)=>a.localeCompare(b));
const filterFields=()=>[['latest','Latest'],['favourite','Favourites'],['cuisine','Cuisine'],['course','Course'],['recipe_type','Recipe type']];
function selectedValue(){const [kind,...rest]=state.filter.split(':');return{kind,value:rest.join(':')}}
function valueOptions(kind){
  if(kind==='latest')return[['','All recipes']];
  if(kind==='favourite')return[['true','Favourites only']];
  if(kind==='country'){const vals=[...new Set(values('country').concat(values('region')))];return vals.sort((a,b)=>a.localeCompare(b)).map(v=>[v,v])}
  return allOptions(kind).map(v=>[v,v]);
}
function renderValueSelect(select,kind,current=''){
  select.innerHTML=valueOptions(kind).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
  select.value=current||'';
  select.disabled=kind==='latest'||kind==='favourite';
}
function apply(){
  // Filtering must happen in the paginated Supabase query, not only against the
  // 12 cards currently in the DOM. The server search resets pagination and count.
  document.querySelectorAll('#content .card').forEach(card=>{card.style.display=''});
}
function applyServerFilter(kind,value=''){
  const field=({cuisine:'cuisine',course:'course',recipe_type:'recipe_type',country:'country'})[kind]||'';
  const next={field,value:(kind==='latest'||kind==='favourite')?'':String(value||'')};
  try{sessionStorage.setItem('ccLibraryFilterState',JSON.stringify(next));sessionStorage.setItem('ccRecipeReturnOffset','0')}catch{}
  window.dispatchEvent(new CustomEvent('cc:library-filter-change',{detail:next}));
}
function ensure(){
  const content=document.querySelector('#content'); if(!content||content.hidden)return;
  const active=document.querySelector('.tab.active')?.dataset.view||'recipes';
  document.querySelector('#ccLibraryTools')?.remove();
  const head=content.querySelector('.section-head'); if(!head)return;
  const tools=document.createElement('div'); tools.id='ccLibraryTools';
  if(active==='recipes'){
    tools.innerHTML=`<div class="cc-library-toolbar"><div class="cc-library-actions"><button class="secondary cc-library-icon" id="ccImportRecipes" type="button" aria-label="Import recipes" title="Import recipes">⇅</button><button class="primary cc-library-icon" id="ccNewRecipe" type="button" aria-label="New recipe" title="New recipe">＋</button></div><div class="cc-library-filter"><label>Filter by<select id="ccRecipeFilterKind" aria-label="Filter by">${filterFields().map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label><label>Value<select id="ccRecipeFilterValue" aria-label="Filter value"></select></label></div></div>`;
    head.parentNode.insertBefore(tools,head);
    tools.querySelector('#ccImportRecipes').onclick=()=>document.querySelector('#importBtn')?.click();
    tools.querySelector('#ccNewRecipe').onclick=()=>window.ccOpenNewRecipeEditor?.();
    const kindSelect=tools.querySelector('#ccRecipeFilterKind'),valueSelect=tools.querySelector('#ccRecipeFilterValue');
    const {kind,value}=selectedValue(); kindSelect.value=kind; renderValueSelect(valueSelect,kind,value);
    kindSelect.onchange=e=>{const k=e.target.value;state.filter=(k==='latest'||k==='favourite')?k:k+':'+(valueOptions(k)[0]?.[0]||'');renderValueSelect(valueSelect,k,'');applyServerFilter(k,valueSelect.value)};
    valueSelect.onchange=e=>{const k=kindSelect.value;state.filter=(k==='latest'||k==='favourite')?k:k+':'+e.target.value;applyServerFilter(k,e.target.value)};
    apply();
  }else if(active==='menus'){
    tools.innerHTML='<div class="cc-library-toolbar"><div class="cc-library-actions"><button class="secondary cc-library-icon" id="ccImportMenus" type="button" aria-label="Upload menu" title="Upload menu">⇅</button><button class="primary cc-library-icon" id="ccNewMenuContext" type="button" aria-label="New menu" title="New menu">＋</button></div></div>';
    head.parentNode.insertBefore(tools,head);
    tools.querySelector('#ccImportMenus').onclick=e=>{e.preventDefault();e.stopPropagation();window.ccMenuAction?.('uploadExisting')};
    tools.querySelector('#ccNewMenuContext').onclick=e=>{e.preventDefault();e.stopPropagation();window.ccMenuAction?.('newBlank')};
  }
}
window.ccEnsureLibraryToolbar=ensure;
window.addEventListener('cc:recipes-rendered',ensure);
document.addEventListener('click',e=>{if(e.target.closest('.tab'))setTimeout(ensure,0)});
setTimeout(ensure,250);