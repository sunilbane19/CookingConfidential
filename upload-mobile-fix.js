import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mobile upload handler. It deliberately bypasses app.js uploadAllImports,
// whose initial auth getUser() can stall in iOS/Gmail in-app browsers.
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let running=false;
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

function queue(){return document.querySelector('#importQueue');}
function selectedFiles(){return [...(document.querySelector('#fileInput')?.files||[])];}
function setStatus(text){
  const q=queue();
  const row=[...q.querySelectorAll('.queue-item')].find(x=>x.querySelector('strong')?.textContent===selectedFiles()[0]?.name);
  if(row){const span=row.querySelector(':scope > span');if(span)span.textContent=text;}
}
function message(text){
  const q=queue(); if(!q)return;
  let el=q.querySelector('.cc-mobile-upload-message');
  if(!el){el=document.createElement('div');el.className='cc-mobile-upload-message';q.prepend(el);}
  el.textContent=text;
}

async function uploadSelected(){
  if(running)return;
  const files=selectedFiles();
  if(!files.length){message('Please choose a recipe file first.');return;}
  running=true;
  const button=document.querySelector('#uploadAll');
  if(button){button.disabled=true;button.textContent='Uploading…';}
  message('Uploading recipe file…');
  try{
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    if(sessionError||!session?.user)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');
    for(const file of files){
      setStatus('Uploading…');
      const importResult=await supabase.from('cc_imports').insert({source_type:'file',source_url:null,original_file_path:null,created_by:session.user.id}).select().single();
      if(importResult.error)throw new Error(importResult.error.message);
      const path=session.user.id+'/'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const upload=await supabase.storage.from('cooking-confidential').upload('originals/'+path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
      if(upload.error)throw new Error(upload.error.message);
      setStatus('Saving…');
      const itemResult=await supabase.from('cc_import_items').insert({import_id:importResult.data.id,file_name:file.name,mime_type:file.type||'application/octet-stream',source_url:null,original_file_path:'originals/'+path,created_by:session.user.id,extraction_status:'pending',review_status:'pending'}).select().single();
      if(itemResult.error)throw new Error(itemResult.error.message);
      setStatus('Extracting…');
      const fx=await supabase.functions.invoke('cc-import-extract',{body:{import_item_id:itemResult.data.id}});
      if(fx.error){setStatus('Uploaded — extraction pending');message('Upload completed. Recipe extraction is still pending.');}
      else{setStatus('Ready — review');message('Upload and extraction completed. The recipe is ready for review.');}
    }
    if(button){button.disabled=false;button.textContent='Upload all';}
    // Reload only after the upload pipeline completes so the normal Import Inbox
    // can display the newly-created item and its Review action.
    setTimeout(()=>window.location.reload(),600);
  }catch(error){
    console.error('Cooking Confidential mobile upload:',error);
    setStatus('Failed');
    message('Upload failed: '+(error.message||'Please try again.'));
    if(button){button.disabled=false;button.textContent='Upload all';}
  }finally{running=false;}
}

function intercept(event){
  const target=event.target?.closest?.('#uploadAll');
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(event.type==='pointerup' && event.pointerType!=='touch')return;
  uploadSelected();
}

document.addEventListener('pointerup',intercept,true);
document.addEventListener('touchend',intercept,true);
document.addEventListener('click',event=>{
  const target=event.target?.closest?.('#uploadAll');
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  uploadSelected();
},true);

const style=document.createElement('style');
style.textContent='.cc-mobile-upload-message{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font-size:14px;line-height:1.4}';
document.head.appendChild(style);
