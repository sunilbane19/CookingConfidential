import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';

// Generic post-processing for DOCX imports that were incorrectly split at
// culinary subsection headings (for example, "The Marinade", "The Glaze",
// "Stage 1" and "Stage 2"). It deliberately does not touch genuine recipe
// names or normal multi-recipe imports.
const COMPONENT=/^(stage\s*\d+(?:\s*[:.-]|\s+)|the\s+(?:ingredients?|marinade|glaze|sauce|rub|dressing|paste|filling|topping|mixture|aromatics?|seasoning|method|steps?|directions?|instructions?|preparation)\b)/i;
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const titleFromFile=s=>clean(String(s||'Imported recipe').replace(/\.[^.]+$/,'')).replace(/\b\w/g,m=>m.toUpperCase());

async function getItem(id){const{data,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!data)throw Error(error?.message||'Import item not found.');return data;}

function renderReview(dialog,id,item,recipe){
  const d=dialog.querySelector('#detailContent');
  d.innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW RECIPE</p><h2>Check before saving</h2><form id="ccSingleRecipe"><label>Recipe name<input name="name" required value="${esc(recipe.name)}"></label><label>Ingredients<textarea name="ingredients" rows="12">${esc(recipe.ingredients.join('\n'))}</textarea></label><label>Method<textarea name="method" rows="14">${esc(recipe.method.join('\n'))}</textarea></label><label>Notes / storage / other information<textarea name="notes" rows="6">${esc(recipe.notes.join('\n'))}</textarea></label><div class="detail-actions"><button type="button" class="secondary" id="ccSingleBack">Back to recipe</button><button class="primary">Save this recipe</button></div></form>`;
  d.querySelector('.close').onclick=()=>dialog.close();
  d.querySelector('#ccSingleBack').onclick=()=>renderSingle(dialog,id,item,recipe);
  d.querySelector('#ccSingleRecipe').onsubmit=async e=>{e.preventDefault();recipe={...recipe,name:clean(new FormData(e.currentTarget).get('name')),ingredients:clean(String(new FormData(e.currentTarget).get('ingredients')||'')).split('\n').map(clean).filter(Boolean),method:clean(String(new FormData(e.currentTarget).get('method')||'')).split('\n').map(clean).filter(Boolean),notes:clean(String(new FormData(e.currentTarget).get('notes')||'')).split('\n').map(clean).filter(Boolean)};await saveSingle(dialog,id,item,recipe);};
}

function renderSingle(dialog,id,item,recipe){
  const d=dialog.querySelector('#detailContent');
  d.innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">SINGLE RECIPE IMPORT</p><h2>1 recipe detected</h2><p class="small-note">The document contains one recipe. Culinary subsection headings have been kept as part of the same recipe.</p><article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" checked disabled><span><strong>${esc(recipe.name)}</strong><small>${recipe.ingredients.length} extracted ingredients · ${recipe.method.length} method steps</small></span></label><button type="button" class="secondary" id="ccSingleReview">Review</button></article><div class="detail-actions"><button class="secondary" id="ccSingleCancel">Cancel</button><button class="primary" id="ccSingleSave">Save recipe</button></div>`;
  d.querySelector('.close').onclick=()=>dialog.close();
  d.querySelector('#ccSingleCancel').onclick=()=>dialog.close();
  d.querySelector('#ccSingleReview').onclick=()=>renderReview(dialog,id,item,recipe);
  d.querySelector('#ccSingleSave').onclick=()=>saveSingle(dialog,id,item,recipe);
}

async function saveSingle(dialog,id,item,recipe){
  const{data:{user}}=await sb.auth.getUser();if(!user)return alert('Please sign in again.');
  const{error}=await sb.from('cc_recipes').insert({name:clean(recipe.name),description:null,cuisine:null,course:null,recipe_type:'Dish',servings:null,ingredients:recipe.ingredients,method:recipe.method.join('\n'),personal_notes:recipe.notes.join('\n')||null,source_type:'file',source_url:null,source_title:item.file_name||null,created_by:user.id,visibility:'private'});
  if(error)return alert(error.message);
  const{error:ie}=await sb.from('cc_import_items').update({review_status:'approved',extraction_status:'ready',source_title:item.file_name||recipe.name}).eq('id',id);
  if(ie)return alert(ie.message);
  dialog.close();location.reload();
}

async function fixAfterExtraction(id){
  const dialog=document.querySelector('#detailDialog');if(!dialog)return false;
  const item=await getItem(id);if(!/\.docx$/i.test(item.file_name||''))return false;
  let payload;try{payload=JSON.parse(item.extracted_text||'{}');}catch{return false;}
  const recipes=Array.isArray(payload.recipes)?payload.recipes:[];
  if(recipes.length<2||!recipes.every(r=>COMPONENT.test(clean(r.name))))return false;
  // The existing parser has split one recipe into component headings. Merge
  // those components in document order and use the upload filename as the
  // editable recipe title rather than inventing a title from a subsection.
  const merged={name:titleFromFile(item.file_name),description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:recipes.flatMap(r=>Array.isArray(r.ingredients)?r.ingredients:[]),method:recipes.flatMap(r=>Array.isArray(r.method)?r.method:[]),notes:recipes.flatMap(r=>Array.isArray(r.notes)?r.notes:[])};
  const{error}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify({version:6,multiple:false,recipes:[merged]}),source_title:merged.name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);
  if(error)throw Error(error.message);
  renderSingle(dialog,id,item,merged);
  return true;
}

// The original multi-recipe importer renders its detection dialog before the
// old wrapper around ccMultiReview gets a chance to run. Watch that dialog so
// the generic single-recipe correction is applied immediately after extraction.
let fixing=false;
const observer=new MutationObserver(async()=>{
  if(fixing)return;
  const dialog=document.querySelector('#detailDialog');
  const content=dialog?.querySelector('#detailContent');
  if(!dialog?.open||!content)return;
  const heading=content.querySelector('h2');
  if(!heading||!/\b\d+\s+recipes?\s+detected\b/i.test(heading.textContent||''))return;
  const match=(heading.textContent||'').match(/\b(\d+)\s+recipes?\s+detected\b/i);
  if(!match||Number(match[1])<2)return;
  const idMatch=content.querySelector('[data-id]')?.dataset?.id;
  if(idMatch)return;
  // The original render does not put the import id in the dialog, so recover
  // the most recent pending DOCX item. This is the same constraint used by the
  // existing review flow and is only applied while the multi-recipe dialog is open.
  fixing=true;
  try{
    const{data,error}=await sb.from('cc_import_items').select('id,file_name,extracted_text').eq('extraction_status','ready').eq('review_status','pending').ilike('file_name','%.docx').order('id',{ascending:false}).limit(1).maybeSingle();
    if(!error&&data)await fixAfterExtraction(data.id);
  }catch(e){console.error('Cooking Confidential single-recipe DOCX fix:',e)}finally{fixing=false;}
});
observer.observe(document.body,{subtree:true,childList:true});

let wrapped=false;
const timer=setInterval(()=>{
  if(wrapped||typeof window.ccMultiReview!=='function')return;
  wrapped=true;clearInterval(timer);
  const original=window.ccMultiReview;
  window.ccMultiReview=async id=>{await original(id);try{await fixAfterExtraction(id);}catch(e){console.error('Cooking Confidential single-recipe DOCX fix:',e);}};
},50);
