import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import './import-review-ui-fix.js?v=1.0.0';

const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const suspiciousTitle=/^(?:\d{1,2}:\d{2}(?:\s*(?:am|pm))?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{1,4})$/i;

async function loadReviewModules(){
  const [single,multi,fixed,ocr]=await Promise.all([
    import('./single-recipe-review.js?v=1.0.6'),
    import('./multi-recipe-review-v3.js?v=3.0.7'),
    import('./import-review-fix.js?v=1.2.20'),
    import('./scanned-pdf-ocr.js?v=1.0.4')
  ]);
  return {single:single.reviewSingleRecipe,multi:multi.reviewMultiRecipeV3,fixed:fixed.reviewImportFixed,ocr:ocr.ocrScannedPdf};
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('.cc-inbox-review');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const id=Number(button.dataset.id);
  try{
    const {data:item,error:itemError}=await sb.from('cc_import_items').select('extracted_text,file_name,mime_type').eq('id',id).single();
    if(itemError)throw itemError;
    let j={};
    try{j=JSON.parse(item?.extracted_text||'{}')}catch{}
    const recipeCount=Array.isArray(j.recipes)?j.recipes.length:(j.recipe&&typeof j.recipe==='object'?1:(j.name?1:0));
    const r=recipeCount===1?(j.recipe||j.recipes?.[0]||j):null;
    const pdf=/\.pdf$/i.test(item?.file_name||'')||item?.mime_type==='application/pdf';
    const weakSingle=recipeCount===1&&r&&(!Array.isArray(r.ingredients)||r.ingredients.length<2||suspiciousTitle.test(String(r.name||'').trim()));
    const modules=await loadReviewModules();
    if(weakSingle&&pdf)await modules.ocr(id);
    if(recipeCount===1&&await modules.single(id))return;
    if(recipeCount>1&&await modules.multi(id))return;
    await modules.fixed(id);
  }catch(e){
    console.error('Cooking Confidential review error',e);
    alert(e?.message||String(e)||'Could not open review.');
  }
},true);
