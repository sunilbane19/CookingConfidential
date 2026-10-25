// Isolated last-resort OCR rescue. Normal TXT/DOC/URL extraction never uses this path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { parseLabeledRecipeText } from './recipe-structure-parser.js?v=1.1.0';
const URL='https://yiwmtfbqbynimqvwxosu.supabase.co',KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(URL,KEY),dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s*\[(?:\s*\d+\s*(?:[,;]\s*\d+\s*)+)\]\s*/g,' ').replace(/\s+/g,' ').trim();
const generic=/^(?:ingredients?|general ingredients?|method|directions?|instructions?|preparation|steps?|notes?|description|servings?|recipe)\s*:?\s*$/i;
const lines=t=>String(t||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
async function item(id){const{data,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!data)throw Error(error?.message||'Import item not found.');return data}
async function blob(x){const p=x.file_path||x.original_file_path;if(!p)throw Error('Original file is unavailable.');const u=await getCachedSignedUrl(sb,'cooking-confidential',p),r=await fetch(u);if(!r.ok)throw Error('Could not load the original upload.');return r.blob()}
async function ocr(b,name,status,traceId){
  const started=performance.now(),out=[];
  console.info('[CC image trace]',traceId,'rescue:ocr:start',{name,blobType:b.type,blobBytes:b.size,reader:'tesseract-esm-v2'});
  const {createWorker}=await import('https://esm.sh/tesseract.js@5');
  if(typeof createWorker!=='function')throw Error('Tesseract createWorker export is unavailable.');
  const w=await createWorker('eng');
  try{
    if(b.type==='application/pdf'||/\.pdf$/i.test(name)){
      const p=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');p.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      const pdf=await p.getDocument({data:new Uint8Array(await b.arrayBuffer())}).promise;
      console.info('[CC image trace]',traceId,'rescue:pdf-pages',{pages:pdf.numPages});
      for(let i=1;i<=pdf.numPages;i++){status('Reading page '+i+' of '+pdf.numPages+'…');const pg=await pdf.getPage(i),v=pg.getViewport({scale:2.5}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const result=await w.recognize(c);out.push(result.data.text||'');console.info('[CC image trace]',traceId,'rescue:ocr-page',{page:i,confidence:result.data?.confidence,text:result.data?.text||''});c.width=1;c.height=1}
    }else{status('Reading image…');const result=await w.recognize(b);out.push(result.data.text||'');console.info('[CC image trace]',traceId,'rescue:ocr-image-result',{confidence:result.data?.confidence,text:result.data?.text||''})}
  }finally{await w.terminate()}
  console.info('[CC image trace]',traceId,'rescue:ocr:done',{durationMs:Math.round(performance.now()-started),outputLength:out.join('\n').length});
  return out.join('\n')
}
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
let ccRescueDocstreamPromise;
async function loadRescueDocstream(){
  if(window.officeParser&&typeof window.officeParser.parseOffice==='function')return window.officeParser;
  if(!ccRescueDocstreamPromise){
    ccRescueDocstreamPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/gh/joseespana/docstream@master/docs/dist/officeparser.browser.js';
      script.onload=()=>window.officeParser&&typeof window.officeParser.parseOffice==='function'?resolve(window.officeParser):reject(Error('Docstream loaded but the browser parser API was not available.'));
      script.onerror=()=>reject(Error('Could not load Docstream to read the original legacy .doc file.'));
      document.head.appendChild(script);
    }).catch(e=>{ccRescueDocstreamPromise=null;throw e});
  }
  return ccRescueDocstreamPromise;
}
function normalizeLegacyDocText(value){
  let t=String(value||'').replace(/\r/g,'').replace(/\u0000/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  t=t.replace(/^\s*#+\s*/gm,'').replace(/\*\*(.*?)\*\*/g,'$1');
  t=t.replace(/HYPERLINK\s+"[^"]*"/gi,'').replace(/https?:\/\/\S+/gi,'');
  const headings='General Ingredients|Ingredients|Description|Method|Directions|Instructions|Preparation|Steps|Notes|Servings|Contents|Recipe';
  t=t.replace(new RegExp('\\s+(?=(?:'+headings+')\\s*:?)','gi'),'\n');
  t=t.replace(new RegExp('(^|\\n)\\s*('+headings+')\\s*:?\\s*','gi'),'$1$2:\n');
  t=t.replace(/^\s*(?:Contents|Recipe)\s*:\s*$/gim,'');
  t=t.replace(/([A-Za-z])(?=\d+\s+(?:cups?|tbsp|tsp|grams?|gms?|kg|ml|cloves?|medium|large|small|inch|ounces?|oz|lbs?|pounds?)\b)/gi,'$1\n');
  t=t.replace(/\s+(?=\d{1,2}\.\s+[A-Z])/g,'\n');
  return t.split('\n').map(s=>s.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n').trim();
}
async function sourceText(x,status){
  const name=String(x.file_name||'').toLowerCase();
  if(/\.doc$/i.test(name)){
    status('Reading original Word document with Docstream…');
    const b=await blob(x),parser=await loadRescueDocstream(),ast=await parser.parseOffice(await b.arrayBuffer());
    const md=typeof ast?.toMarkdown==='function'?String(ast.toMarkdown()||''):'';
    const plain=typeof ast?.toText==='function'?String(ast.toText()||''):'';
    const full=normalizeLegacyDocText(md.trim()?md:plain);
    console.info('[CC image trace]',status.traceId||'CCIMG-unknown','rescue:legacy-docstream-result',{format:md.trim()?'markdown':'plain-text-fallback',length:full.length,preview:full.slice(0,500)});
    if(full.length>name.replace(/\.doc$/i,'').length+20)return full;
    throw Error('Docstream returned only a title or too little text from the original .doc.');
  }
  const structured=(()=>{try{const j=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;return String(j?.raw_text||'').trim()||structuredText(x.extracted_text)}catch{return structuredText(x.extracted_text)}})();
  if(structured.trim())return structured;
  const b=await blob(x);
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
    console.info('[CC image trace]',status.traceId||'CCIMG-unknown','rescue:source-text:ocr-selected',{file_name:x.file_name,blobType:b.type,mime_type:x.mime_type});
    return await ocr(b,x.file_name||'',status,status.traceId);
  }
  return '';
}
function field(r,k){return k==='name'||k==='description'?clean(r[k]):r[k].join('\n')}
function mapRescueTextToFields(raw,title){
 const source=String(raw||'').replace(/\r/g,'').replace(/\u0000/g,' ');
 const lines=source.split('\n').map(v=>v.replace(/[ \t]+/g,' ').trim());
 const normHeading=v=>v.replace(/^#+\s*/,'').replace(/[：:]\s*$/,'').trim().toLowerCase();
 const isHeading=(line,kind)=>{
  const t=normHeading(line);
  if(kind==='ingredients')return /^(?:general\s+)?ingredients?(?:\s+(?:list|section|needed|required))?$/.test(t)||/^(?:what you need|ingredient list|ingredients list)$/.test(t);
  if(kind==='method')return /^(?:step[- ]by[- ]step\s+)?(?:cooking\s+)?(?:instructions?|method|directions?|preparation|steps?)(?:\s+(?:for cooking|to follow))?$/.test(t)||/^procedure$/.test(t)||/^how to make(?:\s+.+)?$/.test(t);
  if(kind==='notes')return /^(?:my\s+)?(?:notes?|tips?|storage|serving suggestions?)$/.test(t);
  if(kind==='description')return /^(?:description|introduction|about this recipe)$/.test(t);
  return false;
 };
 const cleanTitle=String(title||'').trim();
 const titleLine=lines.findIndex(l=>l&&l.toLowerCase()===cleanTitle.toLowerCase());
 let ing=lines.findIndex(l=>isHeading(l,'ingredients'));
 let method=lines.findIndex((l,i)=>i>(ing>=0?ing:-1)&&isHeading(l,'method'));
 let notes=lines.findIndex((l,i)=>i>(method>=0?method:ing>=0?ing:-1)&&isHeading(l,'notes'));
 const looksLikeIngredient=l=>/^(?:[-•*]\s*)?(?:(?:\d+(?:[./]\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(?:-\s*)?)(?:g|kg|mg|ml|l|lit(?:re|er)s?|tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|pounds?|lb|cloves?|pieces?|pinch(?:es)?|slices?|large|small|medium|whole|cans?|packets?|sprigs?|bunch(?:es)?|to taste)?\b/i.test(l)||/^(?:[-•*]\s*)?(?:a pinch|a handful|salt and pepper|oil for)/i.test(l);
 const looksLikeStep=l=>/^(?:(?:step\s*)?\d{1,2}[.)]|[-•]\s*(?:first|then|next|finally)\b)/i.test(l);
 if(ing<0){
  let runStart=-1,run=0,bestStart=-1,best=0;
  for(let i=0;i<lines.length;i++){
   if(looksLikeIngredient(lines[i])){if(run===0)runStart=i;run++;if(run>best){best=run;bestStart=runStart}}
   else {run=0;runStart=-1}
  }
  if(best>=3)ing=bestStart;
 }
 if(method<0&&ing>=0){
  for(let i=ing+1;i<lines.length;i++){
   if(isHeading(lines[i],'method')||looksLikeStep(lines[i])){method=i;break}
  }
 }
 if(notes<0)notes=lines.findIndex((l,i)=>i>(method>=0?method:ing>=0?ing:-1)&&isHeading(l,'notes'));
 const descriptionHeading=lines.findIndex(l=>isHeading(l,'description'));
 const sectionStarts=[ing,method,notes].filter(i=>i>=0).sort((a,b)=>a-b);
 const descEnd=sectionStarts.length?sectionStarts[0]:lines.length;
 const descStart=descriptionHeading>=0&&descriptionHeading<descEnd?descriptionHeading+1:0;
 const description=lines.slice(descStart,descEnd).filter((l,i)=>l&&l.toLowerCase()!==cleanTitle.toLowerCase()&&!(i===0&&titleLine===0)).join('\n').trim();
 const ingredientEnd=method>=0?method:(notes>=0?notes:lines.length);
 const ingredients=ing>=0?lines.slice(ing+(isHeading(lines[ing],'ingredients')?1:0),ingredientEnd).filter(Boolean):[];
 const methodEnd=notes>=0?notes:lines.length;
 const instructions=method>=0?lines.slice(method+(isHeading(lines[method],'method')?1:0),methodEnd).filter(Boolean):[];
 if(instructions.length>1&&instructions.every(l=>/^(?:step\s*)?\d{1,2}[.)]\s*/i.test(l))){const numbered=instructions.map((line,index)=>({line,index,number:Number((line.match(/^(?:step\s*)?(\d{1,2})[.)]/i)||[])[1])}));if(new Set(numbered.map(x=>x.number)).size===numbered.length&&numbered.some((x,i)=>i&&x.number<numbered[i-1].number))instructions.splice(0,instructions.length,...numbered.sort((a,b)=>a.number-b.number||a.index-b.index).map(x=>x.line));}
 const extraNotes=notes>=0?lines.slice(notes+1).filter(Boolean):[];
 const classified=new Set();
 if(titleLine>=0)classified.add(titleLine);
 for(let i=0;i<lines.length;i++){
  if(i===descriptionHeading||i===ing||i===method||i===notes)classified.add(i);
  if(ing>=0&&i>ing&&i<ingredientEnd)classified.add(i);
  if(method>=0&&i>method&&i<methodEnd)classified.add(i);
  if(notes>=0&&i>notes)classified.add(i);
  if(i<descEnd&&i!==titleLine&&(descriptionHeading<0||i>descriptionHeading))classified.add(i);
 }
 const unassigned=lines.filter((l,i)=>l&&!classified.has(i)&&i!==titleLine);
 const notesOut=[...extraNotes];
 if(unassigned.length)notesOut.push('Other recovered text to review:',...unassigned);
 return {name:cleanTitle||String(lines[0]||'Imported recipe'),description,ingredients:ingredients.join('\n'),method:instructions.join('\n'),notes:notesOut.join('\n'),rawText:source};
}
function render(id,x,s){
 const raw=s.raw||'';
 const title=s.title||String(x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
 const proposed=s.fields||mapRescueTextToFields(raw,title);
 dialog.querySelector('#detailContent').innerHTML=
 '<button class="close" type="button" id="ccRescueClose">×</button>'+
 '<p class="eyebrow">RESCUE EDITOR</p>'+
 '<h2>Recover your recipe</h2>'+
 '<p class="small-note">Review the proposed fields first. Nothing is saved here. Correct the title, description, ingredients and method, then transfer them to the normal New Recipe Editor. The original extracted text remains available below as a fallback.</p>'+
 '<label>Recipe Title<input id="ccRescueTitle" value="'+esc(proposed.name)+'"></label>'+
 '<label style="display:block;margin-top:12px">Description<textarea id="ccRescueDescription" rows="4" style="width:100%;min-height:90px;resize:vertical">'+esc(proposed.description)+'</textarea></label>'+
 '<label style="display:block;margin-top:12px">Ingredients<textarea id="ccRescueIngredients" rows="7" style="width:100%;min-height:140px;resize:vertical">'+esc(proposed.ingredients)+'</textarea></label>'+
 '<label style="display:block;margin-top:12px">Method / instructions<textarea id="ccRescueMethod" rows="8" style="width:100%;min-height:160px;resize:vertical">'+esc(proposed.method)+'</textarea></label>'+
 '<label style="display:block;margin-top:12px">Notes / other recovered text<textarea id="ccRescueNotes" rows="3" style="width:100%;min-height:75px;resize:vertical">'+esc(proposed.notes)+'</textarea></label>'+
 '<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Original extracted text (kept for recovery)</summary><label style="display:block;margin-top:10px">Raw text<textarea id="ccRescueRaw" rows="16" style="width:100%;min-height:300px;resize:vertical">'+esc(raw)+'</textarea></label><button class="secondary" id="ccRescueRebuild" type="button" style="margin-top:8px">Rebuild proposed fields from raw text</button></details>'+
 '<div class="detail-actions"><button class="secondary" id="ccRescueCancel" type="button">Cancel</button><button class="secondary" id="ccRescueCopy" type="button">Copy raw text</button><button class="primary" id="ccRescueOpenEditor" type="button">Transfer fields to New Recipe Editor</button></div>';
 dialog.showModal();
 const bind=(sel,fn)=>{const b=dialog.querySelector(sel);if(!b)return;b.onclick=async e=>{e.preventDefault();e.stopPropagation();await fn()};};
 bind('#ccRescueClose',()=>dialog.close());
 bind('#ccRescueCancel',()=>dialog.close());
 bind('#ccRescueCopy',async()=>{const ta=dialog.querySelector('#ccRescueRaw');try{await navigator.clipboard.writeText(ta.value);const b=dialog.querySelector('#ccRescueCopy');b.textContent='Copied';setTimeout(()=>b.textContent='Copy raw text',1200)}catch{ta.focus();ta.select()}});
 bind('#ccRescueRebuild',()=>{
  const mapped=mapRescueTextToFields(dialog.querySelector('#ccRescueRaw').value,dialog.querySelector('#ccRescueTitle').value);
  dialog.querySelector('#ccRescueDescription').value=mapped.description;
  dialog.querySelector('#ccRescueIngredients').value=mapped.ingredients;
  dialog.querySelector('#ccRescueMethod').value=mapped.method;
  dialog.querySelector('#ccRescueNotes').value=mapped.notes;
 });
 bind('#ccRescueOpenEditor',()=>{
  const mapped={name:dialog.querySelector('#ccRescueTitle').value.trim(),__ccRescueReturn:true,description:dialog.querySelector('#ccRescueDescription').value,ingredients:dialog.querySelector('#ccRescueIngredients').value,method:dialog.querySelector('#ccRescueMethod').value,notes:dialog.querySelector('#ccRescueNotes').value,rawText:dialog.querySelector('#ccRescueRaw').value};
  if(!mapped.name){window.ccShowError?.('Please enter a recipe title before continuing.','Recipe title required');return}
  if(typeof window.ccOpenNewRecipeEditor!=='function'){window.ccShowError?.('The New Recipe Editor could not be opened. Your recovery text is still available here.','Could not continue');return}
  console.info('[CC rescue mapping] edited preview ready for side-by-side editor',{description:mapped.description.length,ingredientLines:mapped.ingredients.split('\n').filter(Boolean).length,methodLines:mapped.method.split('\n').filter(Boolean).length,notes:mapped.notes.length});
  const child=window.open(window.location.href,'_blank');
  if(child){
   const handler=event=>{
    if(event.origin!==window.location.origin||event.source!==child||event.data?.type!=='cc-rescue-editor-ready')return;
    window.removeEventListener('message',handler);
    child.postMessage({type:'cc-rescue-open-editor',fields:mapped},window.location.origin);
   };
   window.addEventListener('message',handler);
   return;
  }
  window.ccResumeRescueEditor=()=>{window.ccResumeRescueEditor=null;render(id,x,{title:mapped.name,raw:mapped.rawText,fields:mapped})};
  dialog.close();
  return window.ccOpenNewRecipeEditor(mapped);
 });
}
export async function rescueImport(id){const traceId='CCIMG-'+id+'-'+Date.now().toString(36);console.warn('[CC image trace]',traceId,'rescueImport:start',{id,at:new Date().toISOString()});const x=await item(id);console.info('[CC image trace]',traceId,'rescueImport:item-loaded',{id:x.id,file_name:x.file_name,mime_type:x.mime_type,file_path:x.file_path,original_file_path:x.original_file_path,extractedTextLength:String(x.extracted_text||'').length});dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">RESCUE EXTRACTION</p><h2>Making a best-effort recovery…</h2><p class="small-note" id="ccRescueStatus">Trying the original extracted text first.</p></div>';dialog.showModal();const st=t=>{const e=document.querySelector('#ccRescueStatus');if(e)e.textContent=t};st.traceId=traceId;let raw='';try{raw=await sourceText(x,st)}catch(e){console.warn('Cooking Confidential universal rescue source read:',e)}console.info('[CC image trace]',traceId,'rescue:raw-text-before-parse',{length:raw.length,text:raw});
if(!raw.trim())raw=String(x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
const rs=parse(raw).map(norm);
console.info('[CC image trace]',traceId,'rescue:parsed-structure',{recipes:rs});
// Rescue is a fallback UI, not the destination for text that parsed cleanly.
// If the labelled-text parser found a complete recipe, hand it to the standard editor.
const candidate=rs[0];
if(candidate&&candidate.ingredients.length>=3&&candidate.method.join(' ').replace(/<[^>]+>/g,' ').trim().length>=35&&typeof window.ccShowStructuredImport==='function'){
  console.info('[CC image trace]',traceId,'rescue:valid-structure-route-normal-editor',{ingredients:candidate.ingredients.length,methodLength:candidate.method.join(' ').length});
  const routed=await window.ccShowStructuredImport(id,x,candidate);
  if(routed)return;
}
const title=candidate?.name||String(x.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');render(id,x,{title,raw})}
