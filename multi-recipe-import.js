import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWorker } from 'https://esm.sh/tesseract.js@5';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/\s*\[[\s\d,;,-]+\]\s*/g,' ').replace(/[ \t]+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
const courses=['Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage'];
const types=['Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
const SECTION=/^(ingredients?|ingredient list|method|directions?|instructions?|preparation|steps?|servings?|notes?|tips?|storage|serving suggestions?|recipe)$/i;
const GENERIC=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|contents?|index|introduction|notes?|tips?|storage|serving suggestions?|long-term preservation methods?)$/i;

function titleCaseScore(s){const w=s.trim().split(/\s+/);return w.length>=1&&w.length<=8 && s.length>=3&&s.length<=70 && !GENERIC.test(s) && !/^step\s*\d+/i.test(s) && w.filter(x=>/^[A-Z][A-Za-z'&-]*$/.test(x)).length>=Math.max(1,Math.ceil(w.length*.35));}
function makeRecipe(name){return {name:clean(name)||'Imported recipe',description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:[],method:[],notes:[]};}
function parseIngredientRows(rows){return rows.slice(1).map(r=>{const a=r.map(clean).filter(Boolean); if(a.length>=3)return `${a[0]} — ${a[2]}${a[1]&&a[1]!==a[0]?' — '+a[1]:''}`; return a.join(' — ');}).filter(Boolean);}
function htmlTables(doc){return [...doc.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>clean(c.textContent)))).filter(x=>x.length);}
function htmlBlocks(doc){return [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')].map(e=>clean(e.textContent)).filter(Boolean);}
function tableKind(rows){const h=(rows[0]||[]).join(' ').toLowerCase();if(/ingredient|quantity|amount|ratio|purpose/.test(h))return'ingredients';if(/method|step|direction|instruction/.test(h)&&!/shelf life|best used|storage/.test(h))return'method';if(/temperature|shelf life|best used|storage/.test(h))return'notes';return'';}
function parseDocxMulti(html,file){
 const doc=new DOMParser().parseFromString(html,'text/html'); const blocks=htmlBlocks(doc); const tables=htmlTables(doc);
 const recipeHeads=blocks.filter(titleCaseScore);
 const hasMultiple=recipeHeads.length>1;
 if(!hasMultiple){
   const r=makeRecipe(blocks[0]||file.replace(/\.[^.]+$/,''));
   const it=tables.find(t=>tableKind(t)==='ingredients'); const mt=tables.find(t=>tableKind(t)==='method'); const nt=tables.filter(t=>tableKind(t)==='notes');
   r.ingredients=it?parseIngredientRows(it):[]; r.method=mt?mt.slice(1).map(r=>r.filter(Boolean).join(' — ')).filter(Boolean):blocks.filter(x=>/^step\s*\d+/i.test(x)); r.notes=nt.flatMap(t=>t.slice(1).map(r=>r.filter(Boolean).join(' — '))).filter(Boolean); return [r];
 }
 const out=[];
 for(let i=0;i<recipeHeads.length;i++){
   const name=recipeHeads[i], start=blocks.indexOf(name), end=i+1<recipeHeads.length?blocks.indexOf(recipeHeads[i+1]):blocks.length;
   const section=blocks.slice(start+1,end); const r=makeRecipe(name);
   const ih=section.findIndex(x=>/^ingredients?$/i.test(x)); const mh=section.findIndex(x=>/^(method|directions?|instructions?|preparation|steps?)$/i.test(x));
   if(ih>=0)r.ingredients=section.slice(ih+1,mh>ih?mh:section.length).filter(x=>!SECTION.test(x));
   if(mh>=0)r.method=section.slice(mh+1).filter(x=>!/^notes?|storage|serving suggestions?/i.test(x));
   out.push(r);
 }
 return out.length?out:[makeRecipe(file.replace(/\.[^.]+$/,''))];
}
function ocrLineCandidates(words){
 const valid=words.filter(w=>w.text?.trim()&&w.confidence>=35); if(!valid.length)return[];
 const medianH=valid.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(valid.length/2)]||20;
 const sorted=[...valid].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0); const out=[];
 for(const w of sorted){let l=out.find(x=>Math.abs(x.y-(w.bbox.y0+w.bbox.y1)/2)<Math.max(10,medianH*.65)); if(!l){l={y:(w.bbox.y0+w.bbox.y1)/2,words:[]};out.push(l);}l.words.push(w);}
 return out.map(l=>{l.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);return {...l,text:clean(l.words.map(w=>w.text).join(' ')),x0:Math.min(...l.words.map(w=>w.bbox.x0)),x1:Math.max(...l.words.map(w=>w.bbox.x1)),height:Math.max(...l.words.map(w=>w.bbox.y1-w.bbox.y0))};}).filter(l=>l.text.length>1);
}
function splitImageRecipes(result){
 const words=result.data.words||[]; const lineData=ocrLineCandidates(words); if(!lineData.length)return[];
 const medH=lineData.map(l=>l.height).sort((a,b)=>a-b)[Math.floor(lineData.length/2)]||20;
 const candidates=lineData.filter(l=>l.height>=medH*1.35&&l.text.length<=70&&titleCaseScore(l.text));
 if(candidates.length<2){const r=makeRecipe(lineData[0]?.text||'Imported image');r.ingredients=lineData.slice(1).map(l=>l.text);return[r];}
 const recipes=candidates.map(c=>({centerX:(c.x0+c.x1)/2,centerY:c.y,text:c.text}));
 const xs=[...new Set(recipes.map(r=>Math.round(r.centerX/25)*25))].sort((a,b)=>a-b);
 // Assign each OCR line to the nearest title in two dimensions, weighted by vertical distance within the same visual band.
 const out=recipes.map(t=>makeRecipe(t.text));
 for(const l of lineData){
   if(recipes.some(t=>t.text===l.text&&Math.abs(t.centerY-l.y)<15))continue;
   let best=-1,score=Infinity;
   recipes.forEach((t,i)=>{const dx=Math.abs(((l.x0+l.x1)/2)-t.centerX);const dy=Math.abs(l.y-t.centerY);const s=dx+dy*.75;if(s<score){score=s;best=i;}});
   if(best>=0)out[best].ingredients.push(l.text);
 }
 return out.filter(r=>r.ingredients.length>=2);
}
async function ocrImage(blob,status){
 status('Reading image…'); const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status(`Reading image… ${Math.round((m.progress||0)*100)}%`);}});
 try{const result=await worker.recognize(blob);return splitImageRecipes(result);}finally{await worker.terminate();}
}
async function loadOriginal(x){
 const {data:u,error}=await sb.storage.from('cooking-confidential').createSignedUrl(x.file_path,600);if(error||!u?.signedUrl)throw Error(error?.message||'Could not read the original file.');
 const r=await fetch(u.signedUrl);if(!r.ok)throw Error('Could not load the original file.');return r.blob();
}
async function extract(id){
 dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note" id="multiStatus">Reading the original file.</p></div>';dialog.showModal();
 const status=t=>{const e=document.querySelector('#multiStatus');if(e)e.textContent=t;};
 const {data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!x)return fail(error?.message||'Import item not found.');
 try{
  const blob=await loadOriginal(x);let recipes=[];
  if(/\.(png|jpe?g|webp)$/i.test(x.file_name||'')||String(x.mime_type||'').startsWith('image/')) recipes=await ocrImage(blob,status);
  else if(/\.docx$/i.test(x.file_name||'')){status('Reading document structure…');const html=(await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()})).value||'';recipes=parseDocxMulti(html,x.file_name||'Imported document');}
  else if((x.mime_type||'').startsWith('text/')){const r=makeRecipe(x.file_name||'Imported recipe');r.ingredients=lines(await blob.text());recipes=[r];}
  else throw Error('This multi-recipe importer currently supports images, DOCX and text documents.');
  if(!recipes.length)throw Error('No recipes could be detected.');
  recipes=recipes.map(r=>({...r,ingredients:r.ingredients.map(clean).filter(Boolean),method:Array.isArray(r.method)?r.method.map(clean).filter(Boolean):lines(r.method),notes:r.notes.map(clean).filter(Boolean)}));
  await sb.from('cc_import_items').update({extracted_text:JSON.stringify({version:2,multiple:true,recipes}),source_title:recipes[0]?.name||x.file_name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);
  render(id,x,recipes);
 }catch(e){fail(e?.message||String(e));}
}
function fail(msg){dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(msg)}</p>`;dialog.querySelector('.close').onclick=()=>dialog.close();}
function render(id,x,recipes){
 const cards=recipes.map((r,i)=>`<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" checked><span><strong>${esc(r.name)}</strong><small>${r.ingredients.length} extracted lines${r.method.length?' · method found':''}</small></span></label><button type="button" class="secondary multi-edit" data-r="${i}">Review</button></article>`).join('');
 dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes detected</h2><p class="small-note">Review each recipe before saving. The original file remains attached to this import.</p><div class="multi-list">${cards}</div><div class="detail-actions"><button class="secondary" id="multiCancel">Cancel</button><button class="primary" id="multiSave">Save selected recipes</button></div>`;
 dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#multiCancel').onclick=()=>dialog.close();
 dialog.querySelectorAll('.multi-edit').forEach(b=>b.onclick=()=>editOne(id,x,recipes,Number(b.dataset.r)));
 dialog.querySelector('#multiSave').onclick=async()=>{const selected=[...dialog.querySelectorAll('input[data-r]:checked')].map(e=>Number(e.dataset.r));await saveMany(id,x,recipes.filter((_,i)=>selected.includes(i)));};
}
function editOne(id,x,recipes,i){const r=recipes[i];dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW RECIPE ${i+1} OF ${recipes.length}</p><h2>Check before saving</h2><form id="oneRecipe"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><div class="classification-grid"><label>Course<select name="course"><option value="">Select…</option>${courses.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>Recipe type<select name="recipe_type">${types.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label></div><label>Cuisine<input name="cuisine" value="${esc(r.cuisine)}"></label><label>Servings<input name="servings" value="${esc(r.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(r.ingredients.join('\n'))}</textarea></label><label>Method<textarea name="method" rows="10">${esc(r.method.join('\n'))}</textarea></label><label>Notes / storage / other information<textarea name="notes" rows="6">${esc(r.notes.join('\n'))}</textarea></label><div class="detail-actions"><button type="button" class="secondary" id="backMulti">Back to list</button><button class="primary">Save this recipe</button></div></form>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#backMulti').onclick=()=>render(id,x,recipes);
 const f=dialog.querySelector('#oneRecipe');f.elements.recipe_type.value=r.recipe_type||'Dish';f.elements.course.value=r.course||'';
 f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const updated={...r,name:clean(fd.get('name')),course:clean(fd.get('course')),recipe_type:clean(fd.get('recipe_type'))||'Dish',cuisine:clean(fd.get('cuisine')),servings:clean(fd.get('servings')),ingredients:lines(fd.get('ingredients')),method:lines(fd.get('method')),notes:lines(fd.get('notes'))};recipes[i]=updated;render(id,x,recipes);};
}
async function saveMany(id,x,recipes){const {data:{user}}=await sb.auth.getUser();if(!user)return alert('Please sign in again.');if(!recipes.length)return alert('Select at least one recipe.');
 const rows=recipes.map(r=>({name:clean(r.name),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Dish',servings:clean(r.servings)||null,ingredients:r.ingredients,method:r.method.join('\n'),personal_notes:r.notes.join('\n')||null,source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'}));
 const {error}=await sb.from('cc_recipes').insert(rows);if(error)return alert(error.message);
 const {error:ie}=await sb.from('cc_import_items').update({review_status:'approved',extraction_status:'ready',source_title:`${recipes.length} recipes from ${x.file_name||'import'}`}).eq('id',id);if(ie)return alert(ie.message);dialog.close();location.reload();
}
window.ccMultiReview=extract;
