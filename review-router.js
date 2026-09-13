import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu');
const staleTitle=/^(?:serves?\b|makes?\b|yield\b|\d{1,2}:\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
async function loadReviewModules(){
 const [single,multi,fixed,ocr,cleanup]=await Promise.all([
  import('./single-recipe-review.js?v=1.0.6'),
  import('./multi-recipe-review-v3.js?v=3.0.7'),
  import('./import-review-fix.js?v=1.2.21'),
  import('./scanned-pdf-ocr.js?v=1.0.5'),
  import('./import-review-cleanup.js?v=1.0.1')
 ]);
 return {single:single.reviewSingleRecipe,multi:multi.reviewMultiRecipeV3,fixed:fixed.reviewImportFixed,ocr:ocr.ocrScannedPdf,cleanup:cleanup.cleanupImportReview};
}
async function applyFinalUiFix(){try{await import('./import-review-ui-fix.js?v=1.0.1')}catch(e){console.warn('Review UI cleanup unavailable',e)}}
document.addEventListener('click',async event=>{
 const button=event.target.closest('.cc-inbox-review');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 const id=Number(button.dataset.id);
 try{
  const{data:item,error}=await sb.from('cc_import_items').select('extracted_text,file_name,mime_type').eq('id',id).single();if(error)throw error;
  let j={};try{j=JSON.parse(item?.extracted_text||'{}')}catch{}
  const recipeCount=Array.isArray(j.recipes)?j.recipes.length:(j.recipe&&typeof j.recipe==='object'?1:(j.name?1:0));
  const r=recipeCount===1?(j.recipe||j.recipes?.[0]||j):null;
  const pdf=/\.pdf$/i.test(item?.file_name||'')||item?.mime_type==='application/pdf';
  const staleSingle=recipeCount===1&&r&&staleTitle.test(String(r.name||'').trim());
  const weakSingle=recipeCount===1&&r&&(!Array.isArray(r.ingredients)||r.ingredients.length<2||staleSingle);
  const modules=await loadReviewModules();
  if(weakSingle&&pdf)await modules.ocr(id);
  let opened=false;
  if(recipeCount===1&&!staleSingle)opened=await modules.single(id);
  if(!opened&&recipeCount>1)opened=await modules.multi(id);
  if(!opened)await modules.fixed(id);
  await modules.cleanup(id);
  await applyFinalUiFix();
 }catch(e){console.error('Cooking Confidential review error',e);alert(e?.message||String(e)||'Could not open review.')}
},true);
