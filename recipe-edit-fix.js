import { supabase } from './supabase-client.js?v=1.0.1';
const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/\s*\[\s\d,;,-]+\s*/g,' ').replace(/\s+/g,' ').trim();
const cleanMultiline=s=>String(s??'').replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/\s*\[\s\d,;,-]+\s*/g,' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n');
const courses=['','Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage','Ingredient'];
const types=['','Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
const field=(label,name,list,value)=>{const v=String(value||'');const known=list.includes(v);return `<label>${label}<select name="${name}">${list.map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(o||'Select…')}</option>`).join('')}<option value="__custom__" ${v&&!known?'selected':''}>Other / custom…</option></select><input name="${name}_custom" placeholder="Enter category" style="display:${v&&!known?'block':'none'};margin-top:8px" value="${v&&!known?esc(v):''}"></label>`};
const ingredientsText=r=>Array.isArray(r.ingredients)?r.ingredients.map(x=>typeof x==='string'?clean(x):[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).filter(Boolean).join('\n'):clean(r.ingredients);

async function source(r){
  const linked=await supabase.from('cc_import_items').select('file_path,file_name,source_url,source_title,extracted_text').eq('recipe_id',r.id).order('id',{ascending:false}).limit(1);
  if(linked.error)return {html:'',item:null};
  let x=linked.data?.[0]||null;
  if(!x){
    const recent=await supabase.from('cc_import_items').select('file_path,file_name,source_url,source_title,extracted_text').order('id',{ascending:false}).limit(50);
    if(!recent.error){
      const target=String(r.name||'').trim().toLowerCase();
      x=(recent.data||[]).find(item=>{try{const p=JSON.parse(item.extracted_text||'');const rs=Array.isArray(p?.recipes)?p.recipes:[];return rs.some(recipe=>String(recipe?.name||'').trim().toLowerCase()===target)}catch{return false}})||null;
    }
  }
  if(!x)return {html:'<div class="detail-section"><h4>Source</h4><p><small>Entry by Hand</small></p></div>',item:null};
  if(x.file_path)return {html:`<div class="detail-section"><h4>Source</h4><p><button class="secondary" type="button" id="ccViewOriginalEdit">View original file</button><br><small>Imported from file · ${esc(x.file_name||'Original imported file')} · private</small></p></div>`,item:x};
  if(x.source_url)return {html:`<div class="detail-section"><h4>Source</h4><p><a href="${esc(x.source_url)}" target="_blank" rel="noopener noreferrer">Imported from source post</a>${x.source_title?`<br><small>${esc(x.source_title)}</small>`:''}</p></div>`,item:x};
  return {html:'<div class="detail-section"><h4>Source</h4><p><small>Entry by Hand</small></p></div>',item:x};
}

async function openOriginal(r,x){
  if(!x?.file_path)return;
  const u=await supabase.storage.from('cooking-confidential').createSignedUrl(x.file_path,300);
  if(u.error||!u.data?.signedUrl)return window.ccShowError(u.error?.message||'Could not open original file.','Could not open original file');
  const name=String(x.file_name||'Original recipe'), ext=name.split('.').pop()?.toLowerCase()||'';
  const isPdf=ext==='pdf'; const isImage=/^(png|jpe?g|webp|gif|bmp|avif)$/i.test(ext);
  if(!isPdf&&!isImage){dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccOriginalEditBack">×</button><p class="eyebrow">ORIGINAL RECIPE</p><h2>${esc(name)}</h2><p class="small-note">This file type cannot be previewed inside the browser.</p><p><a class="primary" href="${esc(u.data.signedUrl)}" target="_blank" rel="noopener noreferrer">Open original file</a></p>`;document.querySelector('#ccOriginalEditBack').onclick=()=>openEditor(r);return;}
  try{const blob=await fetch(u.data.signedUrl).then(z=>z.blob());const url=URL.createObjectURL(blob);dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccOriginalEditBack">×</button><p class="eyebrow">ORIGINAL RECIPE</p><h2>${esc(name)}</h2>${isPdf?`<iframe class="original-pdf" src="${url}" title="Original recipe PDF"></iframe>`:`<div class="original-viewer"><img class="original-image" alt="Original recipe" src="${url}"></div>`}`;document.querySelector('#ccOriginalEditBack').onclick=()=>{URL.revokeObjectURL(url);openEditor(r)}}catch(e){window.ccShowError(e?.message||'Could not load original file.','Could not load original file')}}

async function openEditor(r){
  const s=await source(r),c=String(r.course||''),t=String(r.recipe_type||'');
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" id="ccEditClose">×</button><p class="eyebrow">EDIT RECIPE</p><h2>Update recipe</h2>${s.html}<form id="ccEditForm"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(r.cuisine)}"></label>${field('Course','course',courses,c)}</div>${field('Recipe type','recipe_type',types,t)}<label>Servings<input name="servings" value="${esc(r.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="8">${esc(ingredientsText(r))}</textarea></label><label>Method<textarea name="method" rows="9">${esc(r.method)}</textarea></label><label>My notes<textarea name="notes" rows="4">${esc(r.personal_notes)}</textarea></label><div class="detail-actions"><button class="secondary" type="button" id="ccDeleteRecipe">Delete recipe</button><button class="secondary" type="button" id="ccCancelEdit">Cancel</button><button class="primary" type="submit">Save changes</button></div></form>`;
  dialog.showModal(); const form=document.querySelector('#ccEditForm'); document.querySelector('#ccEditClose').onclick=()=>dialog.close(); document.querySelector('#ccCancelEdit').onclick=()=>dialog.close();
  ['course','recipe_type'].forEach(n=>{const sel=form.querySelector(`[name="${n}"]`),custom=form.querySelector(`[name="${n}_custom"]`);sel.onchange=()=>{custom.style.display=sel.value==='__custom__'?'block':'none';if(sel.value!=='__custom__')custom.value=''}});
  document.querySelector('#ccDeleteRecipe').onclick=async()=>{if(!confirm('Delete this recipe permanently?'))return;const q=await supabase.from('cc_recipes').delete().eq('id',r.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete recipe');dialog.close();window.location.reload()};
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),val=n=>{const v=String(f.get(n)||'');return v==='__custom__'?String(f.get(`${n}_custom`)||'').trim():v.trim()};const updates={name:clean(f.get('name')),cuisine:clean(f.get('cuisine'))||null,course:val('course')||null,recipe_type:val('recipe_type')||null,servings:clean(f.get('servings'))||null,ingredients:String(f.get('ingredients')||'').split(/\r?\n/).map(clean).filter(Boolean),method:cleanMultiline(f.get('method')),personal_notes:cleanMultiline(f.get('notes'))||null};const q=await supabase.from('cc_recipes').update(updates).eq('id',r.id);if(q.error)return window.ccShowError(q.error.message,'Could not save recipe changes');dialog.close();window.location.reload()};
  document.querySelector('#ccViewOriginalEdit')?.addEventListener('click',()=>openOriginal(r,s.item));
}

async function cardRecipe(id){const q=await supabase.from('cc_recipes').select('*').eq('id',Number(id)).single();if(q.error){window.ccShowError(q.error.message,'Could not load recipe');return null}return q.data}
function addEditButtons(){
  document.querySelectorAll('.card').forEach(card=>{
    if(card.querySelector('.cc-card-actions'))return;
    const body=card.querySelector('.card-body');if(!body)return;const id=card.dataset.id;
    const actions=document.createElement('div');actions.className='cc-card-actions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;position:relative;z-index:2';
    const button=(label,cls,handler)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();await handler(b)});actions.appendChild(b);return b};
    button('Edit','secondary',async()=>{const r=await cardRecipe(id);if(r)openEditor(r)});
    button('Share','secondary',async()=>{const r=await cardRecipe(id);if(!r)return;window.ccCurrentRecipe=r;try{await window.ccRecipeOutput?.shareRecipe(r)}catch(e){window.ccShowError?.(e.message||String(e),'Could not share recipe')}});
    button('Print','secondary',async()=>{const r=await cardRecipe(id);if(!r)return;window.ccCurrentRecipe=r;try{window.ccRecipeOutput?.printRecipe(r)}catch(e){window.ccShowError?.(e.message||String(e),'Could not print recipe')}});
    button('☆ Favourite','secondary',async b=>{const r=await cardRecipe(id);if(!r)return;const next=!r.is_favourite;const q=await supabase.from('cc_recipes').update({is_favourite:next}).eq('id',r.id);if(q.error)return window.ccShowError?.(q.error.message,'Could not update favourite');b.textContent=next?'★ Favourite':'☆ Favourite';if(next)b.dataset.active='1';else b.dataset.active='0';if(!next){const favouritesTab=document.querySelector('.tab[data-view="favourites"].active');if(favouritesTab)card.remove()}else{const count=document.querySelector('.section-head .count');if(count&&document.querySelector('.tab[data-view="favourites"].active')){const n=document.querySelectorAll('.card').length;count.textContent=`${n} recipes`}}window.location.reload()});
    body.appendChild(actions);
  })
}
window.ccOpenRecipeEditor=openEditor;
const observer=new MutationObserver(addEditButtons);observer.observe(document.body,{subtree:true,childList:true});addEditButtons();
