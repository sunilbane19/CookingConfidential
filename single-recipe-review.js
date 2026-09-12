import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const dialog=document.querySelector('#detailDialog');
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split(/\n/).map(clean).filter(Boolean);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ingredient=v=>clean(typeof v==='object'?[v.amount,v.quantity,v.unit,v.name,v.ingredient].filter(Boolean).join(' '):v).replace(/^[«»+•·\-–—"'`:;.]+\s*/,'').trim();

export async function reviewSingleRecipe(id){
 const {data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();
 if(error||!x)return false;
 let j={};try{j=JSON.parse(x.extracted_text||'{}')}catch{return false}
 const r=j.recipe&&typeof j.recipe==='object'?j.recipe:(Array.isArray(j.recipes)&&j.recipes.length===1?j.recipes[0]:j);
 if(!r||Array.isArray(j.recipes)&&j.recipes.length!==1)return false;
 const ingredients=(Array.isArray(r.ingredients)?r.ingredients:lines(r.ingredients)).map(ingredient).filter(Boolean).filter(v=>!/^instructions?\s*[,.:]?$/i.test(v));
 const method=Array.isArray(r.method)?r.method.map(clean).filter(Boolean):lines(r.method);
 const recipe={name:clean(r.name)||clean((x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')),cuisine:clean(r.cuisine),course:clean(r.course),servings:clean(r.servings||r.recipeYield),ingredients,method,notes:Array.isArray(r.notes)?r.notes.map(clean).filter(Boolean):lines(r.notes)};
 dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" aria-label="Close">×</button><p class="eyebrow">REVIEW RECIPE</p><h2>Check before saving</h2><p class="small-note">Only the cleaned fields below will be saved.</p><form id="ccSingleReview"><label>Recipe name<input name="name" required value="${esc(recipe.name)}"></label><div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(recipe.cuisine)}"></label><label>Course<input name="course" value="${esc(recipe.course)}"></label></div><label>Servings<input name="servings" value="${esc(recipe.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(recipe.ingredients.join('\\n'))}</textarea></label><label>Method<textarea name="method" rows="10">${esc(recipe.method.join('\\n'))}</textarea></label><label>Notes<textarea name="notes" rows="6">${esc(recipe.notes.join('\\n'))}</textarea></label><div class="detail-actions cc-multi-detail-actions"><button class="secondary" type="button" id="ccSingleCancel">Cancel</button><button class="primary" type="submit">Save recipe</button></div></form>`;
 dialog.showModal();
 dialog.querySelector('.close').onclick=()=>dialog.close();
 dialog.querySelector('#ccSingleCancel').onclick=()=>dialog.close();
 dialog.querySelector('#ccSingleReview').onsubmit=async e=>{
  e.preventDefault();const f=e.currentTarget,fd=new FormData(f),{data:{user}}=await sb.auth.getUser();if(!user)return alert('Please sign in again.');
  const name=clean(fd.get('name')),ingredients=lines(fd.get('ingredients')).map(ingredient).filter(Boolean),method=lines(fd.get('method')),payload={name,cuisine:clean(fd.get('cuisine'))||null,course:clean(fd.get('course'))||null,servings:clean(fd.get('servings'))||null,ingredients,method:method.join('\n')||null,personal_notes:lines(fd.get('notes')).join('\n')||null,source_type:x.source_url?'social':'file',source_url:x.source_url||null,source_title:x.source_url?(x.source_title||null):(x.file_name||null),created_by:user.id,visibility:'private'};
  const btn=f.querySelector('[type="submit"]');btn.disabled=true;btn.textContent='Saving…';
  try{const {data:existing}=await sb.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type',payload.source_type).eq('source_title',payload.source_title||'').eq('name',name).limit(1);const existingId=existing?.[0]?.id;const result=existingId?await sb.from('cc_recipes').update(payload).eq('id',existingId):await sb.from('cc_recipes').insert(payload).select('id').single();if(result.error)throw Error(result.error.message);const recipeId=existingId||result.data?.id;const upd=await sb.from('cc_import_items').update({recipe_id:recipeId||null,review_status:'approved',extraction_status:'ready',source_title:name}).eq('id',id);if(upd.error)throw Error(upd.error.message);dialog.close();window.dispatchEvent(new CustomEvent('cc:recipes-changed'));}catch(err){btn.disabled=false;btn.textContent='Save recipe';alert(err.message||'Could not save recipe.')}};
 return true;
}
