import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';

function showDocxReviewError(message){
  const dialog=document.querySelector('#detailDialog');
  const content=dialog?.querySelector('#detailContent');
  if(!dialog||!content){alert(message||'Could not open the DOCX review.');return;}
  content.innerHTML=`<button class="close" type="button" aria-label="Close">×</button><p class="eyebrow">DOCX REVIEW</p><h2>We couldn’t open this document</h2><p class="small-note">The recipe review screen could not be loaded. Please close this message and try the document again.</p><p class="small-note" style="margin-top:12px"><strong>Details:</strong> ${String(message||'Unknown error.').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}</p><div class="detail-actions"><button type="button" class="primary" id="docxErrorClose">Close</button></div>`;
  content.querySelector('.close').onclick=()=>dialog.close();
  content.querySelector('#docxErrorClose').onclick=()=>dialog.close();
  if(!dialog.open)dialog.showModal();
}

document.addEventListener('click',async event=>{const button=event.target?.closest?.('.cc-inbox-review');if(!button||button.dataset.image==='1'||button.dataset.docx!=='1')return;const id=Number(button.dataset.id);if(!id)return;event.preventDefault();event.stopImmediatePropagation();try{const mod=await import('./docx-import-review.js?v=1.0.5');if(typeof mod.reviewDocxImport!=='function')throw Error('The DOCX review module is missing or incomplete.');await mod.reviewDocxImport(id);}catch(e){document.querySelector('#detailDialog')?.close();showDocxReviewError(e?.message||'Could not open the DOCX review.');}},true);
