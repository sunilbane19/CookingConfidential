import { stripImportCitations } from './import-citation-cleanup.js?v=1.0.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWorker } from 'https://esm.sh/tesseract.js@5';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import { createGenericEditor, editorValue, sanitizeRichHtml } from './generic-editor.js?v=1.3.5';
import { checkRecipeQuality } from './recipe-quality.js?v=1.0.4';
import { readSourceTextWithVision } from './vision-text-reader.js?v=1.0.0';
import { parseDocx } from './docx-parser.js?v=1.0.10';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let ccLegacyDocstreamPromise;
async function loadLegacyDocstream(){
 if(window.officeParser&&typeof window.officeParser.parseOffice==='function')return window.officeParser;
 if(!ccLegacyDocstreamPromise)ccLegacyDocstreamPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/gh/joseespana/docstream@master/docs/dist/officeparser.browser.js';
  script.onload=()=>window.officeParser&&typeof window.officeParser.parseOffice==='function'?resolve(window.officeParser):reject(new Error('Docstream loaded but its parser API was not available.'));
  script.onerror=()=>reject(new Error('Could not load Docstream for the legacy Word document.'));
  document.head.appendChild(script);
 }).catch(error=>{ccLegacyDocstreamPromise=null;throw error});
 return ccLegacyDocstreamPromise;
}
async function imageReviewDiag(id,stage,details={}){try{const p=sb.from('cc_extraction_diagnostics').insert({import_item_id:Number(id),stage:`image_${stage}`,details});await Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error('diagnostic timeout')),3000))])}catch(e){console.warn('CC image diagnostic write failed',e)}}
const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

// Generic OCR cleanup. This is deliberately recipe-agnostic: it removes
// common scan/social-media artefacts without inventing quantities or ingredients.
function clean(s){
  let x=String(s??'').replace(/\r/g,'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s*\[(?:\s*\d+\s*(?:[,;]\s*\d+\s*)+)\]\s*/g,' ');
  x=x.replace(/\s+/g,' ').trim();
  // Remove checkbox/list/bracket noise introduced by OCR.
  x=x.replace(/^[\[\]{}()<>|•·▪◦●○✓✔☐☑\s]+/,'').replace(/^[\[\](){}]+\s*/,'');
  x=x.replace(/\s*[\[\]{}|]+\s*/g,' ');
  // Normalize common OCR fraction forms, but do not guess the number.
  x=x.replace(/\b1\s*[\/]\s*2\b/g,'½').replace(/\b1\s*[\/]\s*4\b/g,'¼').replace(/\b3\s*[\/]\s*4\b/g,'¾');
  x=x.replace(/\b1\s*[\/]\s*3\b/g,'⅓').replace(/\b2\s*[\/]\s*3\b/g,'⅔');
  x=x.replace(/\b1\s*[\/]\s*8\b/g,'⅛').replace(/\b3\s*[\/]\s*8\b/g,'⅜').replace(/\b5\s*[\/]\s*8\b/g,'⅝').replace(/\b7\s*[\/]\s*8\b/g,'⅞');
  x=x.replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/g,'lb');
  x=x.replace(/\btsps?\b/gi,'tsp').replace(/\btbsps?\b/gi,'tbsp');
  x=x.replace(/\s*;\s*$/,'').replace(/\s{2,}/g,' ').trim();
  return x;
}

const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
const courses=['Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage','Ingredient'];
const types=['Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
const dietaryOptions=['Vegetarian','Vegan','Pescatarian','Non-Veg','Gluten-Free','Dairy-Free','Egg-Free','Nut-Free','Low-Carb','Keto'];
const SECTION=/^(ingredients?|ingredient list|method|directions?|instructions?|preparation|steps?|servings?|notes?|tips?|storage|serving suggestions?|recipe|for the .+|for .+):?$/i;
const GENERIC=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|contents?|index|introduction|notes?|tips?|storage|serving suggestions?|long-term preservation methods?|for the .+|for .+)[:.]?$/i;

// OCR often captures social-media footer/call-to-action text as if it were an ingredient.
// Reject lines that contain no plausible recipe-unit/ingredient structure and are mostly noise.
function isOcrGarbage(x){
  const s=clean(x); if(!s)return true;
  if(GENERIC.test(s))return true;
  const letters=(s.match(/[A-Za-z]/g)||[]).length, digits=(s.match(/\d/g)||[]).length;
  const odd=(s.match(/[@©®™|]/g)||[]).length;
  if(odd>=2 && letters<18)return true;
  if(/[©®™]/.test(s))return true;
  if(/\b(?:follow|subscribe|like|share|save|comment|link in bio|learn more|ends in)\b/i.test(s) && !/\b(?:cup|tsp|tbsp|lb|oz|g|kg|ml|l)\b/i.test(s))return true;
  if(letters<2 && digits<1)return true;
  return false;
}

function cleanIngredientLines(arr){
  const out=[];
  for(const raw of (Array.isArray(arr)?arr:[])){
    const x=clean(raw);
    if(!x||SECTION.test(x)||isOcrGarbage(x))continue;
    out.push(x);
  }
  return out;
}

function titleCaseScore(s){
  const x=s.trim(),w=x.split(/\s+/);
  if(w.length<1||w.length>8||x.length<3||x.length>70||GENERIC.test(x)||/^step\s*\d+/i.test(x))return false;
  const normalTitle=w.length>=2&&/^[A-Z][A-Za-z'&-]*$/.test(w[0])&&!/[.!?]$/.test(x);
  const titleCase=w.filter(v=>/^[A-Z][A-Za-z'&-]*$/.test(v)).length>=Math.max(1,Math.ceil(w.length*.35));
  return normalTitle||titleCase;
}
function makeRecipe(name){return {name:clean(name)||'Imported recipe',description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:[],method:[],notes:[]};}
function docxRecipeBlocks(doc){
  const blocks=[]; let current=[];
  const push=()=>{if(current.length){blocks.push(current);current=[];}};
  for(const el of [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')]){
    const text=clean(el.textContent);
    if(!text){if(el.tagName==='P')push();continue;}
    current.push({text,bold:/^H[1-6]$/.test(el.tagName)||!!el.querySelector('strong,b'),tag:el.tagName.toLowerCase()});
  }
  push();
  return blocks;
}
function looksLikeIngredientTitle(s){
  const x=clean(s);
  if(!x||GENERIC.test(x))return true;
  if(/^\d+(?:[./]\d+)?\s*(?:tsp|tbsp|cup|cups|oz|lb|lbs|g|kg|ml|l|cl|pinch|cloves?|sprigs?)\b/i.test(x))return true;
  if(/^(?:half|quarter|one|two|three|four|five)\s+(?:tsp|tbsp|cup|cloves?|sprigs?|oz|lb|lbs)\b/i.test(x))return true;
  return false;
}

// Multi-recipe DOCX handling is limited to separation. Each separated block
// is parsed by the existing single-recipe DOCX parser. If the structural split
// is not reliable, pass the complete document to that same established parser.
function parseDocxMulti(html,file,expectedCount=0){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const blocks=docxRecipeBlocks(doc);
  const candidates=blocks.filter(b=>b.length>=3&&!looksLikeIngredientTitle(b[0].text));
  const separated=[];
  if(candidates.length>=2){
    for(const block of candidates){
      const chunk=block.map(item=>{
        const tag=/^h[1-6]$/.test(item.tag)?item.tag:'p';
        const text=esc(item.text);
        return '<'+tag+'>'+(item.bold&&tag==='p'?'<strong>'+text+'</strong>':text)+'</'+tag+'>';
      }).join('');
      const parsed=parseDocx(chunk,file+' — '+block[0].text);
      const recipe=parsed.find(r=>(r.ingredients?.length||0)>0||(r.method?.length||0)>0);
      if(recipe)separated.push(recipe);
    }
  }
  if(separated.length>=2&&separated.length===candidates.length&&(!expectedCount||separated.length===expectedCount))return separated;
  return parseDocx(html,file);
}
function ocrLines(words){const valid=words.filter(w=>w.text?.trim()&&Number(w.confidence||0)>=25);if(!valid.length)return[];const medH=valid.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(valid.length/2)]||20,rows=[];for(const w of [...valid].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2;let row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(8,medH*.55));if(!row){row={cy,words:[]};rows.push(row);}row.words.push(w);}return rows.map(r=>{r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);return {text:clean(r.words.map(w=>w.text).join(' ')),x0:Math.min(...r.words.map(w=>w.bbox.x0)),x1:Math.max(...r.words.map(w=>w.bbox.x1)),y0:Math.min(...r.words.map(w=>w.bbox.y0)),y1:Math.max(...r.words.map(w=>w.bbox.y1)),height:Math.max(...r.words.map(w=>w.bbox.y1-w.bbox.y0))};}).filter(r=>r.text.length>1);}
function titleCandidate(l,medH){const t=clean(l.text);if(l.height<medH*1.25||t.length>55||titleCaseScore(t)===false)return false;return(t.match(/[A-Za-z]/g)||[]).length>=3;}
function buildFromLines(lines){if(!lines.length)return[];const medH=lines.map(l=>l.height).sort((a,b)=>a-b)[Math.floor(lines.length/2)]||20,candidates=lines.filter(l=>titleCandidate(l,medH)),good=candidates.filter(t=>lines.filter(l=>l.y0>t.y1+4&&l.y0<t.y1+Math.max(120,medH*18)&&Math.abs((l.x0+l.x1)/2-(t.x0+t.x1)/2)<Math.max(170,(t.x1-t.x0)*2.5)).length>=2);if(good.length<2)return[];const out=good.map(t=>({title:t,recipe:makeRecipe(t.text)}));for(const l of lines){if(out.some(o=>o.title===l))continue;let best=null,bestScore=Infinity;out.forEach(o=>{const t=o.title,dx=Math.abs((l.x0+l.x1)/2-(t.x0+t.x1)/2),dy=l.y0-t.y1;if(dy<0)return;const score=dx+dy*.55;if(score<bestScore&&dy<Math.max(220,medH*24)){best=o;bestScore=score;}});if(best)best.recipe.ingredients.push(l.text);}return out.map(o=>({...o.recipe,ingredients:cleanIngredientLines(o.recipe.ingredients)})).filter(r=>r.ingredients.length>=2);}
function parseTextMulti(text,file){
  const ls=lines(text), out=[];
  let current=null, mode='';
  const flush=()=>{if(current&&current.name&&current.ingredients.length)out.push(current);current=null;mode=''};
  for(const raw of ls){
    const s=clean(raw);
    if(/^ingredients?$/i.test(s)){if(current)mode='ingredients';continue}
    if(/^(method|directions?|instructions?|preparation|preparations|steps?|cooking steps|recipe steps|cooking instructions|preparation steps|recipe method|cooking method|procedure)$/i.test(s)){if(current)mode='method';continue}
    if(/^notes?$/i.test(s)){if(current)mode='notes';continue}
    const looksTitle=titleCaseScore(s) && !/^[-•]/.test(s) && !/^d/.test(s) && s.length<=80;
    if(looksTitle){
      if(current)flush();
      current=makeRecipe(s);mode='ingredients';continue;
    }
    if(!current)continue;
    if(/^method\s*:/i.test(s)){
      mode='method';current.method.push(clean(s.replace(/^method\s*:\s*/i,'')));continue;
    }
    if(mode==='ingredients')current.ingredients.push(s);
    else if(mode==='method')current.method.push(s);
    else if(mode==='notes')current.notes.push(s);
  }
  flush();
  return out.map(r=>({...r,ingredients:cleanIngredientLines(r.ingredients),method:r.method.filter(x=>!isOcrGarbage(x)),notes:r.notes.filter(x=>!isOcrGarbage(x))})).filter(r=>r.ingredients.length>=2);
}
function dedupeRecipes(recipes){const seen=new Set();return recipes.filter(r=>{const k=clean(r.name).toLowerCase().replace(/[^a-z0-9]+/g,' ');if(!k||seen.has(k))return false;seen.add(k);return true;});}
async function recognizeTile(worker,bitmap,x,y,w,h){const insetX=w*.035,insetY=h*.035;const sx=x+insetX,sy=y+insetY,sw=w-insetX*2,sh=h-insetY*2;const scale=4;const canvas=document.createElement('canvas');canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data;for(let i=0;i<d.length;i+=4){const yv=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=Math.max(0,Math.min(255,(yv-128)*1.45+128));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(image,0,0);return worker.recognize(canvas);}
function bookHeading(s,kind){const x=clean(s).toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();if(kind==='ingredients')return /\bingredients?\b/.test(x)||/\bingredient\s+list\b/.test(x);if(kind==='method')return /\b(method|directions?|instructions?|preparation|preparations|steps?|cooking steps|recipe steps|cooking instructions|preparation steps|recipe method|cooking method|procedure)\b/.test(x);return false;}
function bookTitle(lines){const ing=lines.findIndex(l=>bookHeading(l.text,'ingredients'));const pre=ing>0?lines.slice(0,ing):lines.slice(0,8);const useful=pre.filter(l=>{const s=clean(l.text);return s.length>=4&&!/traditional|delicacies|vegetables|vegetable stew/i.test(s)&&!GENERIC.test(s);});if(!useful.length)return'Imported recipe';const upper=useful.filter(l=>/[A-Z]{4,}/.test(l.text));const main=(upper.length?upper:useful).slice(-1)[0].text;return clean(main);}
async function ocrBookPage(worker,bitmap){const W=bitmap.width,H=bitmap.height;const top=await recognizeTile(worker,bitmap,W*.035,H*.02,W*.93,H*.60);const lower=await recognizeTile(worker,bitmap,W*.035,H*.40,W*.93,H*.56);const topLines=ocrLines(top.data.words||[]),lowLines=ocrLines(lower.data.words||[]);const all=[...topLines,...lowLines].sort((a,b)=>a.y0-b.y0);const ing=all.findIndex(l=>bookHeading(l.text,'ingredients'));const meth=all.findIndex(l=>bookHeading(l.text,'method'));if(ing<0||meth<0||meth<=ing)return null;const r=makeRecipe(bookTitle(all));const subtitle=all.slice(0,ing).map(l=>clean(l.text)).find(s=>/^vegetable stew$/i.test(s));if(subtitle)r.description=subtitle;r.ingredients=cleanIngredientLines(all.slice(ing+1,meth).map(l=>l.text).filter(x=>!/^\d+$/.test(clean(x))));r.method=all.slice(meth+1).map(l=>clean(l.text)).filter(x=>/^(?:\d+\.?\s*)/.test(x)||x.length>25).filter(x=>!isOcrGarbage(x));return r.ingredients.length>=5&&r.method.length>=2?r:null;}function bookFromLines(lines){const ing=lines.findIndex(l=>bookHeading(l.text,'ingredients'));const meth=lines.findIndex(l=>bookHeading(l.text,'method'));if(ing<0||meth<0||meth<=ing)return null;const r=makeRecipe(bookTitle(lines));const subtitle=lines.slice(0,ing).map(l=>clean(l.text)).find(s=>/^vegetable stew$/i.test(s));if(subtitle)r.description=subtitle;r.ingredients=cleanIngredientLines(lines.slice(ing+1,meth).map(l=>l.text).filter(x=>!/^\d+$/.test(clean(x))));r.method=lines.slice(meth+1).map(l=>clean(l.text)).filter(x=>/^(?:\d+\.?\s*)/.test(x)||x.length>25).filter(x=>!isOcrGarbage(x));return r.ingredients.length>=5&&r.method.length>=2?r:null;}

async function ocrImage(blob,status){status('Reading image…');const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status(`Reading image… ${Math.round((m.progress||0)*100)}%`);}});try{const full=await worker.recognize(blob);const fullLines=ocrLines(full.data.words||[]);let recipes=[];status('Finding recipe sections…');const book=bookFromLines(fullLines);if(book)recipes=[book];if(!recipes.length)recipes=buildFromLines(fullLines);const bitmap=await createImageBitmap(blob),W=bitmap.width,H=bitmap.height,ratio=W/H;if(!recipes.length){status('Reading recipe sections…');const book=await ocrBookPage(worker,bitmap);if(book)recipes=[book];}if(!recipes.length&&ratio>=.98){status('Looking for multiple recipes…');const grids=ratio<1.1?[[3,3],[2,2]]:[[3,2],[2,2]];for(const[cols,rows]of grids){const found=[],tw=W/cols,th=H/rows;for(let ry=0;ry<rows;ry++)for(let cx=0;cx<cols;cx++){const res=await recognizeTile(worker,bitmap,cx*tw,ry*th,tw,th),tileRecipes=buildFromLines(ocrLines(res.data.words||[]));if(tileRecipes.length)found.push(...tileRecipes);}const unique=dedupeRecipes(found);if(unique.length>recipes.length)recipes=unique;if(recipes.length>=6)break;}}bitmap.close();if(!recipes.length){const r=makeRecipe('Imported image');r.ingredients=cleanIngredientLines(fullLines.map(x=>x.text));recipes=[r];}return recipes;}finally{await worker.terminate();}}
async function loadOriginal(x){const signedUrl=await getCachedSignedUrl(sb,'cooking-confidential',x.file_path);const r=await fetch(signedUrl);if(!r.ok)throw Error('Could not load the original file.');return r.blob();}
async function reviewImageImport(id){
  await imageReviewDiag(id,'review_start');
  try{
    await imageReviewDiag(id,'vision_start');
    const text=await readSourceTextWithVision(id);
    await imageReviewDiag(id,'vision_done',{text_length:String(text||'').length,preview:String(text||'').slice(0,500)});
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw Error('Your sign-in session has expired. Please sign in again.');
    await imageReviewDiag(id,'parser_start');
    const rr=await fetch(SUPABASE_URL+'/functions/v1/cc-import-extract-staging-v2',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':session.access_token},
      body:JSON.stringify({import_item_id:Number(id),text_override:text})
    });
    const body=await rr.json().catch(()=>({}));
    await imageReviewDiag(id,'parser_response',{ok:rr.ok,status:rr.status,error:body?.error||null});
    if(!rr.ok)throw Error(body?.error||'Structure parser failed after Vision reading.');
    const item=await getItem(id);
    const parsed0=typeof item.extracted_text==='string'?JSON.parse(item.extracted_text||'{}'):item.extracted_text;
    const recipe=parsed0?.recipe&&typeof parsed0.recipe==='object'?parsed0.recipe:parsed0;
    await imageReviewDiag(id,'parsed_recipe',{name:recipe?.name||null,ingredient_count:Array.isArray(recipe?.ingredients)?recipe.ingredients.length:0,method_length:String(recipe?.method||'').length});
    const q=checkRecipeQuality(recipe,{mode:'single'});
    await imageReviewDiag(id,'quality_result',{good:q.good,score:q.score,reasons:q.reasons,metrics:q.metrics});
    if(q.good){
      const mod=await import('./import-review-fix.js?v=1.4.119');
      await imageReviewDiag(id,'normal_review');
      return mod.reviewImportFixed(id);
    }
    await imageReviewDiag(id,'rescue_reason',{reason:'quality_gate_failed'});
    await sb.from('cc_import_items').update({extracted_text:JSON.stringify({...parsed0,raw_text:text,quality:q}),extraction_status:'ready',review_status:'pending'}).eq('id',id);
    const rescue=await import('./rescue-ocr.js?v=1.1.1'); return rescue.rescueImport(id);
  }catch(e){
    await imageReviewDiag(id,'vision_path_error',{name:e?.name||null,message:e?.message||String(e),stack:String(e?.stack||'').slice(0,1200)});
    console.warn('Vision image review failed; using existing OCR as fallback:',e);
    try{
      const blob=await original(await getItem(id));
      const recipes=await ocrImage(blob,()=>{});
      const r=recipes[0];
      await imageReviewDiag(id,'ocr_fallback_result',{name:r?.name||null,ingredient_count:Array.isArray(r?.ingredients)?r.ingredients.length:0,method_length:String(r?.method||'').length});
      const q=checkRecipeQuality(r,{mode:'single'});
      await imageReviewDiag(id,'ocr_fallback_quality',{good:q.good,score:q.score,reasons:q.reasons,metrics:q.metrics});
      if(q.good){
        const rescue=await import('./rescue-ocr.js?v=1.1.1');
        // Keep existing image OCR as a fallback only; normal review remains available.
        const item=await getItem(id);
        await sb.from('cc_import_items').update({extracted_text:JSON.stringify({recipe:r,raw_text:(r.ingredients||[]).join('\n')+'\n'+(r.method||[]).join('\n')}),extraction_status:'ready',review_status:'pending'}).eq('id',id);
        const mod=await import('./import-review-fix.js?v=1.4.119'); return mod.reviewImportFixed(id);
      }
      await imageReviewDiag(id,'ocr_fallback_rescue',{reason:'quality_gate_failed'});
      const rescue=await import('./rescue-ocr.js?v=1.1.1'); return rescue.rescueImport(id);
    }catch(fallbackError){
      await imageReviewDiag(id,'ocr_fallback_error',{name:fallbackError?.name||null,message:fallbackError?.message||String(fallbackError)});
      const rescue=await import('./rescue-ocr.js?v=1.1.1'); return rescue.rescueImport(id);
    }
  }
}

function pdfLinesFromTextContent(content){
  const rows=[];
  for(const item of (content.items||[])){
    const value=clean(item.str||'');
    if(!value)continue;
    const x=Number(item.transform?.[4]||0), y=Number(item.transform?.[5]||0);
    let row=rows.find(r=>Math.abs(r.y-y)<2.5);
    if(!row){row={y,items:[]};rows.push(row);}
    row.items.push({x,value});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(x=>x.value).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}
function parsePdfRecipeSegment(sourceLines,fileName){
  const ls=sourceLines.map(clean).filter(Boolean).filter(s=>!/^Three Recipes\s*[•·-]\s*Transcribed from supplied PDF$/i.test(s)&&!/^---\s*Page\s+\d+\s*---$/i.test(s));
  const ing=ls.findIndex(s=>/^(?:ingredients?|ingredient list|what you need)\s*:?\s*$/i.test(s));
  const prep=ls.findIndex((s,i)=>i>(ing<0?-1:ing)&&/^(?:preparation|method|directions?|instructions?|steps?)\s*:?\s*$/i.test(s));
  if(ing<0||prep<0||prep<=ing)return null;
  const titleLines=ls.slice(0,ing).filter(s=>!/^recipe by\b/i.test(s)&&!/^recipe\s*$/i.test(s)&&!/^page\s+\d+$/i.test(s));
  let title=(titleLines.find(s=>/^\s*\d+[.)]\s+\S/.test(s))||titleLines.find(s=>s.length>=4))||fileName||'Imported recipe';
  title=clean(title.replace(/^\s*\d+[.)]\s*/,''));
  if(!title||/^(?:ingredients?|preparation|method|directions?)$/i.test(title))title=fileName||'Imported recipe';
  const recipe=makeRecipe(title);
  recipe.ingredients=cleanIngredientLines(ls.slice(ing+1,prep).filter(s=>!/^for\s+.+:?\s*$/i.test(s)));
  const methodLines=ls.slice(prep+1);
  for(const line of methodLines){
    if(/^serves?\s*:/i.test(line)){recipe.servings=clean(line.replace(/^serves?\s*:\s*/i,''));continue;}
    const note=line.match(/(?:^|\s)(?:note|notes|tip|tips)\s*:\s*(.+)$/i);
    if(note){const prefix=clean(line.slice(0,note.index||0));if(prefix)recipe.method.push(prefix);recipe.notes.push(clean(note[1]));continue;}
    if(/^(?:nutrition|calories|source|recipe by)\b/i.test(line))continue;
    recipe.method.push(line);
  }
  recipe.method=recipe.method.filter(x=>!isOcrGarbage(x));
  recipe.notes=recipe.notes.filter(x=>!isOcrGarbage(x));
  return recipe.ingredients.length>=2&&recipe.method.length>=1?recipe:null;
}
function parsePdfTextPages(pageLines,fileName){
  const recipes=[];
  for(let p=0;p<pageLines.length;p++){
    const ls=pageLines[p];
    // Only treat a numbered line as a recipe title when an Ingredients heading
    // follows before the next numbered line. Numbered preparation steps are not titles.
    const candidates=[];
    ls.forEach((line,i)=>{
      if(!/^\s*\d+[.)]\s+\S/.test(line)||/^step\s+\d+/i.test(line))return;
      const nextNumber=ls.findIndex((other,j)=>j>i&&/^\s*\d+[.)]\s+\S/.test(other));
      const end=nextNumber<0?ls.length:nextNumber;
      if(ls.slice(i+1,end).some(s=>/^(?:ingredients?|ingredient list|what you need)\s*:?\s*$/i.test(clean(s))))candidates.push(i);
    });
    const segments=candidates.length>1?candidates.map((start,i)=>ls.slice(start,candidates[i+1]??ls.length)):[ls];
    for(const segment of segments){
      const recipe=parsePdfRecipeSegment(segment,fileName);
      if(recipe)recipes.push(recipe);
    }
  }
  return dedupeRecipes(recipes);
}
async function extractPdfMulti(blob,fileName,status){
  status('Reading PDF pages…');
  let pdf;
  try{
    pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  }catch(error){throw new Error('Could not load the PDF reader. Please try again, or save the PDF as DOCX.');}
  const data=new Uint8Array(await blob.arrayBuffer());
  const doc=await pdf.getDocument({data}).promise;
  const textPages=[];
  let selectableChars=0;
  for(let n=1;n<=doc.numPages;n++){
    status('Reading PDF page '+n+' of '+doc.numPages+'…');
    const page=await doc.getPage(n);
    const content=await page.getTextContent();
    const linesOnPage=pdfLinesFromTextContent(content);
    selectableChars+=linesOnPage.join(' ').length;
    textPages.push(linesOnPage);
  }
  let recipes=parsePdfTextPages(textPages,fileName);
  if(recipes.length){
    status('Found '+recipes.length+' recipe'+(recipes.length===1?'':'s')+' in PDF text…');
    return recipes;
  }
  // Scanned/image-only PDFs have no usable text layer. Render each page and OCR it.
  status(selectableChars>30?'Reading PDF layout with OCR…':'Scanned PDF detected; reading pages with OCR…');
  const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status('Reading scanned PDF… '+Math.round((m.progress||0)*100)+'%');}});
  try{
    const ocrPages=[];
    for(let n=1;n<=doc.numPages;n++){
      status('Reading scanned PDF page '+n+' of '+doc.numPages+'…');
      const page=await doc.getPage(n),viewport=page.getViewport({scale:2.25});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const result=await worker.recognize(canvas);
      ocrPages.push(String(result.data.text||'').split(/\r?\n/).map(clean).filter(Boolean));
      canvas.width=1;canvas.height=1;
    }
    recipes=parsePdfTextPages(ocrPages,fileName);
    if(!recipes.length)throw new Error('No complete recipes could be detected in this PDF. Check that each recipe has an Ingredients section and a Method/Preparation section, or try a clearer scan.');
    return recipes;
  }finally{await worker.terminate();doc.destroy?.();}
}

async function extract(id,show=true){if(show){dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note" id="multiStatus">Reading the original file.</p></div>';dialog.showModal();}const status=t=>{const e=document.querySelector('#multiStatus');if(e)e.textContent=t;};const{data:x,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!x)return fail(error?.message||'Import item not found.');const expected=Number(window.ccExpectedRecipeCount||JSON.parse(localStorage.getItem('ccMultiImport:'+id)||'{}').expectedCount||0);try{const cached=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;if(!/\.(?:docx|pdf)$/i.test(x.file_name||'')&&x.extraction_status==='ready'&&cached?.multiple&&Array.isArray(cached.recipes)&&cached.recipes.length&&(!expected||cached.recipes.length===expected)){render(id,x,cached.recipes);return;}}catch(e){console.warn('Cooking Confidential cached multi-recipe result:',e)}dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">EXTRACTING</p><h2>Preparing recipes…</h2><p class="small-note" id="multiStatus">Reading the original file.</p></div>';dialog.showModal();try{const blob=await loadOriginal(x);let recipes=[];if(/\.(png|jpe?g|webp)$/i.test(x.file_name||'')||String(x.mime_type||'').startsWith('image/')){
  // No paid vision-model call: keep multi-image extraction on local Tesseract OCR.
  recipes=await ocrImage(blob,status);}else if(/\.doc$/i.test(x.file_name||'')){status('Reading legacy Word document with Docstream…');const arrayBuffer=await blob.arrayBuffer();const parser=await loadLegacyDocstream();const ast=await parser.parseOffice(arrayBuffer);const text=typeof ast?.toMarkdown==='function'?ast.toMarkdown():typeof ast?.toText==='function'?ast.toText():'';if(!String(text||'').trim())throw Error('Docstream did not return readable text from this Word document.');recipes=parseTextMulti(String(text).replace(/^\\s{0,3}#{1,6}\\s*/gm,'').replace(/\\*\\*(.*?)\\*\\*/g,'$1'),x.file_name||'Imported Word document');if(!recipes.length)throw Error('No separate recipes were detected in this .doc file. Check the document or use Single mode for a one-recipe file.');}else if(/\.docx$/i.test(x.file_name||'')){status('Separating recipes, then using the standard DOCX parser…');const arrayBuffer=await blob.arrayBuffer();const html=(await mammoth.convertToHtml({arrayBuffer},{ignoreEmptyParagraphs:false})).value||'';recipes=parseDocxMulti(html,x.file_name||'Imported document',expected);}else if(/\.pdf$/i.test(x.file_name||'')||String(x.mime_type||'').toLowerCase().includes('application/pdf')){recipes=await extractPdfMulti(blob,x.file_name||'Imported PDF',status);}else if((x.mime_type||'').startsWith('text/')){recipes=parseTextMulti(await blob.text(),x.file_name||'Imported document');if(!recipes.length){const r=makeRecipe(x.file_name||'Imported recipe');r.ingredients=cleanIngredientLines(await blob.text());recipes=[r];}}else throw Error('This multi-recipe importer currently supports images, DOCX and text documents.');if(!recipes.length)throw Error('No recipes could be detected.');recipes=recipes.map(r=>{
  r=stripImportCitations(r);
  const method=(Array.isArray(r.method)?r.method:lines(r.method)).map(clean).filter(x=>!isOcrGarbage(x));
  const notes=(Array.isArray(r.notes)?r.notes:lines(r.notes)).map(clean).filter(x=>!isOcrGarbage(x));
  const kept=[];
  for(const line of method){
    const match=line.match(/(?:^|\s)(?:note|notes|tip|tips)\s*:\s*(.+)$/i);
    if(!match){kept.push(line);continue;}
    const at=match.index??0,prefix=clean(line.slice(0,at)),note=clean(match[1]);
    if(prefix)kept.push(prefix);
    if(note)notes.push(note);
  }
  return {...r,ingredients:cleanIngredientLines(r.ingredients),method:kept,notes};
});await sb.from('cc_import_items').update({extracted_text:JSON.stringify({version:7,multiple:true,recipes}),source_title:recipes[0]?.name||x.file_name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(show)render(id,x,recipes);return {item:x,recipes};}catch(e){if(show)fail(e?.message||String(e));throw e;}}
function fail(msg){dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Recipe extraction failed</h2><p class="small-note">${esc(msg)}</p>`;dialog.querySelector('.close').onclick=()=>dialog.close();}
function render(id,x,recipes){const cards=recipes.map((r,i)=>{const reviewed=!!r._reviewed;return `<article class="multi-recipe-card"><label class="multi-select"><input type="checkbox" data-r="${i}" ${reviewed?'checked':''}><span><strong>${esc(r.name)}</strong></span></label><button type="button" class="secondary multi-edit ${reviewed?'reviewed':''}" data-r="${i}">${reviewed?'✓ Reviewed':'Review'}</button></article>`}).join('');dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button">×</button><p class="eyebrow">MULTI-RECIPE IMPORT</p><h2>${recipes.length} recipes</h2><p class="small-note">Review the recipes below and select the ones you want to save.</p><div class="multi-list">${cards}</div><div class="detail-actions multi-list-actions"><button class="secondary multi-cancel" id="multiCancel">Cancel</button><button class="primary multi-save" id="multiSave">Save selected</button></div>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.querySelector('#multiCancel').onclick=()=>dialog.close();
 dialog.querySelectorAll('.multi-edit').forEach(b=>b.onclick=()=>editOne(id,x,recipes,Number(b.dataset.r)));dialog.querySelector('#multiSave').onclick=async()=>{const selected=[...dialog.querySelectorAll('input[data-r]:checked')].map(e=>Number(e.dataset.r));await saveMany(id,x,recipes.filter((_,i)=>selected.includes(i)));};}
function importImagePicker(form,recipe){const input=form.querySelector('[name="image_url"]');if(!input)return;input.type='hidden';const wrap=document.createElement('div');wrap.className='cc-import-image-picker';wrap.innerHTML='<label>Recipe photo</label><input class="cc-import-image-search" type="text" placeholder="Search by recipe title or keywords"><button type="button" class="secondary cc-import-image-search-btn">Search images</button><div class="cc-import-image-selected"></div><div class="cc-import-image-results"></div>';input.parentElement.replaceWith(wrap);wrap.appendChild(input);const search=wrap.querySelector('.cc-import-image-search'),btn=wrap.querySelector('.cc-import-image-search-btn'),selected=wrap.querySelector('.cc-import-image-selected'),results=wrap.querySelector('.cc-import-image-results');search.value=recipe.name&&recipe.name!=='Imported recipe'?recipe.name:'';btn.disabled=search.value.trim().length<3;const show=()=>{const u=input.value.trim();selected.innerHTML=u?'<p class="small-note">Selected image</p><img src="'+esc(u)+'" class="cc-image-preview" alt="Selected recipe photo">':''};show();async function find(){const q=search.value.trim();if(q.length<3)return;btn.disabled=true;results.innerHTML='<p class="small-note">Searching images…</p>';try{const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(q+' food')+'&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*';const data=await fetch(api).then(r=>{if(!r.ok)throw Error('Image search failed');return r.json()});const pages=Object.values(data.query?.pages||{}).filter(p=>p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url).slice(0,5);results.innerHTML=pages.length?pages.map((p,i)=>{const u=p.imageinfo[0].thumburl||p.imageinfo[0].url;return '<button type="button" class="cc-import-image-option" data-u="'+esc(u)+'"><img src="'+esc(u)+'" alt="Food image '+(i+1)+'"><span>Use image '+(i+1)+'</span></button>'}).join(''):'<p class="small-note">No matching images found. Try fewer words.</p>';results.querySelectorAll('.cc-import-image-option').forEach(b=>b.onclick=()=>{input.value=b.dataset.u;show();results.querySelectorAll('.cc-import-image-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})}catch(e){results.innerHTML='<p class="small-note">Could not search images. Please try again.</p>'}finally{btn.disabled=false}}btn.onclick=find;search.addEventListener('input',()=>{btn.disabled=search.value.trim().length<3});search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}})}
function richValue(value){return Array.isArray(value)?value.join('\n'):String(value??'');}
function recipeLineCount(value){const text=richValue(value).replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ');return text.split(/\n+/).map(x=>x.trim()).filter(Boolean).length}
function editOne(id,x,recipes,i){
  const r=recipes[i];
  const editor=createGenericEditor({
    dialog,
    eyebrow:`REVIEW RECIPE ${i+1} OF ${recipes.length}`,
    title:'Check before saving',
    fields:[
      {label:'Recipe name',name:'name',value:r.name,required:true},
      {label:'Description',name:'description',value:richValue(r.description),type:'richtext'},
      {label:'Recipe photo',name:'image_url',value:r.image_url||'',type:'url',className:'cc-image-field'},
      {group:[
        {label:'Course',name:'course',value:r.course||'',type:'select',options:['',...courses]},
        {label:'Recipe type',name:'recipe_type',value:r.recipe_type||'Dish',type:'select',options:types}
      ]},
      {group:[
        {label:'Cuisine',name:'cuisine',value:r.cuisine||''},
        {label:'Dietary / suitability',name:'dietary_tags',value:Array.isArray(r.dietary_tags)?r.dietary_tags:[],type:'multiselect',options:dietaryOptions}
      ]},
      {label:'Servings',name:'servings',value:r.servings||''},
      {label:'Ingredients',name:'ingredients',value:richValue(r.ingredients),type:'richtext'},
      {label:'Method / process',name:'method',value:richValue(r.method),type:'richtext'},
      {label:'Notes / differences',name:'notes',value:richValue(r.notes),type:'richtext'}
    ],
    actions:{cancelLabel:'Cancel',saveLabel:'Save this recipe'},
    onCancel:()=>render(id,x,recipes),
    onClose:()=>render(id,x,recipes),
    onSave:async formData=>{
      recipes[i]={
        ...r,
        name:clean(editorValue(formData,'name')),
        description:sanitizeRichHtml(formData.get('description')||''),
        image_url:clean(editorValue(formData,'image_url')),
        course:clean(editorValue(formData,'course')),
        recipe_type:clean(editorValue(formData,'recipe_type'))||'Dish',
        cuisine:clean(editorValue(formData,'cuisine')),
        dietary_tags:formData.getAll('dietary_tags').map(v=>String(v).trim()).filter(Boolean),
        servings:clean(editorValue(formData,'servings')),
        ingredients:sanitizeRichHtml(formData.get('ingredients')||''),
        method:sanitizeRichHtml(formData.get('method')||''),
        notes:sanitizeRichHtml(formData.get('notes')||''),
        _reviewed:true
      };
      render(id,x,recipes);
    }
  });
  importImagePicker(editor.form,recipes[i]);
}
async function saveMany(id,x,selectedRecipes){
  const{data:{user}}=await sb.auth.getUser();
  if(!user)return window.ccShowError?.('Please sign in again.','Sign-in required')||alert('Please sign in again.');
  if(!selectedRecipes.length)return window.ccShowError?.('Please review and select at least one recipe before saving.','Nothing to save')||alert('Select at least one recipe.');

  const rows=selectedRecipes.map(r=>({name:clean(r.name),description:clean(r.description)||null,cuisine:clean(r.cuisine)||null,course:clean(r.course)||null,recipe_type:clean(r.recipe_type)||'Dish',servings:clean(r.servings)||null,ingredients:Array.isArray(r.ingredients)?r.ingredients:{html:sanitizeRichHtml(r.ingredients||'')},method:Array.isArray(r.method)?r.method.join('\n'):sanitizeRichHtml(r.method||''),personal_notes:Array.isArray(r.notes)?(r.notes.join('\n')||null):(sanitizeRichHtml(r.notes||'')||null),source_type:'file',source_url:null,source_title:x.file_name||null,image_url:clean(r.image_url)||null,created_by:user.id,visibility:'private'}));
  const{error}=await sb.from('cc_recipes').insert(rows);
  if(error){
    const raw=String(error.message||'');
    const duplicate=/cc_recipes_no_duplicate_names|duplicate key value violates unique constraint/i.test(raw);
    const friendly=duplicate
      ? 'One or more of the selected recipes is already in your collection. No duplicate recipe was created. Please use Edit on the existing recipe if you want to change it.'
      : raw;
    return window.ccShowError?.(friendly,duplicate?'Recipe already saved':'Could not save recipes')||alert(friendly);
  }

  // Keep the complete extracted upload intact. Only the selected/reviewed
  // recipes are written to the recipe collection; the original multi-recipe
  // extraction must remain available for later review.
  let allRecipes=selectedRecipes;
  try{
    const cached=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;
    if(cached?.multiple&&Array.isArray(cached.recipes)&&cached.recipes.length)allRecipes=cached.recipes.map(r=>{
      const saved=selectedRecipes.find(s=>String(s.name).trim().toLowerCase()===String(r.name).trim().toLowerCase());
      return saved?{...r,...saved,_reviewed:true}:r;
    });
  }catch(_){}
  const allReviewed=allRecipes.length>0&&allRecipes.every(r=>r._reviewed);
  const{error:ie}=await sb.from('cc_import_items').update({
    review_status:allReviewed?'approved':'pending',
    extraction_status:'ready',
    source_title:`${selectedRecipes.length} reviewed from ${x.file_name||'import'}`,
    extracted_text:JSON.stringify({version:6,multiple:true,recipes:allRecipes})
  }).eq('id',id);
  if(ie)return window.ccShowError?.(ie.message,'Could not update import')||alert(ie.message);
  dialog.close();
  await window.ccReloadRecipes?.();
  if(window.ccReloadImportInbox)await window.ccReloadImportInbox();
}
window.ccMultiReview=extract;

export { ocrImage, reviewImageImport };
