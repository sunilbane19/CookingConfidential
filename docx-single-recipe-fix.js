import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';

// DOCX imports must use the shared structural parser before the legacy multi-recipe
// renderer gets a chance to classify culinary component headings as recipes.
async function rerouteDocx(id){
  const{data:item,error}=await sb.from('cc_import_items').select('file_name').eq('id',id).single();
  if(error||!item||!/\.docx$/i.test(item.file_name||''))return false;
  const mod=await import('./docx-import-review.js?v=1.0.6');
  if(typeof mod.reviewDocxImport!=='function')throw Error('DOCX review module could not be loaded.');
  await mod.reviewDocxImport(id);
  return true;
}

let wrapped=false;
const timer=setInterval(()=>{
  if(wrapped||typeof window.ccMultiReview!=='function')return;
  wrapped=true;clearInterval(timer);
  const original=window.ccMultiReview;
  window.ccMultiReview=async id=>{
    try{
      // If this is a DOCX, do not call the legacy renderer at all.
      if(await rerouteDocx(id))return;
    }catch(e){console.error('Cooking Confidential DOCX parser reroute:',e);}
    return original(id);
  };
},50);

// Also cover callers that render the multi-recipe dialog directly without the global hook.
// This is limited to the newest pending DOCX import and is only a fallback.
let observed=false;
const observer=new MutationObserver(async()=>{
  if(observed)return;
  const dialog=document.querySelector('#detailDialog');
  const content=dialog?.querySelector('#detailContent');
  if(!dialog?.open||!content)return;
  const heading=content.querySelector('h2');
  if(!heading||!/\b\d+\s+recipes?\s+detected\b/i.test(heading.textContent||''))return;
  observed=true;
  try{
    const{data:item,error}=await sb.from('cc_import_items').select('id,file_name').eq('extraction_status','ready').eq('review_status','pending').ilike('file_name','%.docx').order('id',{ascending:false}).limit(1).maybeSingle();
    if(!error&&item)await rerouteDocx(item.id);
  }catch(e){console.error('Cooking Confidential DOCX dialog reroute:',e);}
});
observer.observe(document.body,{subtree:true,childList:true});
