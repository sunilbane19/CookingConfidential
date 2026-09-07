import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWorker } from 'https://esm.sh/tesseract.js@5';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const dialog=document.querySelector('#detailDialog');
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
const courses=['Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage'];
const types=['Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];

function imageRows(words){
  const valid=(words||[]).filter(w=>w.text?.trim()&&Number(w.confidence||0)>=35);
  if(!valid.length)return[];
  const heights=valid.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b);
  const med=heights[Math.floor(heights.length/2)]||20;
  const rows=[];
  for(const w of [...valid].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){
    const cy=(w.bbox.y0+w.bbox.y1)/2;
    let row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(7,med*.55));
    if(!row){row={cy,words:[]};rows.push(row);}
    row.words.push(w);
  }
  return rows.map(r=>{
    r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    return {text:clean(r.words.map(w=>w.text).join(' ')),y0:Math.min(...r.words.map(w=>w.bbox.y0)),y1:Math.max(...r.words.map(w=>w.bbox.y1)),height:Math.max(...r.words.map(w=>w.bbox.y1-w.bbox.y0)),confidence:r.words.reduce((a,w)=>a+Number(w.confidence||0),0)/r.words.length};
  }).filter(r=>r.text.length>1);
}

function parseTile(words){
  const rows=imageRows(words);
  if(!rows.length)return null;
  const heights=rows.map(r=>r.height).sort((a,b)=>a-b);
  const med=heights[Math.floor(heights.length/2)]||20;
  let titleIndex=rows.findIndex(r=>r.height>=med*1.35 && r.y0<rows[0].y0+med*7);
  if(titleIndex<0)titleIndex=0;
  const titleParts=[rows[titleIndex].text];
  if(rows[titleIndex+1] && rows[titleIndex+1].height>=med*1.15 && rows[titleIndex+1].y0-rows[titleIndex].y1<med*1.8 && titleParts[0].length<35){titleParts.push(rows[titleIndex+1].text);}
  const title=clean(titleParts.join(' '));
  const ingredients=rows.filter((_,i)=>!titleParts.includes(rows[i]?.text)).map(r=>r.text).filter(Boolean);
  return {name:title||'Imported recipe',description:'',cuisine:'',course:'',recipe_type:'Rub',servings:'',ingredients,method:[],notes:[]};
}

async function ocrTile(worker,bitmap,x,y,w,h,status,label){
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(w*2.2); canvas.height=Math.round(h*2.2);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
  status(`Reading ${label}…`);
  const result=await worker.recognize(canvas);
  return parseTile(result.data.words||[]);
}

async function getItem(id){
  const {data,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!data)throw new Error(error?.message||'Import item not found.');
  return data;
}

async function loadOriginal(item){
  const {data,error}=await sb.storage.from('cooking-confidential').createSignedUrl(item.file_path,600);
  if(error||!data?.signedUrl)throw new Error(error?.message||'Could not read the uploaded image.');
  const r=await fetch(data.signedUrl);
  if(!r.ok)throw new Error('Could not load the uploaded image.');
  return r.blob();
}

function normalise(recipes){
  const seen=new Set();
  return recipes.filter(r=>r&&r.name).map(r=>({...r,name:clean(r.name),ingredients:[...new Set((r.ingredients||[]).map(clean).filter(Boolean))],method:[],notes:[]})).filter(r=>{
    const key=r.name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(!key||seen.has(key))return false; seen.add(key); return true;
  });
}

async function saveExtraction(id,recipes){
  const payload={version:5,multiple:true,grid:'3x3',recipes};
  const {error}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload),source_title:recipes[0]?.name||'Imported image',extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);
  if(error)throw new Error(error.message);
}

function showReview(id,recipes){
  const cards=recipes.map((r,i)=>`<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" checked><span><strong>${esc(r.name)}</strong><small>${r.ingredients.length} extracted lines · Rub</small></span></label><button type="button" class="secondary cc-image-edit" data-r="${i}">Review</button></article>`).join('');
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes detected</h2><p class="small-note">Review each recipe before saving. The original image remains attached to this import.</p><div class="multi-list">${cards}</div><div class="detail-actions"><button class="secondary" id="ccImageCancel">Cancel</button><button class="primary" id="ccImageSave">Save selected recipes</button></div>`;
  dialog.showModal();
  dialog.querySelector('.close').onclick=()=>showImportList();
  dialog.querySelector('#ccImageCancel').onclick=()=>showImportList();
  dialog.querySelectorAll('.cc-image-edit').forEach(b=>b.onclick=()=>editRecipe(id,recipes,Number(b.dataset.r)));
  dialog.querySelector('#ccImageSave').onclick=()=>saveSelected(id,recipes);
}

function showImportList(){
  if(dialog.open)dialog.close();
  const importDialog=document.querySelector('#importDialog');
  if(importDialog?.open)return;
  // Re-open the upload/import inbox so the user can continue reviewing items.
  importDialog?.showModal();
  const close=document.querySelector('#closeImport');
  if(close)close.focus();
}

function editRecipe(id,recipes,i){
  const r=recipes[i];
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW RECIPE ${i+1} OF ${recipes.length}</p><h2>Check before saving</h2><form id="ccImageRecipeForm"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><div class="classification-grid"><label>Course<select name="course"><option value="">Select…</option>${courses.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>Recipe type<select name="recipe_type">${types.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label></div><label>Cuisine<input name="cuisine" value="${esc(r.cuisine||'')}"></label><label>Servings<input name="servings" value="${esc(r.servings||'')}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc((r.ingredients||[]).join('\n'))}</textarea></label><label>Method<textarea name="method" rows="8" placeholder="Leave blank if the source contains no method.">${esc((r.method||[]).join('\n'))}</textarea></label><label>Notes<textarea name="notes" rows="5">${esc((r.notes||[]).join('\n'))}</textarea></label><div class="detail-actions"><button type="button" class="secondary" id="ccImageBack">Back to list</button><button class="primary">Save this recipe</button></div></form>`;
  dialog.querySelector('.close').onclick=()=>showReview(id,recipes);
  dialog.querySelector('#ccImageBack').onclick=()=>showReview(id,recipes);
  const f=dialog.querySelector('#ccImageRecipeForm');
  f.elements.course.value=r.course||''; f.elements.recipe_type.value=r.recipe_type||'Rub';
  f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);recipes[i]={...r,name:clean(fd.get('name')),course:clean(fd.get('course')),recipe_type:clean(fd.get('recipe_type'))||'Rub',cuisine:clean(fd.get('cuisine')),servings:clean(fd.get('servings')),ingredients:lines(fd.get('ingredients')),method:lines(fd.get('method')),notes:lines(fd.get('notes'))};showReview(id,recipes);};
}

async function saveSelected(id,recipes){
  const selected=[...dialog.querySelectorAll('input[data-r]:checked')].map(e=>Number(e.dataset.r)).filter(Number.isInteger).map(i=>recipes[i]).filter(Boolean);
  if(!selected.length){alert('Select at least one recipe.');return;}
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user){alert('Please sign in again.');return;}
  const rows=selected.map(r=>({name:clean(r.name),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Rub',servings:clean(r.servings)||null,ingredients:r.ingredients||[],method:(r.method||[]).join('\n')||null,personal_notes:(r.notes||[]).join('\n')||null,source_title:clean(r.name),source_type:'file',source_url:null,created_by:user.id,visibility:'private'}));
  const {data:created,error}=await sb.from('cc_recipes').insert(rows).select('id,name');
  if(error){alert('Could not save recipes: '+error.message);return;}
  await sb.from('cc_import_items').update({review_status:'approved',recipe_id:created?.[0]?.id||null,extraction_status:'ready'}).eq('id',id);
  dialog.close(); window.location.reload();
}

export async function processImageImport(id){
  const statusBox=dialog.querySelector('#detailContent');
  const status=t=>{const e=dialog.querySelector('#ccImageStatus');if(e)e.textContent=t;};
  statusBox.innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note" id="ccImageStatus">Loading image.</p></div>';
  dialog.showModal();
  try{
    const item=await getItem(id); const blob=await loadOriginal(item); const bitmap=await createImageBitmap(blob); const W=bitmap.width,H=bitmap.height;
    const cols=3,rows=3; const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status(`Reading image… ${Math.round((m.progress||0)*100)}%`);}});
    try{
      const recipes=[]; const tw=W/cols,th=H/rows;
      for(let ry=0;ry<rows;ry++)for(let cx=0;cx<cols;cx++){
        const recipe=await ocrTile(worker,bitmap,cx*tw,ry*th,tw,th,status,`${ry*cols+cx+1} of 9`);
        if(recipe)recipes.push(recipe);
      }
      const cleanRecipes=normalise(recipes);
      if(cleanRecipes.length<7)throw new Error(`Only ${cleanRecipes.length} recipe panels could be read. Please try the original image at a higher resolution.`);
      await saveExtraction(id,cleanRecipes);
      bitmap.close();
      showReview(id,cleanRecipes);
    }finally{await worker.terminate();}
  }catch(error){
    console.error('Cooking Confidential image extraction:',error);
    statusBox.innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(error?.message||String(error))}</p>`;
    dialog.querySelector('.close').onclick=()=>showImportList();
  }
}
window.ccProcessImageImport=processImageImport;
