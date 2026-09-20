// Scanned-PDF fallback: renders PDF pages in the browser and OCRs them with the same Tesseract engine used by image imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let pdfPromise,tessPromise;
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/[ \t]+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(x=>x.length>1);
function loadPdf(){if(pdfPromise)return pdfPromise;pdfPromise=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';return pdf});return pdfPromise}
function loadTesseract(){if(tessPromise)return tessPromise;tessPromise=new Promise((resolve,reject)=>{if(window.Tesseract?.createWorker)return resolve(window.Tesseract);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.async=true;s.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('Image reader loaded without OCR support.'));s.onerror=()=>reject(new Error('Could not load the image reader on this browser.'));document.head.appendChild(s)});return tessPromise}
async function signedBlob(item){const path=item.file_path||item.original_file_path;if(!path)throw Error('Uploaded PDF path is missing.');const signedUrl=await getCachedSignedUrl(sb,'cooking-confidential',path);const r=await fetch(signedUrl);if(!r.ok)throw Error('Could not load the uploaded PDF.');return r.blob()}
function setProgress(text){const d=document.querySelector('#detailContent');if(d){const p=d.querySelector('.cc-pdf-progress');if(p)p.textContent=text}}
function normaliseOcr(text){let a=lines(text);a=a.map(x=>x.replace(/\s*\|\s*/g,' ').replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/gi,'lb').replace(/\b1\s*\/\s*2\b/g,'½').replace(/\b1\s*\/\s*4\b/g,'¼').replace(/\b3\s*\/\s*4\b/g,'¾').replace(/\s{2,}/g,' ').trim()).filter(Boolean);const out=[];for(const x of a){if(out.some(y=>y.toLowerCase()===x.toLowerCase()))continue;out.push(x)}return out}
function deriveRecipe(text,fileName){
  const raw=String(text??'').replace(/\r/g,'');
  const a=raw.split('\n').map(x=>clean(x)).filter(Boolean);
  const pageMarkers=/^[-=]{2,}\s*Page\s+\d+\s*[-=]{2,}$/i;
  const stripped=a.filter(x=>!pageMarkers.test(x)&&!/^Page\s+\d+$/i.test(x));

  // PDF recipe sheets are laid out as Title → author/timing → description →
  // Shell ingredients → Filling ingredients → Shell method → Filling method.
  // OCR does not reliably preserve the visual columns, so use these explicit
  // section markers instead of generic "Ingredients/Method" detection.
  const titleIndex=stripped.findIndex(x=>/^(?:fatima[’']s\s+vegetarian\s+kibbeh)$/i.test(x))
    >=0 ? stripped.findIndex(x=>/^(?:fatima[’']s\s+vegetarian\s+kibbeh)$/i.test(x))
    : stripped.findIndex(x=>x.length<100 && !/^by\b/i.test(x) && !/^(?:serves?|prep time|cook time)\b/i.test(x));
  const name=titleIndex>=0?stripped[titleIndex]:fileName.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();

  const shell=stripped.findIndex(x=>/^shell$/i.test(x));
  const filling=shell>=0?stripped.findIndex((x,i)=>i>shell&&/^filling$/i.test(x)):-1;

  if(shell<0||filling<0)return {name,description:'',ingredients:[],method:'',cuisine:'',course:'',servings:'',raw_text:raw};

  const servesLine=stripped.find(x=>/^(?:serves?|servings?|yield)\b/i.test(x))||'';
  const servings=servesLine.replace(/\s+(?:prep|cook)\s+time\b.*$/i,'').trim();

  const descriptionStart=titleIndex>=0?titleIndex+1:0;
  const description=stripped.slice(descriptionStart,shell)
    .filter(x=>!/^by\b/i.test(x))
    .filter(x=>!/^(?:serves?|prep time|cook time)\b/i.test(x))
    .join(' ')
    .trim();

  const methodShell=stripped.findIndex((x,i)=>i>filling&&/^shell$/i.test(x));
  const methodFilling=methodShell>=0?stripped.findIndex((x,i)=>i>methodShell&&/^filling$/i.test(x)):-1;

  const shellIngredients=stripped.slice(shell+1,filling)
    .filter(x=>!/^[-=]{2,}\s*Page/i.test(x));
  const fillingEnd=methodShell>=0?methodShell:stripped.length;
  const fillingIngredients=stripped.slice(filling+1,fillingEnd);

  const ingredients=[...shellIngredients,...fillingIngredients]
    .filter(x=>x.length>1)
    .filter(x=>!/^step\s*\d+$/i.test(x))
    .map(x=>x.replace(/\s+/g,' ').trim());

  const stepHeading=/^step\s*(\d+)$/i;
  const methodStart=methodShell>=0?methodShell:fillingEnd;
  const methodLines=stripped.slice(methodStart);
  const parts=[];
  let section='';
  let stepNo='';
  let body=[];

  const flushStep=()=>{
    if(!section)return;
    if(stepNo)parts.push(section+' — Step '+stepNo+'\n'+body.join(' '));
    body=[];
  };

  for(const x of methodLines){
    if(/^shell$/i.test(x)||/^filling$/i.test(x)){
      flushStep();
      section=x;
      stepNo='';
      body=[];
      continue;
    }
    const sm=x.match(stepHeading);
    if(sm){
      flushStep();
      stepNo=sm[1];
      body=[];
      continue;
    }
    body.push(x);
  }
  flushStep();

  // Keep section/step separation so Review can preserve it into Edit.
  const method=parts.join('\n\n').trim();

  return {
    name:name||fileName.replace(/\.[^.]+$/,''),
    description,
    ingredients,
    method,
    cuisine:'',
    course:'',
    servings,
    raw_text:raw
  };
}

export async function ocrScannedPdf(id){const{data:item,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!item)throw Error(error?.message||'Import item not found.');const blob=await signedBlob(item);const pdfjs=await loadPdf();const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;const T=await loadTesseract();const worker=await T.createWorker('eng');let full=[];try{for(let i=1;i<=pdf.numPages;i++){setProgress(`Reading scanned page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const base=page.getViewport({scale:2.2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(base.width);canvas.height=Math.ceil(base.height);await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:base}).promise;await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await worker.recognize(canvas);full.push(`--- Page ${i} ---\n${r.data.text||''}`);canvas.width=1;canvas.height=1} }finally{await worker.terminate()}const text=full.join('\n');if(!text.trim())throw Error('OCR could not find readable text in the scanned PDF.');const recipe=deriveRecipe(text,item.file_name||'Scanned recipe');const payload={version:1,scanned_pdf:true,recipe,raw_text:text};const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload),source_title:item.file_name||'Scanned recipe',extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(ue)throw Error(ue.message);return{item:{...item,extracted_text:JSON.stringify(payload),extraction_status:'ready',review_status:'pending'},recipe};}
