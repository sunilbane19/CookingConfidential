import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
const GENERIC=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|contents?|index|introduction|notes?|tips?|storage|serving suggestions?)[:.]?$/i;
const UNIT=/\b(?:g|gm|kg|mg|ml|l|oz|lb|lbs|tsp|tbsp|cup|cups|pint|pints|quart|quarts|clove|cloves|slice|slices|piece|pieces|can|cans|packet|packets|tbsp\.|tsp\.)\b/i;
const NUMBER=/\b\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛⅜⅝⅞])?\b/;
// Generic culinary subsection headings. A numeric prefix is common in DOCX files
// ("1. The Marinade", "2. The Sauce") and must not make a new recipe.
const COMPONENT=/^(?:\d+[.)]?\s*)?(?:stage\s*\d+|the\s+(?:ingredients?|marinade|glaze|sauce|rub|dressing|paste|filling|topping|mixture|aromatics?|seasoning|method|steps?|directions?|instructions?|preparation)|for\s+(?:cooking|serving|garnish|the\s+cooking|the\s+garnish))\b/i;
const METHOD_HEADING=/^(?:step\s*\d+\s*[:.-]?|stage\s*\d+\s*[:.-]?)/i;
function isIngredient(raw){const x=clean(raw);if(!x||GENERIC.test(x)||x.length>100)return false;if(/^\d+[.)]\s+/.test(x)&&NUMBER.test(x))return true;if(/\t/.test(String(raw))&&NUMBER.test(x))return true;if(/\s{2,}/.test(String(raw))&&NUMBER.test(x)&&x.length<85)return true;const nums=x.match(/\d+(?:[.,]\d+)?/g)||[];if(nums.length===1&&UNIT.test(x)&&x.length<70&&!/[.!?]{2}/.test(x))return true;if(/\b(?:to taste|as needed|as required)\b/i.test(x)&&x.length<70)return true;return false;}
function isReferenceLine(s){return /^(?:use|using|as|same|above|below|refer to|see|follow|replace|substitute|for)\b/i.test(clean(s));}
function isHeading(s){const x=clean(s);if(!x||GENERIC.test(x)||x.length>70)return false;if(isIngredient(x)||(/\d/.test(x)&&UNIT.test(x)))return false;if(isReferenceLine(x))return false;const w=x.replace(/^\d+[.)]?\s*/,'').split(/\s+/);if(w.length>8)return false;return w.filter(v=>/^[A-Z][A-Za-z'&-]*$/.test(v)).length>=Math.max(1,Math.ceil(w.length*.35));}
function makeRecipe(name){return {name:clean(name),description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:[],method:[],notes:[]};}
function parseSection(nodes,start,end,mode='recipe'){
 const r=makeRecipe(nodes[start]?.text||'');
 const section=nodes.slice(start+1,end);let inIngredients=false,inMethod=false,inNotes=false;
 for(const n of section){const t=n.text;
  if(/^ingredients?(?:\s+list)?\s*:?$/i.test(t)){inIngredients=true;inMethod=false;inNotes=false;continue;}
  if(/^(?:instructions?|method|directions?|preparation|steps?)\s*:?$/i.test(t)){inMethod=true;inIngredients=false;inNotes=false;continue;}
  if(/^notes?|storage|serving suggestions?\s*:?$/i.test(t)){inNotes=true;inIngredients=false;inMethod=false;continue;}
  if(inIngredients){if(COMPONENT.test(t)){r.notes.push(t);continue;}if(isIngredient(n.raw)||isIngredient(t)){r.ingredients.push(clean(String(t).replace(/^\d+[.)]\s*/,'')));continue;}}
  if(inMethod){if(METHOD_HEADING.test(t)||COMPONENT.test(t)){r.method.push(t);continue;}r.method.push(t);continue;}
  if(inNotes){r.notes.push(t);continue;}
 }
 // Some documents omit explicit Method/Instructions labels; recover ingredient lines
 // without turning culinary headings into ingredients.
 if(!r.ingredients.length){for(const n of section)if(!COMPONENT.test(n.text)&&(isIngredient(n.raw)||isIngredient(n.text)))r.ingredients.push(clean(String(n.text).replace(/^\d+[.)]\s*/,'')));}
 r.ingredients=[...new Set(r.ingredients)].filter(Boolean);r.method=[...new Set(r.method)].filter(t=>t&&!/^ingredients?|notes?\s*:/i.test(t));r.notes=[...new Set(r.notes)].filter(Boolean);
 return r;
}
function mergeComponentRecipe(nodes,heads,fileName){
 const componentHeads=heads.filter(i=>COMPONENT.test(nodes[i].text));
 const normalHeads=heads.filter(i=>!COMPONENT.test(nodes[i].text));
 const relevant=[...normalHeads,...componentHeads].sort((a,b)=>a-b);
 const name=normalHeads.length===1?nodes[normalHeads[0]].text:clean(fileName.replace(/\.[^.]+$/,''));
 const merged=makeRecipe(name||'Imported recipe');
 // For one recipe, parse the whole document using the real section labels so that
 // component headings remain visible in Ingredients/Method instead of becoming recipes.
 const first=nodes.findIndex(n=>/^ingredients?\s*:?$/i.test(n.text));
 const method=nodes.findIndex(n=>/^(?:instructions?|method|directions?|preparation|steps?)\s*:?$/i.test(n.text));
 const note=nodes.findIndex(n=>/^notes?|storage|serving suggestions?\s*:?$/i.test(n.text));
 if(first>=0){const ingEnd=method>first?method:nodes.length;for(const n of nodes.slice(first+1,ingEnd))if(!COMPONENT.test(n.text)&&(isIngredient(n.raw)||isIngredient(n.text)))merged.ingredients.push(clean(String(n.text).replace(/^\d+[.)]\s*/,'')));}
 if(method>=0){const end=note>method?note:nodes.length;merged.method=nodes.slice(method+1,end).map(n=>n.text).filter(Boolean);}
 if(note>=0)merged.notes=nodes.slice(note+1).map(n=>n.text).filter(Boolean);
 merged.ingredients=[...new Set(merged.ingredients)].filter(Boolean);merged.method=[...new Set(merged.method)].filter(Boolean);merged.notes=[...new Set(merged.notes)].filter(Boolean);
 return merged;
}
function parseDocx(html,fileName){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const nodes=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')].map(e=>({raw:e.textContent||'',text:clean(e.textContent||''),tag:e.tagName.toLowerCase()})).filter(x=>x.text);
 if(!nodes.length)return[];
 const heads=[];for(let i=0;i<nodes.length;i++)if(isHeading(nodes[i].text))heads.push(i);
 const recipeHeads=heads.filter((idx,pos)=>{const t=nodes[idx].text;return !/(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b20\d{2}\b)/i.test(t)||pos>0;});
 const componentHeads=recipeHeads.filter(i=>COMPONENT.test(nodes[i].text));
 const normalHeads=recipeHeads.filter(i=>!COMPONENT.test(nodes[i].text));
 if(componentHeads.length&&normalHeads.length<=1){const merged=mergeComponentRecipe(nodes,recipeHeads,fileName);if(merged.ingredients.length||merged.method.length)return[merged];}
 const usable=recipeHeads.length?recipeHeads:[0],out=[];
 for(let h=0;h<usable.length;h++){
  const start=usable[h],end=h+1<usable.length?usable[h+1]:nodes.length,r=parseSection(nodes,start,end);
  r.name=clean(r.name)||clean(fileName.replace(/\.[^.]+$/,''));
  if(r.name&&(r.ingredients.length||r.method.length||/above|same process|same method|use the/i.test(r.name)))out.push(r);
 }
 return out;
}
async function loadOriginal(x){const{data:u,error}=await sb.storage.from('cooking-confidential').createSignedUrl(x.file_path,600);if(error||!u?.signedUrl)throw Error(error?.message||'Could not read the original file.');const res=await fetch(u.signedUrl);if(!res.ok)throw Error('Could not load the original file.');return res.blob();}
function render(id,x,recipes){const cards=recipes.map((r,i)=>`<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" checked><span><strong>${esc(r.name)}</strong><small>${r.ingredients.length} ingredients${r.method.length?' · method found':''}</small></span></label><button type="button" class="secondary docx-edit" data-r="${i}">Review</button></article>`).join('');dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes detected</h2><p class="small-note">Review each recipe before saving. Shared-base references are kept for the inheritance step; recipe-specific differences are not discarded.</p><div class="multi-list">${cards}</div><div class="detail-actions"><button class="secondary" id="docxCancel">Cancel</button><button class="primary" id="docxSave">Save selected recipes</button></div>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#docxCancel').onclick=()=>dialog.close();dialog.querySelectorAll('.docx-edit').forEach(b=>b.onclick=()=>editOne(id,x,recipes,Number(b.dataset.r)));dialog.querySelector('#docxSave').onclick=async()=>{const selected=[...dialog.querySelectorAll('input[data-r]:checked')].map(e=>Number(e.dataset.r));await saveMany(id,x,recipes.filter((_,i)=>selected.includes(i)));};}
function editOne(id,x,recipes,i){const r=recipes[i];dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">REVIEW RECIPE ${i+1} OF ${recipes.length}</p><h2>Check before saving</h2><form id="docxOne"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(r.ingredients.join('\n'))}</textarea></label><label>Method / process<textarea name="method" rows="12">${esc(r.method.join('\n'))}</textarea></label><label>Notes / differences<textarea name="notes" rows="7">${esc(r.notes.join('\n'))}</textarea></label><div class="detail-actions"><button type="button" class="secondary" id="docxBack">Back to list</button><button class="primary">Save this recipe</button></div></form>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#docxBack').onclick=()=>render(id,x,recipes);const f=dialog.querySelector('#docxOne');f.onsubmit=e=>{e.preventDefault();const fd=new FormData(f);recipes[i]={...r,name:clean(fd.get('name')),ingredients:lines(fd.get('ingredients')),method:lines(fd.get('method')),notes:lines(fd.get('notes'))};render(id,x,recipes);};}
async function saveMany(id,x,recipes){const{data:{user}}=await sb.auth.getUser();if(!user)return alert('Please sign in again.');if(!recipes.length)return alert('Select at least one recipe.');let prepared=recipes;if(window.ccRecipeInheritance?.applyInheritance)prepared=window.ccRecipeInheritance.applyInheritance(recipes);const rows=prepared.map(r=>({name:clean(r.name),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Dish',servings:clean(r.servings)||null,ingredients:r.ingredients,method:Array.isArray(r.method)?r.method.join('\n'):clean(r.method),personal_notes:Array.isArray(r.notes)?r.notes.join('\n')||null:null,source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'}));const{error}=await sb.from('cc_recipes').insert(rows);if(error)return alert(error.message);const{error:ie}=await sb.from('cc_import_items').update({review_status:'approved',extraction_status:'ready',source_title:`${prepared.length} recipes from ${x.file_name||'import'}`}).eq('id',id);if(ie)return alert(ie.message);dialog.close();location.reload();}
export async function reviewDocxImport(id){if(!dialog)return;dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note">Reading the DOCX structure.</p></div>';dialog.showModal();const{data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!x){dialog.close();return alert(error?.message||'Import item could not be loaded.');}try{const blob=await loadOriginal(x);const html=(await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()})).value||'';let recipes=parseDocx(html,x.file_name||'Imported document');if(!recipes.length)throw Error('No recipes could be detected in the DOCX.');if(window.ccRecipeInheritance?.applyInheritance)recipes=window.ccRecipeInheritance.applyInheritance(recipes);const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify({version:7,multiple:recipes.length>1,recipes}),source_title:recipes[0]?.name||x.file_name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(ue)throw ue;render(id,x,recipes);}catch(e){dialog.close();alert(e?.message||String(e));}}
window.ccDocxReview=reviewDocxImport;
