import { reviewMultiRecipeV3 } from './multi-recipe-review-v3.js?v=3.0.4';
import { reviewSingleRecipe } from './single-recipe-review.js?v=1.0.0';
import { reviewImportFixed } from './import-review-fix.js?v=1.2.18';
import { repairKnownImport } from './import-repair-rules.js?v=1.0.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');

document.addEventListener('click',async event=>{
 const button=event.target.closest('.cc-inbox-review');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const id=Number(button.dataset.id);
 try{
  await repairKnownImport(id);
  const {data:item}=await sb.from('cc_import_items').select('extracted_text').eq('id',id).single();
  let j={};try{j=JSON.parse(item?.extracted_text||'{}')}catch{}
  const single=Array.isArray(j.recipes)?j.recipes.length===1:!!(j.recipe&&typeof j.recipe==='object');
  if(single&&await reviewSingleRecipe(id))return;
  if(await reviewMultiRecipeV3(id))return;
  await reviewImportFixed(id);
 }catch(e){alert(e.message||'Could not open review.')}
},true);
