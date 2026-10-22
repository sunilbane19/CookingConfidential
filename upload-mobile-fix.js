// Lightweight mobile upload handler for iOS/Gmail in-app browsers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let running=false;
function queue(){return document.querySelector('#importQueue')}
function message(text){const q=queue();if(!q)return;let el=q.querySelector('.cc-mobile-upload-message');if(!el){el=document.createElement('div');el.className='cc-mobile-upload-message';q.prepend(el)}el.textContent=text}
function authToken(){try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.includes('yiwmtfbqbynimqvwxosu')&&k.endsWith('-auth-token')){const p=JSON.parse(localStorage.getItem(k));if(p?.access_token)return p.access_token;if(p?.currentSession?.access_token)return p.currentSession.access_token}}}catch(e){console.warn('Cooking Confidential session read:',e)}return null}
async function api(path,options={}){const token=authToken();if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');const headers=new Headers(options.headers||{});headers.set('apikey',SUPABASE_PUBLISHABLE_KEY);headers.set('Authorization','Bearer '+token);const response=await fetch(SUPABASE_URL+path,{...options,headers});if(!response.ok){let detail='Request failed ('+response.status+')';try{const b=await response.json();detail=b.message||b.error_description||b.error||detail}catch{}throw new Error(detail)}const text=await response.text();return text?JSON.parse(text):null}
async function uploadObject(path,file){const{error}=await sb.storage.from('cooking-confidential').upload(path,file,{contentType:file.type||'application/octet-stream',cacheControl:'86400',upsert:false});if(error)throw new Error(error.message||'Storage upload failed.')}
async function uploadSelected(){
  if(running)return;
  const queued=Array.isArray(window.ccImportItems)?window.ccImportItems.filter(x=>x&&x.status==='Queued'&&x.selected):[];
  // Upload only explicitly checked queue items. Never fall back to every file in the picker.
  const items=queued;
  if(!items.length){message('There are no new imports selected. Use Review on an uploaded item below.');return}
  running=true;
  const multiReviewIds=[];
  const button=document.querySelector('#uploadAll');
  if(button){button.disabled=true;button.textContent='Uploading…'}
  try{
    const token=authToken();
    if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');
    const sessionPayload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))),userId=sessionPayload.sub;
    if(!userId)throw new Error('Could not read your sign-in session.');
    for(const item of items){
      const displayName=item.file_name||'Recipe import';
      setStatusForName(displayName,'Uploading…');
      const file=item.file;
      if(!file){item.status='Failed';setStatusForName(displayName,'Failed');continue}
      // Persistent duplicate guard: the temporary queue guard cannot catch a file
      // that has already reached the Import Inbox.
      const duplicateRows=await api('/rest/v1/cc_import_items?select=id&created_by=eq.'+encodeURIComponent(userId)+'&file_name=eq.'+encodeURIComponent(file.name)+'&limit=1');
      if(Array.isArray(duplicateRows)&&duplicateRows.length){
        item.status='Skipped';
        setStatusForName(displayName,'Skipped — already in Import Inbox');
        message(displayName+' is already in the Import Inbox. It was not uploaded again.');
        continue;
      }
      const imports=await api('/rest/v1/cc_imports?select=id',{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=representation'},
        body:JSON.stringify({source_type:'file',source_url:null,original_file_path:null,created_by:userId})
      });
      const importRow=imports?.[0];
      if(!importRow?.id)throw new Error('Could not create the import record.');
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=userId+'/'+Date.now()+'-'+safeName;
      await uploadObject('originals/'+path,file);
      setStatusForName(displayName,'Saving…');
      const itemsResult=await api('/rest/v1/cc_import_items?select=id',{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=representation'},
        body:JSON.stringify({import_id:importRow.id,file_name:file.name,mime_type:file.type||'application/octet-stream',source_url:null,file_path:'originals/'+path,created_by:userId,extraction_status:'pending',review_status:'pending'})
      });
      const itemRow=itemsResult?.[0];
      if(!itemRow?.id)throw new Error('Could not save the uploaded recipe.');
      item.dbId=Number(itemRow.id);
      item.importId=Number(importRow.id);
      item.status='Uploaded';
      const multiMode=window.ccImportMode==='multi';
      if(multiMode){
        setStatusForName(displayName,'Extracting multiple recipes…');
        window.localStorage.setItem('ccMultiImport:'+itemRow.id,JSON.stringify({expectedCount:window.ccExpectedRecipeCount||null,fileName:displayName,createdAt:new Date().toISOString()}));
        if(typeof window.ccMultiReview!=='function'){
          await import('./multi-recipe-import.js?v=1.3.10');
        }
        if(typeof window.ccMultiReview!=='function') throw new Error('Multi-recipe importer could not be loaded.');
        await window.ccMultiReview(itemRow.id,false);
        multiReviewIds.push(Number(itemRow.id));
        setStatusForName(displayName,'Uploaded');
      }else{setStatusForName(displayName,'Uploaded');message('Upload completed. Open Review in the Import Inbox to extract the recipe.')}
    }
    // All selected multi-recipe files are extracted independently before opening
    // a single review dialog. This prevents the last file from overwriting the
    // review dialog while earlier files are still being processed.
    if(multiReviewIds.length&&typeof window.ccMultiReview==='function'){
      await window.ccMultiReview(multiReviewIds[0],true);
    }
    // Uploaded files have now moved into the persistent Import Inbox.
    // Remove successful items from this temporary upload queue so they are not shown twice.
    if(Array.isArray(window.ccImportItems)){
      const remaining=window.ccImportItems.filter(x=>x.status!=='Uploaded');
      window.ccImportItems.length=0;
      window.ccImportItems.push(...remaining);
      window.ccImportItems.forEach(x=>{if(x.status==='Queued')x.selected=false});
      const fileInput=document.querySelector('#fileInput');
      if(fileInput)fileInput.value='';
      if(typeof window.ccRenderImportQueue==='function')window.ccRenderImportQueue();
      else window.dispatchEvent(new CustomEvent('cc:import-queue-changed'));
    }
    if(button){button.disabled=false;button.textContent='Upload selected'}
    if(typeof window.ccReloadImportInbox==='function')await window.ccReloadImportInbox();
  }catch(error){
    console.error('Cooking Confidential upload:',error);
    const failed=items.find(x=>x.status!=='Uploaded');
    if(failed)setStatusForName(failed.file_name||'Recipe import','Failed');
    message('Upload failed: '+(error.message||'Please try again.'));
    if(button){button.disabled=false;button.textContent='Upload selected'}
  }finally{running=false}
}
function setStatusForName(name,text){
  const q=queue();if(!q)return;
  const target=String(name||'');
  const item=(window.ccImportItems||[]).find(x=>String(x.file_name||'')===target);
  const displayText=(text==='Uploaded'&&item?.dbId)?('Uploaded · Item ID '+item.dbId):text;
  const row=[...q.querySelectorAll('.queue-item,.review-item')].find(x=>x.querySelector('strong')?.textContent===target);
  if(row){const span=row.querySelector(':scope > span');if(span)span.textContent=displayText;else{const small=row.querySelector('small');if(small)small.textContent=displayText}}
}
function intercept(event){const target=event.target?.closest?.('#uploadAll');if(!target)return;event.preventDefault();event.stopImmediatePropagation();uploadSelected()}
document.addEventListener('pointerup',intercept,true);document.addEventListener('touchend',intercept,true);document.addEventListener('click',intercept,true);
const style=document.createElement('style');style.textContent='.cc-mobile-upload-message{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font-size:14px;line-height:1.4}';document.head.appendChild(style);
