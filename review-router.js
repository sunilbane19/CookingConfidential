import { reviewMultiRecipeV3 } from './multi-recipe-review-v3.js?v=3.0.5';
import { reviewSingleRecipe } from './single-recipe-review.js?v=1.0.2';
import { reviewImportFixed } from './import-review-fix.js?v=1.2.18';
import { ocrScannedPdf } from './scanned-pdf-ocr.js?v=1.0.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const badTitle=/^(?:\d{1,2}:\d{2}(?:\s*(?:am|pm))?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|follow|swadish)$/i;

document.addEventListener('click',async event=>{
 const button=event.target.closest('.cc-inbox-review');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const id=Number(button.dataset.id);
 try{
  const {data:item}=await sb.from('cc_import_items').select('extracted_text,file_name,mime_type').eq('id',id).single();
  let j={};try{j=JSON.parse(item?.extracted_text||'{}')}catch{}
  const single=Array.isArray(j.recipes)?j.recipes.length===1:!!(j.recipe&&typeof j.recipe==='object');
  const r=single?(j.recipe||j.recipes?.[0]||j):null;
  const pdf=/\.pdf$/i.test(item?.file_name||'')||item?.mime_type==='application/pdf';
  if(single&&pdf&&r&&(badTitle.test(String(r.name||'').trim())||!Array.isArray(r.ingredients)||r.ingredients.length<2)){
   await ocrScannedPdf(id);
  }
  if(single&&await reviewSingleRecipe(id))return;
  if(await reviewMultiRecipeV3(id))return;
  await reviewImportFixed(id);
 }catch(e){alert(e.message||'Could not open review.')}
},true);
