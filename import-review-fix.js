import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const detailDialog = document.querySelector('#detailDialog');
const importDialog = document.querySelector('#importDialog');
const esc = (s = '') => String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

const courseOptions = `
  <option value="">Select category…</option>
  <optgroup label="Dishes">
    <option>Breakfast</option><option>Brunch</option><option>Starter</option>
    <option>Soup</option><option>Salad</option><option>Main</option>
    <option>Side</option><option>Snack</option><option>Dessert</option>
    <option>Bread</option><option>Beverage</option>
  </optgroup>
  <optgroup label="Recipe components">
    <option>Dip</option><option>Dressing</option><option>Sauce</option>
    <option>Chutney</option><option>Marinade</option><option>Rub</option>
    <option>Paste</option><option>Spice Blend</option><option>Stock / Broth</option>
    <option>Pickle</option><option>Condiment</option>
  </optgroup>
  <option value="__custom__">Other / custom…</option>`;

function parseRecipe(x) {
  let recipe = {name:x.file_name?.replace(/\.[^.]+$/,'')||'Imported recipe',ingredients:[],method:'',cuisine:x.inferred_cuisine||'',course:x.inferred_course||'',servings:'',description:''};
  if (x.extraction_status === 'ready' && x.extracted_text) {
    try {
      const j=JSON.parse(x.extracted_text);
      recipe={...recipe,name:j.name||recipe.name,ingredients:j.ingredients||j.recipeIngredient||[],method:j.method||j.recipeInstructions||'',cuisine:j.cuisine||j.recipeCuisine||recipe.cuisine,course:j.course||j.recipeCategory||recipe.course,servings:j.servings||j.recipeYield||'',description:j.description||''};
      if(Array.isArray(recipe.method)) recipe.method=recipe.method.map(v=>typeof v==='string'?v:v.text||v.name||'').join('\n');
      if(Array.isArray(recipe.cuisine)) recipe.cuisine=recipe.cuisine.join(', ');
      if(Array.isArray(recipe.course)) recipe.course=recipe.course.join(', ');
    } catch (_) {}
  }
  return recipe;
}

function showReview(x,id){
  const recipe=parseRecipe(x);
  const ing=Array.isArray(recipe.ingredients)?recipe.ingredients.map(v=>typeof v==='string'?v:[v?.amount,v?.quantity,v?.unit,v?.name].filter(Boolean).join(' ')).filter(Boolean).join('\n'):recipe.ingredients||'';
  const selectedCourse=Array.isArray(recipe.course)?recipe.course.join(', '):String(recipe.course||'');
  detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" onclick="detailDialog.close()">×</button><p class="eyebrow">REVIEW IMPORT</p><h2>Check the recipe before saving</h2>
  <form id="ccImportReviewForm">
  <label>Recipe name<input name="name" required value="${esc(recipe.name)}"></label>
  <label>Description<textarea name="description" rows="4">${esc(recipe.description)}</textarea></label>
  <div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(recipe.cuisine)}"></label><label>Category<select name="course">${courseOptions}</select><input id="ccCustomCategory" name="custom_course" placeholder="Enter category" style="display:none;margin-top:8px"></label></div>
  <label>Servings<input name="servings" value="${esc(recipe.servings)}"></label>
  <label>Ingredients<textarea name="ingredients" rows="8">${esc(ing)}</textarea></label>
  <label>Method<textarea name="method" rows="9">${esc(recipe.method)}</textarea></label>
  <div class="detail-actions"><button class="secondary" type="button" id="ccCancelReview">Cancel</button><button class="primary" type="submit">Save to recipes</button></div>
  </form>`;
  detailDialog.showModal();

  const form=document.querySelector('#ccImportReviewForm');
  const category=form.querySelector('[name="course"]');
  const custom=form.querySelector('[name="custom_course"]');
  const known=[...category.options].map(o=>o.value).filter(v=>v && v!=='__custom__');
  if(selectedCourse && known.includes(selectedCourse)) category.value=selectedCourse;
  else if(selectedCourse){ category.value='__custom__'; custom.value=selectedCourse; custom.style.display='block'; }
  category.addEventListener('change',()=>{ custom.style.display=category.value==='__custom__'?'block':'none'; if(category.value!=='__custom__')custom.value=''; });
  document.querySelector('#ccCancelReview').onclick=()=>detailDialog.close();

  form.onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);const{data:{user}}=await supabase.auth.getUser();
    if(!user)return alert('Please sign in again before saving the recipe.');
    const chosenCourse=String(f.get('course')==='__custom__'?f.get('custom_course'):f.get('course')).trim();
    const ingredients=String(f.get('ingredients')).split('\n').map(v=>v.trim()).filter(Boolean);
    const{error}=await supabase.from('cc_recipes').insert({name:f.get('name'),description:f.get('description')||null,cuisine:f.get('cuisine')||null,course:chosenCourse||null,servings:f.get('servings')||null,ingredients,method:f.get('method')||null,source_type:x.source_url?'social':'file',source_url:x.source_url||null,source_title:x.source_title||x.file_name||null,created_by:user.id,visibility:'private'});
    if(error)return alert(error.message);
    const{error:updateError}=await supabase.from('cc_import_items').update({review_status:'approved',extraction_status:'ready'}).eq('id',id);
    if(updateError)return alert(updateError.message);
    detailDialog.close();window.location.reload();
  };
}

async function reviewImportFixed(id){
  importDialog?.close();
  detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Preparing recipe…</h2><p class="small-note">Extracting the recipe from your file. This may take a few seconds.</p></div>';
  detailDialog.showModal();
  const{data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();
  if(error){detailDialog.close();return alert(error.message);}
  if(x.extraction_status==='pending'||x.extraction_status==='processing'){
    const{error:fxError}=await supabase.functions.invoke('cc-import-extract',{body:{import_item_id:id}});
    if(fxError){detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" onclick="detailDialog.close()">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(fxError.message||'The recipe could not be extracted. Please try again.')}</p>`;return;}
  }
  const{data:latest,error:latestError}=await supabase.from('cc_import_items').select('*').eq('id',id).single();
  if(latestError){detailDialog.close();return alert(latestError.message);}
  if(latest.extraction_status==='failed'){detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" onclick="detailDialog.close()">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(latest.error_message||'The recipe could not be extracted from this file.')}</p>`;return;}
  showReview(latest,id);
}

document.addEventListener('click',event=>{const button=event.target.closest('.review-btn');if(!button)return;event.preventDefault();event.stopImmediatePropagation();reviewImportFixed(Number(button.dataset.id));},true);
