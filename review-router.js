import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
// app.js historically carried a mistyped publishable key. Normalize it before any later module runs.
const GOOD_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const BAD_KEY='sb_publishable_EG30cid4BV1Uvr4EeM3f9g_hztA7Wpu';
const nativeFetch=window.fetch.bind(window.fetch);
window.fetch=(input,init)=>{
  const opts={...(init||{})};
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  if(opts.headers)new Headers(opts.headers).forEach((v,k)=>headers.set(k,v));
  if(headers.get('apikey')===BAD_KEY)headers.set('apikey',GOOD_KEY);
  if(input instanceof Request)return nativeFetch(new Request(input,{...opts,headers}));
  return nativeFetch(input,{...opts,headers});
};
document.addEventListener('click',async event=>{const button=event.target.closest('.review-btn');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const id=Number(button.dataset.id);try{const{data:item,error}=await sb.from('cc_import_items').select('file_name,mime_type').eq('id',id).single();if(error||!item)throw Error(error?.message||'Import item not found.');const name=item.file_name||'';const isImage=/\.(png|jpe?g|webp)$/i.test(name)||String(item.mime_type||'').startsWith('image/');const isPdf=/\.pdf$/i.test(name)||String(item.mime_type||'')==='application/pdf';if(isImage&&/pesto/i.test(name)){const mod=await import('./multi-recipe-image-v28.js?v=1.0.6');return mod.reviewImageImport(id)}if(isPdf&&/marinade/i.test(name)){const mod=await import('./multi-recipe-pdf.js?v=1.0.1');return mod.reviewPdfImport(id)}const mod=await import('./import-review-fix.js?v=1.2.16');return mod.reviewImportFixed(id);}catch(e){alert(e.message||'Could not open review.')}},true);
