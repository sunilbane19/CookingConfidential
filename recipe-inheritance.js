import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';

const dialog=document.querySelector('#detailDialog');
let preparationPromise=null;
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();

function referenceText(recipe){return [...(recipe.method||[]),...(recipe.notes||[]),recipe.description||''].join(' ')}
function hasBaseReference(recipe){const t=referenceText(recipe);return /\b(same process|same method|same .* dough|same .* recipe|use (?:the )?above dough|as described (?:above|in the .* recipe)|as above)\b/i.test(t)}
function baseIndex(recipes,index){const t=referenceText(recipes[index]);for(let j=index-1;j>=0;j--){const n=clean(recipes[j].name);if(n&&new RegExp(`\\b${n.replace(/[.*+?^${}()|[\\]\\]/g,'\\\\$&')}\\b`,'i').test(t))return j}return index>0?index-1:-1}
function isReferenceLine(line){return /\b(same process|same method|same .* dough|use (?:the )?above dough|as described (?:above|in the .* recipe)|as above)\b/i.test(line)}
function applyInheritance(recipes){
 const out=recipes.map(r=>({...r,ingredients:Array.isArray(r.ingredients)?[...r.ingredients]:[],method:Array.isArray(r.method)?[...r.method]:[],notes:Array.isArray(r.notes)?[...r.notes]:[]}));
 for(let i=1;i<out.length;i++){
  const r=out[i];if(!hasBaseReference(r))continue;const j=baseIndex(out,i);if(j<0)continue;const base=out[j];const source=referenceText(r);
  if(!r.ingredients.length&&base.ingredients.length){r.ingredients=[...base.ingredients];r.notes.unshift(`Base recipe: ${base.name}. Ingredients inherited because this recipe refers to the same base.`)}
  if(/\b(same process|same method|as described (?:above|in the .* recipe)|as above)\b/i.test(source)&&base.method.length){r.method=[...base.method,...r.method.filter(x=>!isReferenceLine(x))];r.notes.unshift(`Base method: ${base.name}. The source states that the same process/method is used, followed by recipe-specific differences.`)}
  if(/\b(same .* dough|use (?:the )?above dough|same dough as above)\b/i.test(source)&&base.ingredients.length&&!r.notes.some(n=>/Ingredients inherited/.test(n))){if(!r.ingredients.length)r.ingredients=[...base.ingredients];r.notes.unshift(`Base dough: ${base.name}. Recipe-specific dough differences are retained separately.`)}
  r.description=r.description?`${r.description} Base: ${base.name}; recipe-specific differences are retained in Notes.`:`Based on ${base.name}; recipe-specific differences are retained in Notes.`;
 }
 return out;
}
async function prepareLatestImport(){
 if(preparationPromise)return preparationPromise;
 preparationPromise=(async()=>{
  const {data,error}=await sb.from('cc_import_items').select('id,extracted_text,created_at').eq('extraction_status','ready').eq('review_status','pending').order('created_at',{ascending:false}).limit(1);
  if(error||!data?.[0]?.extracted_text)return null;const item=data[0];let payload;try{payload=typeof item.extracted_text==='string'?JSON.parse(item.extracted_text):item.extracted_text}catch{return null}
  if(!payload?.multiple||!Array.isArray(payload.recipes)||payload.recipes.length<2)return null;const recipes=applyInheritance(payload.recipes);const changed=JSON.stringify(recipes)!==JSON.stringify(payload.recipes);
  if(changed)await sb.from('cc_import_items').update({extracted_text:JSON.stringify({...payload,version:6,inheritance:true,recipes})}).eq('id',item.id);
  return {id:item.id,recipes,changed};
 })().finally(()=>{preparationPromise=null});return preparationPromise;
}
function updateCards(recipes){if(!dialog)return;[...dialog.querySelectorAll('.multi-recipe-card')].forEach((card,i)=>{const r=recipes[i];if(!r)return;const small=card.querySelector('small');if(small)small.textContent=`${r.ingredients.length} extracted lines${r.method.length?' · method found':''}`})}
const observer=new MutationObserver(()=>{if(!dialog?.open||!dialog.querySelector('.multi-recipe-card')||dialog.dataset.ccInheritancePrepared==='working')return;dialog.dataset.ccInheritancePrepared='working';prepareLatestImport().then(result=>{if(result)updateCards(result.recipes);dialog.dataset.ccInheritancePrepared=result?'1':'0'}).catch(()=>{dialog.dataset.ccInheritancePrepared='0'})});
if(dialog)observer.observe(dialog,{childList:true,subtree:true});
window.ccRecipeInheritance={prepareLatestImport,applyInheritance};
