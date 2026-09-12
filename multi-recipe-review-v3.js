import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const dialog=document.querySelector('#detailDialog');

const clean=s=>String(s??'')
 .replace(/\\[nrt]/g,' ')
 .replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ')
 .replace(/\s+/g,' ').trim();
const cleanLines=s=>String(s??'').replace(/\r/g,'').split(/\n/).map(clean).filter(Boolean);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const social=/^(like|comment|share|send|home|video|friends|marketplace|notifications|menu|follow|save|add a comment|see more|suggested for you|sponsored|original audio|reels?)$/i;
const heading=/^(ingredients?|method|directions?|instructions?|preparation|steps?|procedure|notes?|tips?|storage|serving suggestions?)\s*[:\-–—]?$/i;
const action=/\b(combine|mix|stir|whisk|blend|process|add|pour|heat|cook|bake|roast|grill|marinate|season|simmer|boil|fry|serve|refrigerate|chill|place|remove|transfer|taste|adjust|dissolve)\b/i;
const units=/\b(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lb|pounds?|g|kg|mg|ml|l|lit(?:er|re)s?|cloves?|pieces?|slices?|sprigs?|pinch(?:es)?|to taste)\b/i;

function ingredientText(v){
 if(v&&typeof v==='object') v=[v.amount,v.quantity,v.unit,v.name,v.ingredient].filter(Boolean).join(' ');
 return clean(v).replace(/^[«»+•·\-–—"'`:;]+\s*/,'').replace(/^\d+[.)]\s+/,'').trim();
}
function isGarbage(v,names=[]){
 const x=ingredientText(v); if(!x||social.test(x)||heading.test(x))return true;
 const low=x.toLowerCase();
 if(names.some(n=>{const a=String(n??'').trim().toLowerCase();return a&&low===a}))return true;
 if(/(?:\bviarinae\b|\bridiust\b|nashville hot of|tres h|~111d11|uuvv1|t~gether|l['’]?:::|•~tJ)/i.test(x))return true;
 const letters=(x.match(/[A-Za-z]/g)||[]).length, digits=(x.match(/\d/g)||[]).length;
 const odd=(x.match(/[^A-Za-z0-9\s.,'’()/&+%°½⅓⅔¼¾-]/g)||[]).length;
 if(letters<3||odd>Math.max(2,letters*.25))return true;
 if(digits&&letters<5&&!units.test(x))return true;
 if(/(?:\|{5,})/.test(x)||/(?:\\|~){2,}/.test(x))return true;
 return false;
}

function normaliseRecipe(r,names){
 const out={...r};
 // Preserve the extracted recipe title verbatim apart from surrounding whitespace.
 // The previous generic cleaner could corrupt leading characters on iOS/live builds.
 out.name=String(r?.name??'').trim()||'Imported recipe';
 const raw=Array.isArray(r?.ingredients)?r.ingredients:cleanLines(r?.ingredients);
 const ing=[],met=[]; let methodStarted=false;
 for(const rawLine of raw){
  const x=ingredientText(rawLine); if(!x)continue;
  if(/^ingredients?\s*[:\-–—]?$/i.test(x))continue;
  if(/^(method|directions?|instructions?|preparation|steps?|procedure)\s*[:\-–—]?$/i.test(x)){methodStarted=true;continue;}
  if(methodStarted){if(!isGarbage(x,names))met.push(x);continue;}
  if(isGarbage(x,names))continue;
  if(action.test(x)&&x.length>55){met.push(x);continue;}
  ing.push(x);
 }
 // The extractor currently stores the OCR block in `ingredients`, so if the
 // cleaner rejected everything, use a conservative second pass for ordinary
 // quantity/unit lines rather than showing 0 ingredients.
 if(!ing.length){
  for(const rawLine of raw){
   const x=ingredientText(rawLine); if(!x||/^(ingredients?|instructions?|method)\s*[:\-–—]?$/i.test(x))continue;
   if(!isGarbage(x,names)&&units.test(x))ing.push(x);
  }
 }
 out.ingredients=[...new Set(ing)];
 out.method=[...new Set(met)];
 out.notes=(Array.isArray(r?.notes)?r.notes:cleanLines(r?.notes)).map(clean).filter(x=>!isGarbage(x,names));
 out.cuisine=clean(r?.cuisine); out.course=clean(r?.course); out.servings=clean(r?.servings||r?.yield||r?.recipeYield);
 return out;
}
function extractRecipes(x){
 let j={};try{j=JSON.parse(x.extracted_text||'{}')}catch{}
 let rs=Array.isArray(j.recipes)?j.recipes:null;
 if(!rs&&j.recipe&&typeof j.recipe==='object')rs=[j.recipe];
 if(!rs&&j.name)rs=[j];
 if(!Array.isArray(rs))return [];
 const names=rs.map(r=>String(r?.name??'').trim()).filter(Boolean);
 return rs.map(r=>normaliseRecipe(r,names)).filter(r=>r.name);
}

function renderList(id,x,recipes,saved=new Set()){
 dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" aria-label="Back">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes detected</h2><p class="small-note">Review and save each recipe individually, or save all selected recipes together.</p><div class="multi-list">${recipes.map((r,i)=>`<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" ${saved.has(i)?'disabled':'checked'}><span><strong>${esc(r.name)}</strong><small>${r.ingredients.length} ingredients${r.method.length?' · method found':''}${saved.has(i)?' · saved':''}</small></span></label><button type="button" class="secondary multi-edit" data-r="${i}" ${saved.has(i)?'disabled':''}>Review</button></article>`).join('')}</div><div class="detail-actions cc-multi-detail-actions"><button class="secondary" type="button" id="multiCancel">Cancel</button><button class="primary" type="button" id="multiSave">Save selected recipes</button></div>`;
 dialog.querySelector('.close').onclick=()=>dialog.close();
 dialog.querySelector('#multiCancel').onclick=()=>dialog.close();
 dialog.querySelectorAll('.multi-edit').forEach(b=>b.onclick=()=>editOne(id,x,recipes,Number(b.dataset.r),saved));
 dialog.querySelector('#multiSave').onclick=async()=>{const selected=[...dialog.querySelectorAll('input[data-r]:checked:not(:disabled)')].map(e=>Number(e.dataset.r));await saveMany(id,x,recipes,selected,saved)};
 dialog.showModal();
}
async function saveRecipe(id,x,r){
 const {data:{user}}=await sb.auth.getUser(); if(!user)throw Error('Please sign in again.');
 const payload={name:String(r.name??'').trim(),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Marinade',servings:clean(r.servings)||null,ingredients:r.ingredients.map(ingredientText).filter(Boolean),method:r.method.map(clean).filter(Boolean).join('\n'),source_type:x.source_url?'social':'file',source_url:x.source_url||null,source_title:x.source_url?(x.source_title||null):(x.file_name||null),created_by:user.id,visibility:'private'};
 let existing=x.recipe_id||null;
 if(!existing){const {data:m,error}=await sb.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type',payload.source_type).eq('source_title',payload.source_title||'').eq('name',payload.name).limit(1);if(error)throw Error(error.message);existing=m?.[0]?.id||null;}
 const result=existing?await sb.from('cc_recipes').update(payload).eq('id',existing):await sb.from('cc_recipes').insert(payload).select('id').single();
 if(result.error)throw Error(result.error.message);
 const savedId=existing||result.data?.id||null;
 const upd=await sb.from('cc_import_items').update({recipe_id:savedId,review_status:'approved',extraction_status:'ready',source_title:payload.name}).eq('id',id);
 if(upd.error)throw Error(upd.error.message);
 return savedId;
}
function editOne(id,x,recipes,i,saved){
 const r=recipes[i];
 dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" aria-label="Back to list">×</button><p class="eyebrow">REVIEW RECIPE ${i+1} OF ${recipes.length}</p><h2>Check before saving</h2><p class="small-note">Only the cleaned fields below will be saved.</p><form id="ccMultiOne"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(r.cuisine)}"></label><label>Course<input name="course" value="${esc(r.course)}"></label></div><label>Servings<input name="servings" value="${esc(r.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(r.ingredients.join('\n'))}</textarea></label><label>Method<textarea name="method" rows="10">${esc(r.method.join('\n'))}</textarea></label><label>Notes<textarea name="notes" rows="6">${esc(r.notes.join('\n'))}</textarea></label><div class="detail-actions cc-multi-detail-actions"><button class="secondary" type="button" id="backMulti">Back to list</button><button class="primary" type="submit">Save this recipe</button></div></form>`;
 dialog.querySelector('.close').onclick=()=>renderList(id,x,recipes,saved);
 dialog.querySelector('#backMulti').onclick=()=>renderList(id,x,recipes,saved);
 dialog.querySelector('#ccMultiOne').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f);const updated={...r,name:String(fd.get('name')??'').trim(),cuisine:clean(fd.get('cuisine')),course:clean(fd.get('course')),servings:clean(fd.get('servings')),ingredients:cleanLines(fd.get('ingredients')).map(ingredientText).filter(Boolean),method:cleanLines(fd.get('method')),notes:cleanLines(fd.get('notes'))};const btn=f.querySelector('[type="submit"]');btn.disabled=true;btn.textContent='Saving…';try{await saveRecipe(id,x,updated);recipes[i]=updated;saved.add(i);renderList(id,x,recipes,saved)}catch(err){btn.disabled=false;btn.textContent='Save this recipe';alert(err.message||'Could not save recipe.')}};
}
async function saveMany(id,x,recipes,selected,saved){
 if(!selected.length)return alert('Select at least one recipe.');
 try{for(const i of selected){await saveRecipe(id,x,recipes[i]);saved.add(i)}renderList(id,x,recipes,saved)}catch(e){alert(e.message||'Could not save the selected recipes.')}
}
export async function reviewMultiRecipeV3(id){
 const {data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();
 if(error||!x)throw Error(error?.message||'Could not load import.');
 const recipes=extractRecipes(x);
 if(!recipes.length)return false;
 renderList(id,x,recipes,new Set());
 return true;
}
