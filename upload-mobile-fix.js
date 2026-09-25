// Lightweight mobile upload handler for iOS/Gmail in-app browsers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let running=false;
function queue(){return document.querySelector('#importQueue')}
function selectedFiles(){return[...(document.querySelector('#fileInput')?.files||[])]}
const MAX_IMAGE_EDGE=2400;
const JPEG_QUALITY=.86;
async function optimizeImageForUpload(file){
  if(!String(file.type||'').startsWith('image/')||['image/gif','image/svg+xml'].includes(String(file.type||'').toLowerCase()))return{file,storedName:file.name,mimeType:file.type||'application/octet-stream'};
  try{
    const bitmap=await createImageBitmap(file),maxEdge=Math.max(bitmap.width,bitmap.height);
    if(maxEdge<=MAX_IMAGE_EDGE&&file.size<=3*1024*1024){bitmap.close();return{file,storedName:file.name,mimeType:file.type||'image/jpeg'}}
    const scale=Math.min(1,MAX_IMAGE_EDGE/maxEdge),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',JPEG_QUALITY));canvas.width=1;canvas.height=1;
    if(!blob||blob.size>=file.size*.95)return{file,storedName:file.name,mimeType:file.type||'image/jpeg'};
    const base=file.name.replace(/\.[^.]+$/,'')||'recipe-image',optimized=new File([blob],base+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
    return{file:optimized,storedName:optimized.name,mimeType:optimized.type};
  }catch(error){console.warn('Cooking Confidential image optimization skipped:',error);return{file,storedName:file.name,mimeType:file.type||'application/octet-stream'}}
}
function message(text){const q=queue();if(!q)return;let el=q.querySelector('.cc-mobile-upload-message');if(!el){el=document.createElement('div');el.className='cc-mobile-upload-message';q.prepend(el)}el.textContent=text}
function setStatus(text){const q=queue(),first=selectedFiles()[0],row=[...q.querySelectorAll('.queue-item')].find(x=>x.querySelector('strong')?.textContent===first?.name);if(row){const span=row.querySelector(':scope > span');if(span)span.textContent=text}}
function authToken(){try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.includes('yiwmtfbqbynimqvwxosu')&&k.endsWith('-auth-token')){const p=JSON.parse(localStorage.getItem(k));if(p?.access_token)return p.access_token;if(p?.currentSession?.access_token)return p.currentSession.access_token}}}catch(e){console.warn('Cooking Confidential session read:',e)}return null}
async function api(path,options={}){const token=authToken();if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');const headers=new Headers(options.headers||{});headers.set('apikey',SUPABASE_PUBLISHABLE_KEY);headers.set('Authorization','Bearer '+token);const response=await fetch(SUPABASE_URL+path,{...options,headers});if(!response.ok){let detail='Request failed ('+response.status+')';try{const b=await response.json();detail=b.message||b.error_description||b.error||detail}catch{}throw new Error(detail)}const text=await response.text();return text?JSON.parse(text):null}
async function uploadObject(path,file){const{error}=await sb.storage.from('cooking-confidential').upload(path,file,{contentType:file.type||'application/octet-stream',cacheControl:'86400',upsert:false});if(error)throw new Error(error.message||'Storage upload failed.')}
async function startImageReview(itemId){message('Upload completed. Starting image recipe detection…');setStatus('Reading image…');const mod=await import('./generic-image-review.js?v=1.0.6');if(typeof mod.reviewImage!=='function')throw new Error('Image recipe reviewer could not be loaded.');await mod.reviewImage(itemId)}
async function uploadSelected(){
  if(running)return;
  const queued=Array.isArray(window.ccImportItems)?window.ccImportItems.filter(x=>x&&x.status==='Queued'&&x.selected):[];
  const files=selectedFiles();
  const items=queued.length?queued:files.map(file=>({file,file_name:file.name,mime_type:file.type||'application/octet-stream',status:'Queued',selected:true}));
  if(!items.length){message('There are no new imports selected. Use Review on an uploaded item below.');return}
  running=true;
  const button=document.querySelector('#uploadAll');
  if(button){button.disabled=true;button.textContent='Uploading…'}
  try{
    const token=authToken();
    if(!token)throw new Error('Your sign-in session is not ready. Please close and reopen Cooking Confidential, then try again.');
    const sessionPayload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))),userId=sessionPayload.sub;
    if(!userId)throw new Error('Could not read your sign-in session.');
    for(const item of items){
      const sourceUrl=String(item.source_url||'').trim();
      const displayName=item.file_name||sourceUrl||'Recipe import';
      setStatusForName(displayName,'Uploading…');
      if(sourceUrl){
        const imports=await api('/rest/v1/cc_imports?select=id',{
          method:'POST',
          headers:{'Content-Type':'application/json','Prefer':'return=representation'},
          body:JSON.stringify({source_type:'social_url',source_url:sourceUrl,original_file_path:null,created_by:userId})
        });
        const importRow=imports?.[0];
        if(!importRow?.id)throw new Error('Could not create the URL import record.');
        const itemsResult=await api('/rest/v1/cc_import_items?select=id',{
          method:'POST',
          headers:{'Content-Type':'application/json','Prefer':'return=representation'},
          body:JSON.stringify({import_id:importRow.id,file_name:displayName,mime_type:'text/url',source_url:sourceUrl,file_path:null,created_by:userId,extraction_status:'pending',review_status:'pending'})
        });
        const itemRow=itemsResult?.[0];
        if(!itemRow?.id)throw new Error('Could not save the recipe URL.');
        item.status='Uploaded';
        setStatusForName(displayName,'Uploaded — review from inbox');
        continue;
      }
      const file=item.file;
      if(!file){item.status='Failed';setStatusForName(displayName,'Failed');continue}
      const imports=await api('/rest/v1/cc_imports?select=id',{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=representation'},
        body:JSON.stringify({source_type:'file',source_url:null,original_file_path:null,created_by:userId})
      });
      const importRow=imports?.[0];
      if(!importRow?.id)throw new Error('Could not create the import record.');
      const optimized=await optimizeImageForUpload(file),safeName=optimized.storedName.replace(/[^a-zA-Z0-9._-]/g,'_'),path=userId+'/'+Date.now()+'-'+safeName;
      await uploadObject('originals/'+path,optimized.file);
      setStatusForName(displayName,'Saving…');
      const itemsResult=await api('/rest/v1/cc_import_items?select=id',{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=representation'},
        body:JSON.stringify({import_id:importRow.id,file_name:file.name,mime_type:optimized.mimeType,source_url:null,file_path:'originals/'+path,created_by:userId,extraction_status:'pending',review_status:'pending'})
      });
      const itemRow=itemsResult?.[0];
      if(!itemRow?.id)throw new Error('Could not save the uploaded recipe.');
      const isImage=/\.(png|jpe?g|webp)$/i.test(file.name)||String(file.type||'').startsWith('image/');
      item.status='Uploaded';
      const multiMode=window.ccImportMode==='multi';
      if(multiMode){
        setStatusForName(displayName,'Extracting multiple recipes…');
        window.localStorage.setItem('ccMultiImport:'+itemRow.id,JSON.stringify({expectedCount:window.ccExpectedRecipeCount||null,fileName:displayName}));
        if(typeof window.ccMultiReview==='function') await window.ccMultiReview(itemRow.id);
        else {
          const mod=await import('./multi-recipe-import.js?v=1.3.0');
          if(typeof mod.reviewMultiImport==='function') await mod.reviewMultiImport(itemRow.id);
          else throw new Error('Multi-recipe importer could not be loaded.');
        }
      }else if(isImage){setStatusForName(displayName,'Reading image…');await startImageReview(itemRow.id)}
      else{setStatusForName(displayName,'Uploaded — review from inbox');message('Upload completed. Open Review in the Import Inbox to extract the recipe.')}
    }
    if(button){button.disabled=false;button.textContent='Upload selected'}
    if(typeof window.ccReloadImportInbox==='function')await window.ccReloadImportInbox();
  }catch(error){
    console.error('Cooking Confidential upload:',error);
    const failed=items.find(x=>x.status!=='Uploaded');
    if(failed)setStatusForName(failed.file_name||failed.source_url||'Recipe import','Failed');
    message('Upload failed: '+(error.message||'Please try again.'));
    if(button){button.disabled=false;button.textContent='Upload selected'}
  }finally{running=false}
}
function setStatusForName(name,text){
  const q=queue();if(!q)return;
  const target=String(name||'');
  const row=[...q.querySelectorAll('.queue-item,.review-item')].find(x=>x.querySelector('strong')?.textContent===target);
  if(row){const span=row.querySelector(':scope > span');if(span)span.textContent=text;else{const small=row.querySelector('small');if(small)small.textContent=text}}
}
function intercept(event){const target=event.target?.closest?.('#uploadAll');if(!target)return;event.preventDefault();event.stopImmediatePropagation();uploadSelected()}
document.addEventListener('pointerup',intercept,true);document.addEventListener('touchend',intercept,true);document.addEventListener('click',intercept,true);
const style=document.createElement('style');style.textContent='.cc-mobile-upload-message{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font-size:14px;line-height:1.4}';document.head.appendChild(style);
