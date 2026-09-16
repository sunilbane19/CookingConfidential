import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { parseDocx } from './docx-parser.js?v=1.0.5';

const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();
const lines=s=>String(s??'').replace(/\\n/g,'\n').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);

async function loadOriginal(x){
  const{data:u,error}=await sb.storage.from('cooking-confidential').createSignedUrl(x.file_path,600);
  if(error||!u?.signedUrl)throw Error(error?.message||'Could not read the original file.');
  const res=await fetch(u.signedUrl);
  if(!res.ok)throw Error('Could not load the original file.');
  return res.blob();
}

function render(id,x,recipes){
  const cards=recipes.map((r,i)=>`<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" ${r._saved?'':'checked'} ${r._saved?'disabled':''}><span><strong>${esc(r.name)}</strong><small>${r._saved?'Saved · ':''}${r.ingredients.length} ingredients${r.method.length?' · method found':''}</small></span></label><button type="button" class="secondary docx-edit" data-r="${i}" ${r._saved?'disabled':''}>${r._saved?'Saved':'Review'}</button></article>`).join('');
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes detected</h2><p class="small-note">Review each recipe before saving. Shared-base references are kept for the inheritance step; recipe-specific differences are not discarded.</p><div class="multi-list">${cards}</div><div class="detail-actions"><button class="secondary" id="docxCancel">Cancel</button><button class="primary" id="docxSave">Save selected recipes</button></div>`;
  dialog.querySelector('.close').onclick=()=>dialog.close();
  dialog.querySelector('#docxCancel').onclick=()=>dialog.close();
  dialog.querySelectorAll('.docx-edit').forEach(b=>b.onclick=()=>editOne(id,x,recipes,Number(b.dataset.r)));
  dialog.querySelector('#docxSave').onclick=async()=>{
    const selected=[...dialog.querySelectorAll('input[data-r]:checked')].map(e=>Number(e.dataset.r));
    await saveMany(id,x,recipes.filter((_,i)=>selected.includes(i)));
  };
}

function editOne(id,x,recipes,i){
  const r=recipes[i];
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW RECIPE ${i+1} OF ${recipes.length}</p><h2>Check before saving</h2><form id="docxOne"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(lines(r.ingredients.join('\n')).join('\n'))}</textarea></label><label>Method / process<textarea name="method" rows="12">${esc(lines(r.method.join('\n')).join('\n'))}</textarea></label><label>Notes / differences<textarea name="notes" rows="7">${esc(lines(r.notes.join('\n')).join('\n'))}</textarea></label><div class="detail-actions"><button type="button" class="secondary" id="docxBack">Back to list</button><button class="primary">Save this recipe</button></div></form>`;
  dialog.querySelector('.close').onclick=()=>dialog.close();
  dialog.querySelector('#docxBack').onclick=()=>render(id,x,recipes);
  const f=dialog.querySelector('#docxOne');
  f.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(f);
    const updated={...r,name:clean(fd.get('name')),ingredients:lines(fd.get('ingredients')),method:lines(fd.get('method')),notes:lines(fd.get('notes'))};
    recipes[i]=updated;
    await saveOne(id,x,updated,recipes);
  };
}

function showSaveSuccess(message,onContinue){
  dialog.querySelector('#detailContent').innerHTML=`<div class="dialog-card"><p class="eyebrow">RECIPE SAVED</p><h2>Recipe saved</h2><p class="small-note">${esc(message)}</p><div class="detail-actions"><button class="primary" id="saveSuccessContinue">Back to recipes</button></div></div>`;
  dialog.querySelector('#saveSuccessContinue').onclick=onContinue;
}

async function saveOne(id,x,r,recipes){
  const{data:{user}}=await sb.auth.getUser();
  if(!user)return window.ccShowError('Please sign in again.','Sign-in required');
  const prepared=window.ccRecipeInheritance?.applyInheritance?window.ccRecipeInheritance.applyInheritance([r]):[r];
  const p=prepared[0];
  const row={name:clean(p.name),description:clean(p.description)||null,cuisine:clean(p.cuisine)||null,course:clean(p.course)||null,recipe_type:clean(p.recipe_type)||'Dish',servings:clean(p.servings)||null,ingredients:p.ingredients,method:Array.isArray(p.method)?p.method.join('\n'):clean(p.method),personal_notes:Array.isArray(p.notes)?p.notes.join('\n')||null:null,source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'};
  const{error}=await sb.from('cc_recipes').insert([row]);
  if(error)return window.ccShowError(error.message,'Could not save recipe');
  r._saved=true;
  showSaveSuccess(`“${clean(p.name)}” has been added to your recipe collection.`,()=>render(id,x,recipes));
}

async function saveMany(id,x,recipes){
  const{data:{user}}=await sb.auth.getUser();
  if(!user)return window.ccShowError('Please sign in again.','Sign-in required');
  if(!recipes.length)return window.ccShowError('Select at least one recipe.','Nothing selected');
  let prepared=recipes;
  if(window.ccRecipeInheritance?.applyInheritance)prepared=window.ccRecipeInheritance.applyInheritance(recipes);
  const rows=prepared.map(r=>({name:clean(r.name),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Dish',servings:clean(r.servings)||null,ingredients:r.ingredients,method:Array.isArray(r.method)?r.method.join('\n'):clean(r.method),personal_notes:Array.isArray(r.notes)?r.notes.join('\n')||null:null,source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'}));
  const{error}=await sb.from('cc_recipes').insert(rows);
  if(error)return window.ccShowError(error.message,'Could not save recipes');
  const{error:ie}=await sb.from('cc_import_items').update({review_status:'approved',extraction_status:'ready',source_title:`${prepared.length} recipes from ${x.file_name||'import'}`}).eq('id',id);
  if(ie)return window.ccShowError(ie.message,'Could not update import status');
  showSaveSuccess(`${prepared.length} ${prepared.length===1?'recipe has':'recipes have'} been added to your recipe collection.`,()=>{dialog.close();location.reload();});
}

export async function reviewDocxImport(id){
  if(!dialog)return;
  dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note">Reading the DOCX structure.</p></div>';
  dialog.showModal();
  const{data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!x)return window.ccShowError(error?.message||'Import item could not be loaded.','Could not load import');
  try{
    const blob=await loadOriginal(x);
    const html=(await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()})).value||'';
    let recipes=parseDocx(html,x.file_name||'Imported document');
    if(!recipes.length)throw Error('No recipes could be detected in the DOCX.');
    if(window.ccRecipeInheritance?.applyInheritance)recipes=window.ccRecipeInheritance.applyInheritance(recipes);
    const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify({version:11,multiple:recipes.length>1,recipes}),source_title:recipes[0]?.name||x.file_name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);
    if(ue)throw ue;
    render(id,x,recipes);
  }catch(e){window.ccShowError(e?.message||String(e),'Could not process document');}
}

window.ccDocxReview=reviewDocxImport;
