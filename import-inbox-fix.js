import { supabase as sb } from './supabase-client-legacy.js?v=1.0.0';
const importDialog=document.querySelector('#importDialog'),importInbox=document.querySelector('#importInbox');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));let busy=false;
async function openInbox(){if(!importDialog||!importInbox)return;importDialog.showModal();loadInbox()}
async function loadInbox(){if(busy)return;busy=true;importInbox.innerHTML='<div class="empty compact">Loading import inbox…</div>';try{const{data,error}=await sb.from('cc_import_items').select('*').order('created_at',{ascending:false}).limit(50);if(error)throw Error(error.message||'Could not load the import inbox.');renderInbox(data||[])}catch(e){importInbox.innerHTML=`<div class="empty compact">${esc(e.message||'Could not load the import inbox.')}</div>`}finally{busy=false}}
function statusText(x){return `${x.extraction_status||'pending'} · ${x.review_status||'pending'}`}
function renderInbox(rows){
 const head=rows.length?'<div class="queue-head import-inbox-head"><label class="import-select-all"><input id="ccSelectAllImports" type="checkbox"> <strong>Select all</strong></label><span>'+rows.length+' items</span><button type="button" class="secondary danger" id="ccDeleteSelected" disabled>Delete selected</button></div>':'';
 importInbox.innerHTML=(rows.length?head:'<div class="empty compact">No imports yet.</div>')+rows.map(x=>{
   const name=x.file_name||x.source_url||'Import';
   const image=/\.(png|jpe?g|webp)$/i.test(name)||String(x.mime_type||'').startsWith('image/');
   let multi=false;
   try{const j=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;multi=j?.multiple===true&&Array.isArray(j?.recipes)}catch(_){multi=false}
   if(!multi){try{multi=!!localStorage.getItem('ccMultiImport:'+x.id)}catch(_){}} 
   return '<article class="review-item"><label class="import-select-item"><input class="cc-import-select" type="checkbox" value="'+x.id+'"><span class="import-select-mark" aria-hidden="true"></span></label><div class="review-item-main"><strong title="'+esc(name)+'">'+esc(name)+'</strong><small>'+esc(statusText(x))+'</small></div><div class="review-item-actions"><button class="secondary review-btn cc-inbox-review" data-id="'+x.id+'" data-image="'+(image?'1':'0')+'" data-multi="'+(multi?'1':'0')+'" type="button">Review</button><button class="secondary danger cc-delete-import" data-id="'+x.id+'" type="button">Delete</button></div></article>'
 }).join('');
 const updateBulk=()=>{
   const boxes=[...importInbox.querySelectorAll('.cc-import-select')], selected=boxes.filter(b=>b.checked).length;
   const all=boxes.length>0&&selected===boxes.length;
   const sa=importInbox.querySelector('#ccSelectAllImports'); if(sa){sa.checked=all;sa.indeterminate=selected>0&&!all}
   const del=importInbox.querySelector('#ccDeleteSelected'); if(del){del.disabled=selected===0;del.textContent=selected?('Delete selected ('+selected+')'):'Delete selected'}
 };
 importInbox.querySelectorAll('.cc-import-select').forEach(b=>b.addEventListener('change',updateBulk));
 importInbox.querySelector('#ccSelectAllImports')?.addEventListener('change',e=>{
   importInbox.querySelectorAll('.cc-import-select').forEach(b=>b.checked=e.target.checked);updateBulk();
 });
 importInbox.querySelector('#ccDeleteSelected')?.addEventListener('click',async()=>{
   const ids=[...importInbox.querySelectorAll('.cc-import-select:checked')].map(b=>Number(b.value)).filter(Number.isFinite);
   if(ids.length)await deleteImports(ids);
 });
 importInbox.querySelectorAll('.cc-delete-import').forEach(b=>b.onclick=()=>deleteImport(Number(b.dataset.id)));
 importInbox.querySelectorAll('.cc-inbox-review').forEach(b=>b.onclick=()=>review(Number(b.dataset.id),b.dataset.image==='1',b.dataset.multi==='1'));
 updateBulk();
}
async function review(id,isImage,isMulti=false){try{
  // Every review launched from the Import Inbox should return to the Inbox when closed.
  window.ccReturnToImportInbox=true;
  window.ccImportReviewActive=true;
  // Multi-recipe must take precedence over the legacy Rubs-specific image reviewer.
  // The Rubs reviewer is only for the dedicated Rubs workflow, not arbitrary PNG/JPG uploads.
  if(isMulti){
    await import('./multi-recipe-import.js?v=1.3.16');
    if(typeof window.ccMultiReview!=='function')throw Error('Multi-recipe reviewer could not be loaded.');
    return window.ccMultiReview(id,true);
  }
  if(isImage){
    try{
      const mod=await import('./multi-recipe-import.js?v=1.3.16');
      if(typeof mod.reviewImageImport==='function')return mod.reviewImageImport(id);
      if(typeof window.ccMultiReview==='function')return window.ccMultiReview(id,true);
    }catch(imageError){
      console.warn('Generic image review failed; using universal rescue:',imageError);
      const rescue=await import('./rescue-ocr.js?v=1.2.2');
      return rescue.rescueImport(id);
    }
    throw Error('Image reviewer could not be loaded.');
  }
  const mod=await import('./import-review-fix.js?v=1.4.66');
  if(typeof mod.reviewImportFixed!=='function')throw Error('Review module could not be loaded.');
  return mod.reviewImportFixed(id);
}catch(e){console.error('Cooking Confidential review:',e);return window.ccShowError?.(e?.message||'Could not open review.','Review could not be opened')||alert(e?.message||'Could not open review.')}}
function ensureDeleteDialog(){let d=document.querySelector('#ccDeleteDialog');if(d)return d;d=document.createElement('dialog');d.id='ccDeleteDialog';d.innerHTML='<form method="dialog" class="dialog-card cc-delete-dialog"><p class="eyebrow">REMOVE IMPORT</p><h2>Delete this upload?</h2><p class="small-note">This removes the uploaded file from the Import Inbox. It does not delete any recipe already saved from it.</p><div class="dialog-actions"><button class="secondary" value="cancel">Cancel</button><button class="secondary danger" value="delete">Delete</button></div></form>';document.body.appendChild(d);return d}
function confirmDeleteImport(){return new Promise(resolve=>{const d=ensureDeleteDialog();let settled=false;const finish=value=>{if(settled)return;settled=true;d.removeEventListener('close',onClose);resolve(value)},onClose=()=>finish(d.returnValue==='delete');d.addEventListener('close',onClose);d.showModal()})}
async function deleteImport(id){const d=ensureDeleteDialog();d.querySelector('.eyebrow').textContent='REMOVE IMPORT';d.querySelector('h2').textContent='Delete this upload?';d.querySelector('.small-note').textContent='This removes the uploaded file from the Import Inbox. It does not delete any recipe already saved from it.';if(!(await confirmDeleteImport()))return;try{const{data:item,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!item)throw Error(error?.message||'Import item not found.');const path=item.file_path||item.original_file_path;if(path){const{error:storageError}=await sb.storage.from('cooking-confidential').remove([path]);if(storageError)throw Error(storageError.message)}const{error:deleteError}=await sb.from('cc_import_items').delete().eq('id',id);if(deleteError)throw Error(deleteError.message);if(item.import_id){const{data:remaining,error:remainingError}=await sb.from('cc_import_items').select('id').eq('import_id',item.import_id).limit(1);if(remainingError)throw Error(remainingError.message);if(!remaining?.length)await sb.from('cc_imports').delete().eq('id',item.import_id)}if(Array.isArray(window.ccImportItems)){window.ccImportItems=window.ccImportItems.filter(x=>Number(x?.dbId)!==Number(id));window.dispatchEvent(new CustomEvent('cc:import-queue-changed'));}await loadInbox()}catch(e){alert('Could not delete upload: '+(e.message||'Please try again.'))}}
async function deleteImports(ids){
 const unique=[...new Set(ids.map(Number).filter(Number.isFinite))];
 if(!unique.length)return;
 const d=ensureDeleteDialog();
 d.querySelector('.eyebrow').textContent='REMOVE IMPORTS';
 d.querySelector('h2').textContent='Delete '+unique.length+' selected upload'+(unique.length===1?'?':'s?');
 d.querySelector('.small-note').textContent='This removes the selected uploads from the Import Inbox. It does not delete any recipe already saved from them.';
 if(!(await confirmDeleteImport()))return;
 try{
   const{data:items,error}=await sb.from('cc_import_items').select('*').in('id',unique);
   if(error)throw Error(error.message||'Could not load selected uploads.');
   for(const item of items||[]){
     const path=item.file_path||item.original_file_path;
     if(path){const{error:storageError}=await sb.storage.from('cooking-confidential').remove([path]);if(storageError)throw Error(storageError.message)}
     const{error:deleteError}=await sb.from('cc_import_items').delete().eq('id',item.id);
     if(deleteError)throw Error(deleteError.message);
     if(item.import_id){
       const{data:remaining,error:remainingError}=await sb.from('cc_import_items').select('id').eq('import_id',item.import_id).limit(1);
       if(remainingError)throw Error(remainingError.message);
       if(!remaining?.length)await sb.from('cc_imports').delete().eq('id',item.import_id);
     }
   }
   if(Array.isArray(window.ccImportItems)){
     const gone=new Set(unique);
     window.ccImportItems=window.ccImportItems.filter(x=>!gone.has(Number(x?.dbId)));
     window.dispatchEvent(new CustomEvent('cc:import-queue-changed'));
   }
   await loadInbox();
 }catch(e){alert('Could not delete selected uploads: '+(e.message||'Please try again.'))}
}
document.addEventListener('click',event=>{const b=event.target?.closest?.('#importBtn');if(!b)return;event.preventDefault();event.stopImmediatePropagation();openInbox()},true);
const detailDialog=document.querySelector('#detailDialog');if(detailDialog)detailDialog.addEventListener('close',()=>{if(window.ccReturnToImportInbox){window.ccReturnToImportInbox=false;setTimeout(()=>{if(importDialog&&!importDialog.open)importDialog.showModal();loadInbox()},80);return}if(importDialog?.open)setTimeout(loadInbox,150)});window.ccReloadImportInbox=loadInbox;
