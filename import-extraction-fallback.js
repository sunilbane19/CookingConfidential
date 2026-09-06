import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const detail=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/\s*\[[\s\d,;,-]+\]\s*/g,' ').replace(/[ \t]+/g,' ').trim();
const cleanLines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
const courses=['Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage'];
const types=['Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];

function tableData(doc){
  return [...doc.querySelectorAll('table')].map(table=>[...table.rows].map(row=>[...row.cells].map(c=>clean(c.textContent)))).filter(rows=>rows.length);
}
function tableKind(rows){
  const head=(rows[0]||[]).join(' ').toLowerCase();
  if(/ingredient|quantity|amount|unit/.test(head)) return 'ingredients';
  if(/method|step|direction|instruction/.test(head) && !/shelf life|best used|storage/.test(head)) return 'method';
  if(/temperature|shelf life|best used|storage/.test(head)) return 'notes';
  return '';
}
function tableText(rows){
  return rows.slice(1).map(row=>row.filter(Boolean).join(' — ')).filter(Boolean);
}
function htmlBlocks(doc){
  return [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')].map(e=>clean(e.textContent)).filter(Boolean);
}
function sectionLines(blocks,heads){
  const idx=blocks.findIndex(x=>heads.some(h=>new RegExp('^'+h+'\\s*:?[\\s]*$','i').test(x)));
  if(idx<0)return [];
  const stop=blocks.findIndex((x,i)=>i>idx && /^(ingredients?|method|directions?|instructions?|preparation|steps|shelf life|storage|notes?|tips?|temperature|serving|recipe)\b\s*:?[\s]*$/i.test(x));
  return blocks.slice(idx+1,stop>idx?stop:blocks.length).filter(x=>x.length>1);
}
function inferIngredients(blocks){
  const qty=/^(?:[-•·]\s*)?(?:\d+(?:[./]\d+)?|½|⅓|⅔|¼|¾)\s*(?:cups?|tbsp|tbs|tsp|g|kg|mg|ml|l|oz|lb|cloves?|slices?|pieces?|medium|large|small)\b/i;
  return blocks.filter(x=>qty.test(x));
}
function parseRecipe(html,file){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const tables=tableData(doc); const ingredientTable=tables.find(t=>tableKind(t)==='ingredients');
  const methodTable=tables.find(t=>tableKind(t)==='method'); const noteTables=tables.filter(t=>tableKind(t)==='notes');
  const blocks=htmlBlocks(doc);
  const name=clean(doc.querySelector('h1,h2,h3')?.textContent||blocks[0]||file.replace(/\.[^.]+$/,''));
  let ingredients=ingredientTable?tableText(ingredientTable):sectionLines(blocks,['ingredients','ingredient list','ingredients list','what you need','ingredients required']);
  if(!ingredients.length) ingredients=inferIngredients(blocks);
  let method=methodTable?tableText(methodTable):sectionLines(blocks,['method','directions','instructions','preparation','steps','recipe method','cooking method']);
  if(!method.length){method=blocks.filter(x=>/^(?:step\s*\d+|\d+[.)])\s+/i.test(x));}
  const notes=noteTables.flatMap(tableText);
  return {name,description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:ingredients.map(clean),method:method.map(clean),notes:notes.map(clean)};
}
function opts(values){return values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');}
function fail(msg){detail.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(msg)}</p>`;detail.querySelector('.close').onclick=()=>detail.close();}
async function extractAndShow(id){
  detail.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Extracting recipe…</h2><p class="small-note">Reading the original file and separating ingredients, method and notes.</p></div>';
  detail.showModal();
  const {data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!x)return fail(error?.message||'Import item not found.');
  try{
    if(!x.file_path)throw Error('No original file is attached to this import.');
    const {data:u,error:ue}=await sb.storage.from('cooking-confidential').createSignedUrl(x.file_path,300);
    if(ue||!u?.signedUrl)throw Error(ue?.message||'Could not read the original file.');
    const res=await fetch(u.signedUrl); if(!res.ok)throw Error('Could not load the original file.');
    const blob=await res.blob(); let html='';
    if(/\.docx$/i.test(x.file_name||'')) html=(await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()})).value||'';
    else if((x.mime_type||'').startsWith('text/')) html=`<p>${esc(await blob.text())}</p>`;
    else throw Error('This extraction fallback currently supports DOCX and text files.');
    if(!html.trim())throw Error('The original file contained no readable text.');
    const recipe=parseRecipe(html,x.file_name||'Imported recipe');
    const {error:saveError}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(recipe),source_title:recipe.name,extraction_status:'ready',review_status:'pending',inferred_cuisine:null,inferred_course:recipe.course,error_message:null}).eq('id',id);
    if(saveError)throw saveError;
    renderReview({...x,extracted_text:JSON.stringify(recipe),extraction_status:'ready'},id);
  }catch(e){fail(e?.message||String(e));}
}
function renderReview(x,id){
  const recipe=JSON.parse(x.extracted_text||'{}'); const course=String(recipe.course||''); const type=String(recipe.recipe_type||'Dish');
  detail.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW IMPORT</p><h2>Check the recipe before saving</h2><p class="small-note">The original file is retained separately. Edit anything that needs correction.</p><form id="ccFallbackReview"><label>Recipe name<input name="name" required value="${esc(recipe.name)}"></label><label>Description<textarea name="description" rows="3">${esc(recipe.description)}</textarea></label><label>Cuisine<input name="cuisine" value="${esc(recipe.cuisine)}"></label><div class="classification-grid"><label>Course<select name="course"><option value="">Select…</option>${opts(courses)}<option value="__custom__">Other / custom…</option></select><input name="custom_course" placeholder="Enter course" style="display:none;margin-top:8px"></label><label>Recipe type<select name="recipe_type">${opts(types)}<option value="__custom__">Other / custom…</option></select><input name="custom_type" placeholder="Enter recipe type" style="display:none;margin-top:8px"></label></div><label>Servings<input name="servings" value="${esc(recipe.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc((recipe.ingredients||[]).join('\n'))}</textarea></label><label>Method<textarea name="method" rows="12">${esc((recipe.method||[]).join('\n'))}</textarea></label><label>Notes / storage / other information<textarea name="notes" rows="6">${esc((recipe.notes||[]).join('\n'))}</textarea></label><div class="detail-actions"><button class="secondary" type="button" id="ccFallbackOriginal">View original file</button><button class="secondary" type="button" id="ccFallbackCancel">Cancel</button><button class="primary" type="submit">Overwrite recipe</button></div></form>`;
  detail.querySelector('.close').onclick=()=>detail.close(); const form=detail.querySelector('#ccFallbackReview');
  const cs=form.elements.course,cc=form.elements.custom_course,ts=form.elements.recipe_type,ct=form.elements.custom_type;
  if(course&&courses.includes(course))cs.value=course;else if(course){cs.value='__custom__';cc.value=course;cc.style.display='block';}
  if(type&&types.includes(type))ts.value=type;else if(type){ts.value='__custom__';ct.value=type;ct.style.display='block';}
  cs.onchange=()=>{cc.style.display=cs.value==='__custom__'?'block':'none';}; ts.onchange=()=>{ct.style.display=ts.value==='__custom__'?'block':'none';};
  form.onsubmit=async e=>{e.preventDefault();const {data:{user}}=await sb.auth.getUser();if(!user)return alert('Please sign in again.');const chosenCourse=cs.value==='__custom__'?cc.value:cs.value;const chosenType=ts.value==='__custom__'?ct.value:ts.value;const payload={name:clean(form.elements.name.value),description:clean(form.elements.description.value)||null,cuisine:clean(form.elements.cuisine.value)||null,course:clean(chosenCourse)||null,recipe_type:clean(chosenType)||'Dish',servings:clean(form.elements.servings.value)||null,ingredients:cleanLines(form.elements.ingredients.value),method:cleanLines(form.elements.method.value).join('\n'),personal_notes:cleanLines(form.elements.notes.value).join('\n')||null,source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'};let rid=x.recipe_id||null;if(!rid){const {data:m}=await sb.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type','file').eq('source_title',x.file_name).limit(1);if(m?.[0])rid=m[0].id;}const result=rid?await sb.from('cc_recipes').update(payload).eq('id',rid):await sb.from('cc_recipes').insert(payload).select('id').single();if(result.error)return alert(result.error.message);const saved=rid||result.data?.id;const {error:ie}=await sb.from('cc_import_items').update({recipe_id:saved,review_status:'approved',extraction_status:'ready'}).eq('id',id);if(ie)return alert(ie.message);detail.close();location.reload();};
  detail.querySelector('#ccFallbackCancel').onclick=()=>detail.close(); detail.querySelector('#ccFallbackOriginal').onclick=()=>showOriginal(x);
}
async function showOriginal(x){const {data:u,error}=await sb.storage.from('cooking-confidential').createSignedUrl(x.file_path,300);if(error||!u?.signedUrl)return alert(error?.message||'Could not open original.');const r=await fetch(u.signedUrl);if(!r.ok)return alert('Could not load original.');const b=await r.blob();const n=x.file_name||'';if(/\.docx$/i.test(n)){const q=await mammoth.convertToHtml({arrayBuffer:await b.arrayBuffer()});detail.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">ORIGINAL RECIPE</p><h2>${esc(n)}</h2><div class="original-viewer">${q.value||'<p>No readable content found.</p>'}</div>`;detail.querySelector('.close').onclick=()=>renderReview(x,x.id);}else alert('Original viewer currently supports DOCX.');}
window.addEventListener('click',e=>{const b=e.target.closest('.review-btn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();extractAndShow(Number(b.dataset.id));},true);
