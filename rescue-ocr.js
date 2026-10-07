// Isolated last-resort OCR rescue. Normal TXT/DOC/URL extraction never uses this path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { parseLabeledRecipeText } from './recipe-structure-parser.js?v=1.0.0';
const URL='https://yiwmtfbqbynimqvwxosu.supabase.co',KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(URL,KEY),dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();
const generic=/^(?:ingredients?|general ingredients?|method|directions?|instructions?|preparation|steps?|notes?|description|servings?|recipe)\s*:?\s*$/i;
const lines=t=>String(t||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
async function item(id){const{data,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!data)throw Error(error?.message||'Import item not found.');return data}
async function blob(x){const p=x.file_path||x.original_file_path;if(!p)throw Error('Original file is unavailable.');const u=await getCachedSignedUrl(sb,'cooking-confidential',p),r=await fetch(u);if(!r.ok)throw Error('Could not load the original upload.');return r.blob()}
async function ocr(b,name,status){const T=await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'),w=await T.createWorker('eng');let out=[];try{if(b.type==='application/pdf'||/\.pdf$/i.test(name)){const p=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');p.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';const pdf=await p.getDocument({data:new Uint8Array(await b.arrayBuffer())}).promise;for(let i=1;i<=pdf.numPages;i++){status('Reading page '+i+' of '+pdf.numPages+'…');const pg=await pdf.getPage(i),v=pg.getViewport({scale:2.5}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;out.push((await w.recognize(c)).data.text||'');c.width=1;c.height=1}}else{status('Reading image…');out.push((await w.recognize(b)).data.text||'')} }finally{await w.terminate()}return out.join('\n')}
function parse(raw){
  const structured=parseLabeledRecipeText(raw);
  if(structured){
    const a=lines(raw);
    const ii=a.findIndex(x=>/^(?:ingredients?|general ingredients?|what you need|ingredient list)\s*:?[ \t]*$/i.test(x));
    const before=ii>0?a.slice(0,ii):[];
    const name=clean(structured.name)||'Imported recipe';
    structured.description=before.filter(x=>x!==name&&!generic.test(x)).join(' ').trim();
    return [structured];
  }
  const a=lines(raw);
  return [{name:a.find(x=>!generic.test(x))||'Imported recipe',description:'',ingredients:[],method:[],notes:[],unassigned:a}];
}
function norm(r){return {...r,name:clean(r.name)||'Imported recipe',description:clean(r.description),ingredients:(r.ingredients||[]).map(clean).filter(Boolean),method:(r.method||[]).map(clean).filter(Boolean),notes:(r.notes||[]).map(clean).filter(Boolean),unassigned:(r.unassigned||[]).map(clean).filter(Boolean)}}
function structuredText(value){
  try{
    const j=typeof value==='string'?JSON.parse(value||'{}'):value;
    if(!j||typeof j!=='object')return '';
    const recipes=j.recipe&&typeof j.recipe==='object'?[j.recipe]:Array.isArray(j.recipes)?j.recipes:[];
    const r=recipes[0]||j;
    const out=[];
    const add=(h,v)=>{if(v==null)return;out.push(h);if(Array.isArray(v))v.forEach(x=>out.push(typeof x==='string'?x:[x?.amount,x?.quantity,x?.unit,x?.name,x?.text].filter(Boolean).join(' ')));else out.push(String(v).replace(/<[^>]+>/g,' '))};
    add('Recipe',r.name);add('Description',r.description);add('Ingredients',r.ingredients||r.recipeIngredient);add('Method',r.method||r.recipeInstructions);add('Notes',r.personal_notes||r.notes);
    return out.join('\n');
  }catch{return ''}
}
async function sourceText(x,status){
  const structured=(()=>{try{const j=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;return String(j?.raw_text||'').trim()||structuredText(x.extracted_text)}catch{return structuredText(x.extracted_text)}})();
  if(structured.trim())return structured;
  const name=String(x.file_name||'').toLowerCase(), b=await blob(x);
  if(/\.docx$/i.test(name)||b.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    status('Reading document text…');
    const out=await mammoth.extractRawText({arrayBuffer:await b.arrayBuffer()});
    return out.value||'';
  }
  if(/^text\//i.test(String(x.mime_type||''))||/\.(txt|md|csv)$/i.test(name)){
    status('Reading document text…');
    return await b.text();
  }
  if(b.type==='application/pdf'||/\.pdf$/i.test(name)||String(x.mime_type||'').startsWith('image/')){
    return await ocr(b,x.file_name||'',status);
  }
  return '';
}
function field(r,k){return k==='name'||k==='description'?clean(r[k]):r[k].join('\n')}
function render(id,x,s){const multi=s.recipes.length>1;const heading=multi?'Review and build your recipe(s)':'Review and build your recipe';const recipeLabel=multi?'Recipe '+1:'Recipe';const unassigned=s.unassigned||[];const other=unassigned.length?'<section class="cc-rescue-unassigned"><div class="cc-rescue-section-head"><strong>Other extracted lines</strong><span>Select lines and move them</span></div><div id="ccRescueLines">'+unassigned.map((v,i)=>'<label class="cc-rescue-line"><input type="checkbox" data-line="'+i+'"><span>'+esc(v)+'</span></label>').join('')+'</div><div class="cc-rescue-move"><select id="ccRescueTarget">'+s.recipes.map((r,i)=>'<option value="'+i+'">Recipe '+(i+1)+': '+esc(r.name)+'</option>').join('')+'</select><select id="ccRescueField"><option value="name">Title</option><option value="description">Description</option><option value="ingredients" selected>Ingredients</option><option value="method">Method</option><option value="notes">Notes</option></select><button class="secondary" id="ccRescueMoveBtn">Move selected</button></div></section>':'';dialog.querySelector('#detailContent').innerHTML='<button class="close" id="ccRescueClose">×</button><p class="eyebrow">RESCUE EXTRACTION</p><h2>'+heading+'</h2><p class="small-note">Last-resort OCR. Edit freely and move any genuinely unassigned lines into the correct field before saving.</p>'+(multi?'<div class="cc-rescue-toolbar"><span>'+s.recipes.length+' recipes</span></div>':'')+'<div id="ccRescueRecipes">'+s.recipes.map((r,i)=>'<article class="cc-rescue-recipe" data-r="'+i+'"><div class="cc-rescue-recipe-head"><strong>'+(multi?'Recipe '+(i+1):'Recipe')+'</strong>'+(multi?'<button class="secondary cc-rescue-remove" data-r="'+i+'">Remove</button>':'')+'</div><label>Recipe name<input data-f="name" value="'+esc(r.name)+'"></label><label>Description<textarea data-f="description" rows="3">'+esc(r.description)+'</textarea></label><label>Ingredients<textarea data-f="ingredients" rows="7">'+esc(field(r,'ingredients'))+'</textarea></label><label>Method<textarea data-f="method" rows="7">'+esc(field(r,'method'))+'</textarea></label><label>My notes<textarea data-f="notes" rows="4">'+esc(field(r,'notes'))+'</textarea></label></article>').join('')+'</div>'+other+'<div class="detail-actions"><button class="secondary" id="ccRescueCancel">Cancel</button><button class="primary" id="ccRescueSave">Save '+(multi?'recipe(s)':'recipe')+'</button></div>';dialog.showModal();
 const sync=()=>dialog.querySelectorAll('.cc-rescue-recipe').forEach(c=>{const r=s.recipes[+c.dataset.r];r.name=clean(c.querySelector('[data-f=name]').value);r.description=clean(c.querySelector('[data-f=description]').value);['ingredients','method','notes'].forEach(k=>r[k]=c.querySelector('[data-f='+k+']').value.split(/\n+/).map(clean).filter(Boolean))});
 dialog.querySelectorAll('[data-f]').forEach(e=>e.addEventListener('input',sync));
 
 // iOS/Gmail in-app browsers can fail to synthesize a click for dynamically
 // inserted dialog buttons. Bind both click and touchend, with a guard so the
 // same action is never executed twice.
 const bindRescueAction=(button,handler)=>{
   if(!button)return;
   button.type='button';
   let handled=false;
   const run=e=>{
     if(e){e.preventDefault();e.stopPropagation();}
     if(handled)return;
     handled=true;
     Promise.resolve(handler(e)).finally(()=>setTimeout(()=>{handled=false},700));
   };
   button.addEventListener('click',run);
   button.addEventListener('touchend',e=>{
     e.preventDefault();
     e.stopPropagation();
     run(e);
   },{passive:false});
 };
 
 dialog.querySelectorAll('.cc-rescue-remove').forEach(b=>bindRescueAction(b,()=>{sync();s.recipes.splice(+b.dataset.r,1);if(!s.recipes.length)s.recipes.push({name:'New recipe',description:'',ingredients:[],method:[],notes:[],unassigned:[]});render(id,x,s)}));
 bindRescueAction(dialog.querySelector('#ccRescueMoveBtn'),()=>{sync();const ri=+dialog.querySelector('#ccRescueTarget').value,f=dialog.querySelector('#ccRescueField').value,ids=[...dialog.querySelectorAll('[data-line]:checked')].map(e=>+e.dataset.line).sort((a,b)=>b-a),vals=ids.map(i=>s.unassigned[i]).reverse();if(!ids.length)return;if(f==='name')s.recipes[ri].name=vals.join(' ');else if(f==='description')s.recipes[ri].description=vals.join(' ');else s.recipes[ri][f].push(...vals);ids.forEach(i=>s.unassigned.splice(i,1));render(id,x,s)});
 bindRescueAction(dialog.querySelector('#ccRescueClose'),()=>dialog.close());
 bindRescueAction(dialog.querySelector('#ccRescueCancel'),()=>dialog.close());
 bindRescueAction(dialog.querySelector('#ccRescueSave'),async()=>{
   sync();
   const valid=s.recipes.filter(r=>r.name&&(r.ingredients.length||r.method.length));
   if(!valid.length)return window.ccShowError?.('Create at least one recipe with a title and recipe content.','Nothing to save')||alert('Nothing to save');
   const{data:{user}}=await sb.auth.getUser();
   if(!user)return window.ccShowError?.('Please sign in again.','Sign-in required')||alert('Please sign in again.');
   const rows=valid.map(r=>({name:r.name,description:r.description||null,ingredients:{html:r.ingredients.map(v=>'<div>'+esc(v)+'</div>').join('')},method:r.method.join('\n'),personal_notes:r.notes.join('\n')||null,source_type:'file',source_title:x.file_name||'OCR rescue',created_by:user.id,visibility:'private',original_file_path:x.file_path||null,original_file_name:x.file_name||null,original_mime_type:x.mime_type||null}));
   const saveButton=dialog.querySelector('#ccRescueSave');
   if(saveButton){saveButton.disabled=true;saveButton.textContent='Saving…';}
   const q=await sb.from('cc_recipes').insert(rows);
   if(q.error){
     if(saveButton){saveButton.disabled=false;saveButton.textContent='Save recipe';}
     return window.ccShowError?.(q.error.message,'Could not save recipes')||alert(q.error.message);
   }
   await sb.from('cc_import_items').delete().eq('id',id);
   dialog.close();
   await window.ccReloadRecipes?.();
   await window.ccReloadImportInbox?.();
 });
}
export async function rescueImport(id){const x=await item(id);dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">RESCUE EXTRACTION</p><h2>Making a best-effort recovery…</h2><p class="small-note" id="ccRescueStatus">Trying the original extracted text first.</p></div>';dialog.showModal();const st=t=>{const e=document.querySelector('#ccRescueStatus');if(e)e.textContent=t};let raw='';try{raw=await sourceText(x,st)}catch(e){console.warn('Cooking Confidential universal rescue source read:',e)}if(!raw.trim())raw=String(x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');const rs=parse(raw).map(norm);const recipes=rs.length?rs:[norm({name:String(x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),description:'',ingredients:[],method:[],notes:[],unassigned:[]})];const un=recipes.flatMap(r=>r.unassigned||[]);render(id,x,{recipes,unassigned:un})}
