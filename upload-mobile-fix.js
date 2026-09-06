// Lightweight mobile upload handler for iOS/Gmail in-app browsers.
// Deliberately uses fetch + the Supabase persisted session instead of importing
// the Supabase JS bundle. This keeps the Upload action independent of large
// OCR/document modules and avoids an auth getUser() call on the critical path.
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
let running=false;

function queue(){return document.querySelector('#importQueue');}
function selectedFiles(){return [...(document.querySelector('#fileInput')?.files||[])];}
function message(text){
  const q=queue(); if(!q)return;
  let el=q.querySelector('.cc-mobile-upload-message');
  if(!el){el=document.createElement('div');el.className='cc-mobile-upload-message';q.prepend(el);}
  el.textContent=text;
}
function setStatus(text){
  const q=queue();
  const first=selectedFiles()[0];
  const row=[...q.querySelectorAll('.queue-item')].find(x=>x.querySelector('strong')?.textContent===first?.name);
  if(row){const span=row.querySelector(':scope > span');if(span)span.textContent=text;}
}
function authToken(){
  const keys=[];
  try{
    keys.push('sb-yiwmtfbqbynimqvwxosu-auth-token');
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.includes('yiwmtfbqbynimqvwxosu') && k.endsWith('-auth-token')) keys.push(k);
    }
    for(const key of keys){
      const raw=localStorage.getItem(key); if(!raw)continue;
      const parsed=JSON.parse(raw);
      if(parsed?.access_token) return parsed.access_token;
      if(parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
    }
  }catch(error){console.warn('Cooking Confidential session read:',error);}
  return null;
}
async function api(path,options={}){
  const token=authToken();
  if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');
  const headers=new Headers(options.headers||{});
  headers.set('apikey',SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization','Bearer '+token);
  const response=await fetch(SUPABASE_URL+path,{...options,headers});
  if(!response.ok){
    let detail='Request failed ('+response.status+')';
    try{const body=await response.json();detail=body.message||body.error_description||body.error||detail;}catch{}
    throw new Error(detail);
  }
  const text=await response.text();
  return text?JSON.parse(text):null;
}
async function uploadObject(path,file,token){
  const headers=new Headers({apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':file.type||'application/octet-stream'});
  const response=await fetch(SUPABASE_URL+'/storage/v1/object/cooking-confidential/'+path,{method:'POST',headers,body:file});
  if(!response.ok){let detail='Storage upload failed ('+response.status+')';try{const body=await response.json();detail=body.message||body.error||detail;}catch{}throw new Error(detail);}
}
async function invokeExtract(itemId,token){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(SUPABASE_URL+'/functions/v1/cc-import-extract',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({import_item_id:itemId}),signal:controller.signal});
    if(!response.ok)throw new Error('Extraction returned '+response.status);
  }finally{clearTimeout(timer);}
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
    const token=authToken();
    if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');
    const sessionPayload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const userId=sessionPayload.sub;
    if(!userId)throw new Error('Could not read your sign-in session.');
    for(const file of files){
      setStatus('Uploading…');
      const imports=await api('/rest/v1/cc_imports?select=*',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({source_type:'file',source_url:null,original_file_path:null,created_by:userId})});
      const importRow=imports?.[0];
      if(!importRow?.id)throw new Error('Could not create the import record.');
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=userId+'/'+Date.now()+'-'+safeName;
      await uploadObject('originals/'+path,file,token);
      setStatus('Saving…');
      const items=await api('/rest/v1/cc_import_items?select=*',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({import_id:importRow.id,file_name:file.name,mime_type:file.type||'application/octet-stream',source_url:null,original_file_path:'originals/'+path,created_by:userId,extraction_status:'pending',review_status:'pending'})});
      const item=items?.[0];
      if(!item?.id)throw new Error('Could not save the uploaded recipe.');
      setStatus('Extracting…');
      try{
        await invokeExtract(item.id,token);
        setStatus('Ready — review');
        message('Upload and extraction completed. The recipe is ready for review.');
      }catch(extractError){
        console.warn('Cooking Confidential extraction:',extractError);
        setStatus('Uploaded — extraction pending');
        message('Upload completed. Recipe extraction is still pending.');
      }
    }
    if(button){button.disabled=false;button.textContent='Upload all';}
    setTimeout(()=>window.location.reload(),800);
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
  uploadSelected();
}
document.addEventListener('pointerup',intercept,true);
document.addEventListener('touchend',intercept,true);
document.addEventListener('click',intercept,true);
const style=document.createElement('style');
style.textContent='.cc-mobile-upload-message{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font-size:14px;line-height:1.4}';
document.head.appendChild(style);
