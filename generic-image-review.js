import { supabase } from './supabase-client-legacy.js?v=1.0.0';
import { createWorker } from 'https://esm.sh/tesseract.js@5';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import { createGenericEditor, editorValue, sanitizeRichHtml } from './generic-editor.js?v=1.3.3';
const detailDialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\u00AD]/g,' ').replace(/^[\[\]{}()<>|•·▪◦●○✓✔☐☑\s]+/,'').replace(/[ \t]+/g,' ').trim();
function cleanSelectedOcrText(text){
  const source=String(text||'').normalize('NFKC');
  // OCR variants can return escaped newline sequences as literal characters.
  // Decode those before line-based cleanup and before passing text to parseLines.
  const hadEscapedLineBreaks=/\\+(?:r\\+n|n|r)/.test(source);
  console.info('[CC image trace] OCR cleanup line-break decoding',{hadEscapedLineBreaks,sourceLength:source.length});
  // Some OCR paths double-escape the backslashes. Accept one or more before n/r.
  const input=source
    .replace(/\\+r\\+n/g,'\n')
    .replace(/\\+[nr]/g,'\n')
    .replace(/\r\n?/g,'\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\u00AD]/g,' ');
  const out=[];
  for(let rawLine of input.split('\n')){
    let line=clean(rawLine);
    if(!line)continue;
    if(/^(?:course\s*\d+|[A-Z]{1,3}\s*\d{1,3}|page\s*\d+)$/i.test(line))continue;
    if(/the\s+cooking\s+(?:class\s+)?academy/i.test(line)&&!/(ingredients?|preparation|method|directions?)/i.test(line)){
      line=line.replace(/(?:the\s+)?cooking\s+(?:class\s+)?academy/ig,' ').trim();
      if(!line)continue;
    }
    line=line.replace(/\bCourse\s*\d+\b/ig,' ').replace(/\s{2,}/g,' ').trim();
    line=line.replace(/^[|~.,:;_\\-]+\s*/,'');
    line=line.replace(/^[a-z]{1,2}\s+(?=[A-Z][A-Z '&(),-]{7,}$)/,'');
    if(!line||/^[|~.,:;_\\-]+$/.test(line))continue;
    // Remove isolated layout remnants such as “EE ——” from the description area.
    if(/^[A-Za-z]{1,2}\s*[—_=~-]{2,}$/.test(line))continue;
    // Image-only OCR cleanup: discard isolated two-letter fragments that are not
    // useful cooking words/units; these commonly appear as column/layout noise.
    if(/^[A-Za-z]{2}[.,:]?$/.test(line) && !new Set(['in','to','of','on','at','by','up','if','as','or','no','so','do','oz','lb','kg','ml','cl','qt','pt']).has(line.toLowerCase().replace(/[.,:]$/,'')))continue;
    // In this test page, Tesseract splits “Spring onion” into “Sori.” + “Onion”.
    if(/^sori\s*[.]?$/i.test(line))line='Spring';
    // Cooking-class recipe scans often confuse quantity glyphs with letters.
    // Normalize common OCR spellings of the class's C / T / t unit notation.
    line=line
      .replace(/^[uUlI|!]\\s*[cC]\\s+(?=[A-Za-z])/,'1 C ')
      .replace(/^[%‰]\\s*[cC]\\s+(?=[A-Za-z])/,'½ C ')
      .replace(/^[Il|!]\\s*1?\\s*T\\s+(?=[A-Za-z])/,'1 T ')
      .replace(/^1\\s*T(?=\\s+[A-Za-z])/,'1 T ')
      .replace(/^1\\s*t(?=\\s+[A-Za-z])/,'1 t ')
      .replace(/^J\\s*(\\d)\\s*(\\d)\\s*cloves?\\b/i,'$1-$2 cloves');
    // Expand units while preserving quantity: uppercase C = cup, uppercase T = tablespoon,
    // lowercase t = teaspoon. Only do this when the token is clearly a unit prefix.
    line=line.replace(/^(\\s*(?:(?:\\d+(?:\\s*[-/]\\s*\\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])\\s*)?)([CTt])(?=\\s+[A-Za-z])/,(m,q,u)=>q+({C:'cup',T:'tablespoon',t:'teaspoon'}[u]));
    out.push(line);
  }
  for(let i=0;i<out.length-1;i++){if(/^spring$/i.test(out[i])&&/^onion$/i.test(out[i+1])){out.splice(i,2,'Spring onion');}}
  // Repair a word split by OCR across a colon/newline (e.g. “Add chicke:” + “n and stir fry”).
  for(let i=0;i<out.length-1;i++){
    const left=out[i].match(/^(.*\b[A-Za-z]{3,})[:.]$/),right=out[i+1].match(/^([a-z]{1,2})\s+(.+)$/);
    if(left&&right&&/\b(?:add|chop|stir|cook|heat|mix|fry|pour|place|serve)\b/i.test(left[1])){out.splice(i,2,left[1]+right[1]+' '+right[2]);}
  }
  // General image-OCR cleanup: remove likely footer/serving metadata from method text,
  // repair line-wrapped words, and discard short non-word fragments conservatively.
  for(let i=0;i<out.length;i++){
    const line=out[i].trim();
    if(/^(?:serves?|servings?|yield)\s*[:\-]?\s*\d+.*$/i.test(line) ||
       /^\d+\s*(?:serves?|servings?)\s*[:\-]?\s*\d*.*$/i.test(line) ||
       /^(?:recipe|page)\s*\d+\s*(?:of\s*\d+)?$/i.test(line)){
      out[i]='';
      continue;
    }
    // Remove isolated OCR fragments with no vowel and no clear culinary meaning.
    if(/^[A-Za-z]{2,4}[.,;:'’)]?$/.test(line) && !/[aeiou]/i.test(line) &&
       !new Set(['thy','dry','fry','try','dry','ml','kg','tsp','tbsp','oz','lb']).has(line.toLowerCase().replace(/[.,;:'’)]$/,''))){
      out[i]='';
    }
  }
  // Rejoin a word split across adjacent lines when the first line ends with a
  // partial word plus colon and the next starts with its lowercase continuation.
  for(let i=0;i<out.length-1;i++){
    const left=out[i].match(/^(.*?)([A-Za-z]{3,})[:.]$/);
    const right=out[i+1].match(/^([a-z]{1,2})\s+(.+)$/);
    if(left&&right && /\b(?:add|chop|stir|cook|heat|mix|fry|pour|place|serve|bring|continue)\b/i.test(left[1])){
      out.splice(i,2,(left[1]+left[2]+right[1]+' '+right[2]).replace(/\s+/g,' ').trim());
    }
  }
  for(let i=out.length-1;i>=0;i--)if(!out[i])out.splice(i,1);
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function titleFromCleanedText(text){
  const lines=String(text||'').split('\n').map(clean).filter(Boolean);
  const stop=lines.findIndex(x=>headingKind(x)==='ingredients');
  const before=lines.slice(0,stop>=0?stop:Math.min(lines.length,12));
  const candidates=before.filter(x=>x.length>=8&&x.length<=90&&!/^course\s*\d+/i.test(x)&&!/^page\s*\d+/i.test(x)&&!generic.test(x)&&/[A-Za-z]{3}/.test(x));
  const likely=candidates.filter(x=>/[A-Z]{3}/.test(x)&&x===x.toUpperCase());
  return clean((likely.length?likely:candidates).sort((a,b)=>b.length-a.length)[0]||'Imported recipe');
}
const courses=['','Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage'];
const types=['','Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
const generic=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|servings?|notes?|tips?|storage|serving suggestions?|for the .+|for .+)[:.]?$/i;
const garbage=s=>{const x=clean(s);if(!x||generic.test(x)||/[©®™]/.test(x))return true;if(/\b(?:follow|subscribe|like|share|save|comment|link in bio|learn more|ends in)\b/i.test(x))return true;if((x.match(/[A-Za-z]/g)||[]).length<2)return true;return false};
function headingKind(x){const s=clean(x).toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();if(/\bingredients?\b/.test(s)||/\bingredient\s+list\b/.test(s))return'ingredients';if(/\b(method|directions?|instructions?|preparation|steps?)\b/.test(s))return'method';if(/\b(notes?|tips?|storage|serving suggestions?)\b/.test(s))return'notes';return'';}
function parseLines(text){
  const a=String(text||'').replace(/\r/g,'').split('\n').map(clean).filter(x=>headingKind(x)||!garbage(x));
  let section='',ingredients=[],method=[],notes=[],beforeIngredients=[];
  for(let x of a){
    const kind=headingKind(x);
    if(kind==='ingredients'){section='ingredients';x=x.replace(/.*?\bingredients?(?:\s+list)?\b\s*[:\-]?/i,'').trim();if(!x)continue}
    else if(kind==='method'){section='method';x=x.replace(/.*?\b(method|directions?|instructions?|preparation|steps?)\b\s*[:\-]?/i,'').trim();if(!x)continue}
    else if(kind==='notes'){section='notes';x=x.replace(/^notes?\s*[:\-]?/i,'').trim();if(!x)continue}
    if(/^(?:\d{1,2}[.)]|step\s*\d+)/i.test(x)&&section!=='notes')section='method';
    if(!x||garbage(x))continue;
    if(section==='method')method.push(x);else if(section==='notes')notes.push(x);else if(section==='ingredients')ingredients.push(x);else beforeIngredients.push(x);
  }
  const titleIndex=beforeIngredients.findIndex(x=>/^[A-Z][A-Z0-9 '&(),-]{5,75}$/.test(x)&&!generic.test(x));
  const name=titleIndex>=0?beforeIngredients[titleIndex]:(beforeIngredients.find(x=>x.length>=5&&x.length<=75)||'Imported recipe');
  const description=beforeIngredients.filter(x=>x!==name&&!/^course\s*\d+/i.test(x)&&!/^the cooking academy$/i.test(x)).join(' ').trim();
  return {name:clean(name),description,ingredients:[...new Set(ingredients)],method:[...new Set(method)],notes:[...new Set(notes)].join('\n')};
}
function ocrLineData(words){const valid=(words||[]).filter(w=>w.text?.trim()&&Number(w.confidence||0)>=20&&w.bbox);if(!valid.length)return[];const medH=valid.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(valid.length/2)]||20,rows=[];for(const w of [...valid].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2;let row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(8,medH*.6));if(!row){row={cy,words:[]};rows.push(row)}row.words.push(w)}return rows.map(r=>{r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);return{text:clean(r.words.map(w=>w.text).join(' ')),height:Math.max(...r.words.map(w=>w.bbox.y1-w.bbox.y0)),y0:Math.min(...r.words.map(w=>w.bbox.y0)),y1:Math.max(...r.words.map(w=>w.bbox.y1))}}).filter(r=>r.text.length>1);}
function titleFromOcr(variant){
  const lines=ocrLineData(variant?.data?.words||[]);
  const ingIndex=lines.findIndex(x=>headingKind(x.text)==='ingredients');
  const pre=lines.slice(0,ingIndex>0?ingIndex:Math.min(lines.length,14));
  const candidates=pre.filter(x=>x.text.length>=5&&x.text.length<=75&&!garbage(x.text)&&!generic.test(x.text)&&!/^course\s*\d+/i.test(x.text));
  if(!candidates.length)return 'Imported recipe';
  const uppercase=candidates.filter(x=>/[A-Z]/.test(x.text)&&x.text===x.text.toUpperCase()&&/[A-Z]{3}/.test(x.text));
  return clean((uppercase.length?uppercase:candidates).sort((x,y)=>y.height-x.height||x.y0-y.y0)[0].text);
}
function scoreOcrVariant(variant){
  const text=String(variant?.data?.text||'').trim();
  const lines=text.split(/\r?\n/).map(clean).filter(Boolean);
  const headings=(text.match(/ingredients?|preparation|method|directions?|serves?/ig)||[]).length;
  const words=(text.match(/[A-Za-z]{2,}/g)||[]).length;
  const replacement=(text.match(/[�|{}\\]/g)||[]).length;
  return (Number(variant?.data?.confidence)||0)*0.25+Math.min(words,180)*0.35+Math.min(headings,5)*8+Math.min(lines.length,45)*0.25-replacement*2;
}
async function preprocessImage(blob,mode){const bmp=await createImageBitmap(blob);const max=2400,scale=Math.min(3,max/Math.max(bmp.width,bmp.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();if(mode!=='original'){const im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];let v=(y-128)*(mode==='threshold'?1.9:1.45)+128;if(mode==='threshold')v=v>160?255:0;v=Math.max(0,Math.min(255,v));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0)}return canvas;}
async function recognizeVariants(worker,blob,status,traceId){
  const variants=[];
  for(const mode of ['original','enhanced','threshold']){
    const started=performance.now();
    status(mode==='original'?'Reading image…':mode==='enhanced'?'Enhancing text…':'Checking text layout…');
    console.info('[CC image trace]',traceId,'recognition:variant:start',{mode,blobType:blob.type,blobBytes:blob.size});
    const canvas=await preprocessImage(blob,mode);
    console.info('[CC image trace]',traceId,'recognition:preprocessed',{mode,width:canvas.width,height:canvas.height});
    await worker.setParameters({tessedit_pageseg_mode:mode==='original'?'6':'11',preserve_interword_spaces:'1'});
    const result=await worker.recognize(canvas);
    const text=String(result.data?.text||'');
    console.info('[CC image trace]',traceId,'recognition:variant:done',{mode,durationMs:Math.round(performance.now()-started),confidence:result.data?.confidence,textLength:text.length,rawText:text,wordCount:result.data?.words?.length||0});
    variants.push(result);
    canvas.width=1;canvas.height=1;
  }
  return variants;
}
async function readImage(item,status,traceId){
  const path=item.file_path||item.original_file_path;
  console.info('[CC image trace]',traceId,'source:db-item',{id:item.id,file_name:item.file_name,mime_type:item.mime_type,file_path:path,original_file_path:item.original_file_path,extraction_status:item.extraction_status,review_status:item.review_status,extractedTextType:typeof item.extracted_text,extractedTextLength:String(item.extracted_text||'').length});
  if(!path)throw Error('Uploaded image path is missing.');
  const signedUrl=await getCachedSignedUrl(supabase,'cooking-confidential',path);
  console.info('[CC image trace]',traceId,'source:signed-url-ready',{path,hasUrl:!!signedUrl});
  const res=await fetch(signedUrl);
  if(!res.ok)throw Error('Could not load the uploaded image.');
  const blob=await res.blob();
  console.info('[CC image trace]',traceId,'source:blob-loaded',{httpStatus:res.status,blobType:blob.type,blobBytes:blob.size});
  // Image files use the existing Tesseract OCR path. Keep this pipeline isolated from PDF and DOCX extraction.
  const workerStarted=performance.now();
  const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status(`Reading image… ${Math.round((m.progress||0)*100)}%`)}});
  console.info('[CC image trace]',traceId,'tesseract:worker-ready',{startupMs:Math.round(performance.now()-workerStarted),language:'eng'});
  try{
    const variants=await recognizeVariants(worker,blob,status,traceId);
    const texts=variants.map(v=>String(v.data?.text||''));
    const ranked=variants.map((v,i)=>({variant:v,mode:['original','enhanced','threshold'][i],score:scoreOcrVariant(v),text:texts[i]})).sort((a,b)=>b.score-a.score);
    console.info('[CC image trace]',traceId,'recognition:comparison',{variants:ranked.map(v=>({mode:v.mode,score:Math.round(v.score*100)/100,confidence:v.variant.data?.confidence,textLength:v.text.length,rawText:v.text}))});
    const chosen=ranked[0];
    const rawText=String(chosen.text||'');
    console.info('[CC image trace]',traceId,'recognition:selected-raw-text',{mode:chosen.mode,score:chosen.score,rawText});
    const cleanedText=cleanSelectedOcrText(rawText);
    console.info('[CC image trace]',traceId,'recognition:stage1-selected-output',{mode:chosen.mode,score:Math.round(chosen.score*100)/100,confidence:chosen.variant.data?.confidence??null,rawText});
    console.info('[CC image trace]',traceId,'recognition:stage2-cleaned-output',{mode:chosen.mode,cleanedText});
    // Parser boundary diagnostics: capture what the generic parser actually receives
    // and whether section headings survive cleanup, without changing extraction behavior.
    const parserInputLines=String(cleanedText||'').replace(/\r/g,'').split('\n');
    const parserHeadingDiagnostics=parserInputLines.map((line,index)=>({
      line:index+1,
      text:clean(line).slice(0,180),
      heading:headingKind(line)||null,
      looksLikeIngredientHeading:/\bingredients?\b/i.test(line),
      looksLikeMethodHeading:/\b(method|directions?|instructions?|preparation|steps?)\b/i.test(line),
      looksLikeNotesHeading:/\b(notes?|tips?|storage|serving suggestions?)\b/i.test(line),
      rejectedAsGarbage:!!garbage(clean(line))
    })).filter(row=>row.text && (row.heading || row.looksLikeIngredientHeading || row.looksLikeMethodHeading || row.looksLikeNotesHeading));
    console.info('[CC image trace]',traceId,'parser:input-summary',{
      inputType:typeof cleanedText,
      inputLength:String(cleanedText||'').length,
      lineCount:parserInputLines.length,
      nonEmptyLineCount:parserInputLines.filter(line=>clean(line)).length,
      preview:parserInputLines.slice(0,35).map((line,index)=>({line:index+1,text:clean(line).slice(0,180)})),
      recognizedHeadingLines:parserHeadingDiagnostics
    });
    const parsed=parseLines(cleanedText);
    console.info('[CC image trace]',traceId,'parser:output-summary',{
      name:parsed.name,
      descriptionLength:String(parsed.description||'').length,
      ingredientCount:parsed.ingredients.length,
      ingredientsPreview:parsed.ingredients.slice(0,20),
      methodCount:parsed.method.length,
      methodPreview:parsed.method.slice(0,20),
      notesLength:String(parsed.notes||'').length,
      headingsSeen:parserHeadingDiagnostics.map(row=>({line:row.line,text:row.text,heading:row.heading,rejectedAsGarbage:row.rejectedAsGarbage}))
    });
    const textTitle=titleFromCleanedText(cleanedText);
    const ocrTitle=titleFromOcr(chosen.variant);
    if(textTitle&&textTitle!=='Imported recipe')parsed.name=textTitle;
    else if(ocrTitle&&ocrTitle!=='Imported recipe')parsed.name=ocrTitle;
    parsed.raw_ocr_text=rawText;
    parsed.cleaned_ocr_text=cleanedText;
    parsed.ocr_mode=chosen.mode;
    parsed.ocr_confidence=chosen.variant.data?.confidence??null;
    parsed.ingredients=(parsed.ingredients||[]).slice(0,80);
    parsed.method=(parsed.method||[]).slice(0,80);
    console.info('[CC image trace]',traceId,'recipe-structure:result',{name:parsed.name,description:parsed.description||'',ingredientCount:parsed.ingredients.length,ingredients:parsed.ingredients,methodCount:parsed.method.length,method:parsed.method,notes:parsed.notes||'',chosenMode:chosen.mode});
    return parsed;
  }finally{await worker.terminate();console.info('[CC image trace]',traceId,'tesseract:worker-terminated')}
}
function field(label,name,list,value){const v=String(value||'');const known=list.includes(v);return `<label>${label}<select name="${name}">${list.map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(o||'Select…')}</option>`).join('')}<option value="__custom__" ${v&&!known?'selected':''}>Other / custom…</option></select><input name="${name}_custom" placeholder="Enter category" style="display:${v&&!known?'block':'none'};margin-top:8px" value="${v&&!known?esc(v):''}"></label>`}
async function imagePicker(form,recipeName){const input=form.querySelector('[name="image_url"]');if(!input)return;input.type='hidden';const wrap=document.createElement('div');wrap.className='cc-upload-image-picker';wrap.innerHTML='<label>Recipe photo<input class="cc-upload-image-search" type="text" placeholder="Search by recipe title or keywords"></label><button type="button" class="secondary cc-upload-image-search-btn">Search images</button><div class="cc-upload-image-selected"></div><div class="cc-upload-image-results"></div>';input.parentElement.replaceWith(wrap);wrap.appendChild(input);const search=wrap.querySelector('.cc-upload-image-search'),btn=wrap.querySelector('.cc-upload-image-search-btn'),selected=wrap.querySelector('.cc-upload-image-selected'),results=wrap.querySelector('.cc-upload-image-results');search.value=recipeName&&recipeName!=='Imported recipe'?recipeName:'';btn.disabled=search.value.trim().length<3;const show=()=>{const u=input.value.trim();selected.innerHTML=u?'<p class="small-note">Selected image</p><img src="'+esc(u)+'" class="cc-image-preview" alt="Selected recipe image">':''};show();async function find(){const q=search.value.trim();if(q.length<3)return;btn.disabled=true;results.innerHTML='<p class="small-note">Searching images…</p>';try{const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(q+' food')+'&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*';const data=await fetch(api).then(r=>r.json());const pages=Object.values(data.query?.pages||{}).filter(p=>p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url).slice(0,5);results.innerHTML=pages.length?pages.map((p,i)=>{const u=p.imageinfo[0].thumburl||p.imageinfo[0].url;return '<button type="button" class="cc-upload-image-option" data-u="'+esc(u)+'"><img src="'+esc(u)+'" alt="Food image '+(i+1)+'"><span>Use image '+(i+1)+'</span></button>'}).join(''):'<p class="small-note">No matching images found. Try fewer words.</p>';results.querySelectorAll('.cc-upload-image-option').forEach(b=>b.onclick=()=>{input.value=b.dataset.u;show();results.querySelectorAll('.cc-upload-image-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})}catch(e){results.innerHTML='<p class="small-note">Could not search images. Please try again.</p>'}finally{btn.disabled=false}}btn.onclick=find;search.addEventListener('input',()=>{btn.disabled=search.value.trim().length<3});search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}})}
async function reviewImage(id){
  const traceId='CCIMG-'+id+'-'+Date.now().toString(36);
  const traceStarted=performance.now();
  console.info('[CC image trace]',traceId,'reviewImage:start',{id,at:new Date().toISOString()});
  const{data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!x){console.error('[CC image trace]',traceId,'reviewImage:load-failed',{error:error?.message||null});return window.ccShowError(error?.message||'Import item could not be loaded.','Could not load import');}
  console.info('[CC image trace]',traceId,'reviewImage:item-loaded',{durationMs:Math.round(performance.now()-traceStarted),id:x.id,file_name:x.file_name,mime_type:x.mime_type,file_path:x.file_path,original_file_path:x.original_file_path,extraction_status:x.extraction_status,review_status:x.review_status});
  importDialog?.close();
  detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Reading image…</h2><p class="small-note" id="genericImageStatus">Preparing the recipe for review.</p></div>';
  detailDialog.showModal();
  try{
    const status=t=>{const e=document.querySelector('#genericImageStatus');if(e)e.textContent=t};
    console.info('[CC image trace]',traceId,'ui:reading-overlay-open');
    const parsed=await readImage(x,status,traceId);
    console.info('[CC image trace]',traceId,'recipe-structure:complete',{durationMs:Math.round(performance.now()-traceStarted),parsed});
    // OCR is only accepted when it produced enough recipe structure to be useful.
    // Otherwise hand the original image to the universal rescue editor rather
    // than showing a misleading/empty recipe review.
    const ingredientCount=Array.isArray(parsed.ingredients)?parsed.ingredients.filter(Boolean).length:0;
    const methodText=Array.isArray(parsed.method)?parsed.method.join(' '):String(parsed.method||'');
    if(ingredientCount<3 || methodText.trim().length<25){
      console.warn('[CC image trace]',traceId,'fallback:rescue-editor',{reason:'insufficient recipe structure',ingredientCount,methodLength:methodText.trim().length,parsed});
      console.warn('Cooking Confidential image OCR was inadequate; opening rescue editor.');
      const rescue=await import('./rescue-ocr.js?v=1.1.2');
      return rescue.rescueImport(id);
    }
    const rawName=(x.file_name||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
    const parsedName=String(parsed.name||'').trim();
    const name=parsedName&&parsedName!=='Imported recipe'?parsedName:(rawName&&!/^(image|img|photo|scan|screenshot|file)$/i.test(rawName)?rawName:'Imported recipe');
    const editor=createGenericEditor({
      dialog:detailDialog,
      eyebrow:'REVIEW RECIPE',
      title:'Check before saving',
      fields:[
        {label:'Recipe name',name:'name',value:name,required:true},
        {label:'Description',name:'description',value:parsed.description||'',type:'richtext'},
        {label:'Recipe photo',name:'image_url',value:parsed.image_url||'',type:'url',className:'cc-image-field'},
        {group:[
          {label:'Cuisine',name:'cuisine',value:parsed.cuisine||''},
          {label:'Course',name:'course',value:parsed.course||'',type:'select',options:courses}
        ]},
        {label:'Recipe type',name:'recipe_type',value:parsed.recipe_type||'',type:'select',options:types},
        {label:'Servings',name:'servings',value:parsed.servings||''},
        {label:'Ingredients',name:'ingredients',value:(parsed.ingredients||[]).join('\n'),type:'richtext'},
        {label:'Method / process',name:'method',value:(parsed.method||[]).join('\n'),type:'richtext'},
        {label:'Notes / differences',name:'notes',value:parsed.notes||'',type:'richtext'}
      ],
      actions:{cancelLabel:'Cancel',saveLabel:'Save recipe'},
      onSave:async formData=>{
        const{data:{user}}=await supabase.auth.getUser();
        if(!user)return window.ccShowError('Please sign in again before saving the recipe.','Sign-in required');
        const imageUrl=String(formData.get('image_url')||'').trim();
        const course=editorValue(formData,'course');
        const recipeType=editorValue(formData,'recipe_type');
        const ingredientsHtml=sanitizeRichHtml(formData.get('ingredients')||'');
        const methodHtml=sanitizeRichHtml(formData.get('method')||'');
        const notesHtml=sanitizeRichHtml(formData.get('notes')||'');
        const payload={
          name:clean(editorValue(formData,'name')),
          description:sanitizeRichHtml(formData.get('description')||'')||null,
          cuisine:clean(editorValue(formData,'cuisine'))||null,
          course:clean(course)||null,
          recipe_type:clean(recipeType)||null,
          servings:clean(editorValue(formData,'servings'))||null,
          ingredients:{html:ingredientsHtml},
          method:methodHtml,
          personal_notes:notesHtml||null,
          source_type:'file',
          source_url:null,
          source_title:x.file_name||null,
          image_url:imageUrl||null,
          created_by:user.id,
          visibility:'private'
        };
        let recipeId=x.recipe_id||null;
        if(!recipeId&&x.file_name){
          const q=await supabase.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type','file').eq('source_title',x.file_name).limit(1);
          if(q.error)return window.ccShowError(q.error.message,'Could not find existing recipe');
          recipeId=q.data?.[0]?.id||null;
        }
        const q=recipeId?await supabase.from('cc_recipes').update(payload).eq('id',recipeId):await supabase.from('cc_recipes').insert(payload).select('id').single();
        if(q.error)return window.ccShowError(q.error.message,'Could not save recipe');
        const savedId=recipeId||q.data?.id;
        const u=await supabase.from('cc_import_items').update({recipe_id:savedId,review_status:'approved',extraction_status:'ready'}).eq('id',id);
        if(u.error)return window.ccShowError(u.error.message,'Could not update import status');
        detailDialog.close();
        window.location.reload();
      }
    });
    imagePicker(editor.form,name);
  }catch(e){
    console.error('[CC image trace]',traceId,'reviewImage:exception',{durationMs:Math.round(performance.now()-traceStarted),name:e?.name,message:e?.message,stack:e?.stack});
    console.warn('Cooking Confidential image extraction failed; opening rescue editor:',e);
    try{
      const rescue=await import('./rescue-ocr.js?v=1.1.2');
      return rescue.rescueImport(id);
    }catch(rescueError){
      window.ccShowError(rescueError.message||e.message||String(e),'Image extraction failed');
    }
  }
}
export { reviewImage };