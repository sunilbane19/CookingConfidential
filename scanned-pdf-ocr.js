// Scanned-PDF fallback: renders PDF pages in the browser and OCRs them with the same Tesseract engine used by image imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let pdfPromise,tessPromise;
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/[ \t]+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(x=>x.length>1);
function loadPdf(){if(pdfPromise)return pdfPromise;pdfPromise=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';return pdf});return pdfPromise}
function loadTesseract(){if(tessPromise)return tessPromise;tessPromise=new Promise((resolve,reject)=>{if(window.Tesseract?.createWorker)return resolve(window.Tesseract);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.async=true;s.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('Image reader loaded without OCR support.'));s.onerror=()=>reject(new Error('Could not load the image reader on this browser.'));document.head.appendChild(s)});return tessPromise}
async function signedBlob(item){const path=item.file_path||item.original_file_path;if(!path)throw Error('Uploaded PDF path is missing.');const{data,error}=await sb.storage.from('cooking-confidential').createSignedUrl(path,600);if(error||!data?.signedUrl)throw Error(error?.message||'Could not read the uploaded PDF.');const r=await fetch(data.signedUrl);if(!r.ok)throw Error('Could not load the uploaded PDF.');return r.blob()}
function setProgress(text){const d=document.querySelector('#detailContent');if(d){const p=d.querySelector('.cc-pdf-progress');if(p)p.textContent=text}}
function normaliseOcr(text){let a=lines(text);a=a.map(x=>x.replace(/^[-•·*]+\s*/,'').replace(/\s*\|\s*/g,' ').replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/gi,'lb').replace(/\b1\s*\/\s*2\b/g,'½').replace(/\b1\s*\/\s*4\b/g,'¼').replace(/\b3\s*\/\s*4\b/g,'¾').replace(/\s{2,}/g,' ').trim()).filter(Boolean);const out=[];for(const x of a){if(out.some(y=>y.toLowerCase()===x.toLowerCase()))continue;out.push(x)}return out}
const SECTION=/^(ingredients?|ingredient list|what you need|method|directions?|instructions?|preparation|steps?|procedure|servings?|notes?|tips?|storage|serving suggestions?)\s*[:\-–—,]?\s*$/i;
const GARBAGE=/^(?:#\w+\s*){1,}$|^[^A-Za-z0-9]{0,4}$|^(?:a\s*_?i!?[.!,]?|ridiust|1t:|ii|l['’]?:::|ll:::|111|~111d11|uuvv1,|•~tJ,%JEI•|t~gether|t~:)$|^ponzu sauce is perfect for/i;
const TITLE_GENERIC=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|procedure|contents?|index|introduction|notes?|tips?|storage|serving suggestions?)$/i;
function titleScore(x){const t=clean(x).replace(/^[^A-Za-z]+/,'').replace(/[✨⭐🌟]+/g,'').trim();if(!t||TITLE_GENERIC.test(t)||GARBAGE.test(t)||t.length>100)return -1;let score=0;if(/\b(sauce|dip|dressing|curry|chutney|marinade|rub|paste|bread|cake|salad|soup|rice|chicken|fish|meat|pasta)\b/i.test(t))score+=5;if(t.length<=60)score+=2;if(/\([^)]{2,60}\)/.test(t))score+=2;if((t.match(/[A-Za-z]/g)||[]).length>=4)score+=1;if(/^by\s+/i.test(t))score-=4;return score}
function cleanGarbage(a){const out=[];for(const x of a){const t=clean(x);if(!t||GARBAGE.test(t)||/^#\w+/.test(t))continue;if(/^(?:ponzu sauce is perfect|recipe by nova's spice lab|stay tuned for more tasty dishes|we love sharing these recipes)/i.test(t))continue;out.push(t)}return out}
function deriveRecipe(text,fileName){
 const a=cleanGarbage(normaliseOcr(text));
 const ih=a.findIndex(x=>/^ingredients?(?:\s+list)?\s*[:\-–—,]?\s*$/i.test(x));
 const mh=a.findIndex(x=>/^(?:method|directions?|instructions?|preparation|steps?|procedure)\s*[:\-–—,]?\s*$/i.test(x));
 const endForIngredients=mh>ih&&ih>=0?mh:a.length;
 let ingredients=ih>=0?a.slice(ih+1,endForIngredients):a.filter(x=>/^(?:[-•·]\s*)?(?:\d|½|⅓|⅔|¼|¾|one|two|three|four|five|a\s+)/i.test(x)).slice(0,200);
 let method=mh>=0?a.slice(mh+1):[];
 if(mh<0){const split=ingredients.findIndex(x=>/^(?:instructions?|method|directions?)\s*[,\-:–—]?\s*$/i.test(x));if(split>=0){const marker=ingredients[split];const markerIndex=a.indexOf(marker);method=a.slice(markerIndex+1);ingredients=ingredients.slice(0,split)}}
 const proseCut=method.findIndex(x=>/^#\w+|^ponzu sauce is perfect|^recipe by /i.test(x));if(proseCut>=0)method=method.slice(0,proseCut);
 ingredients=ingredients.filter(x=>!SECTION.test(x)).slice(0,200);
 method=method.filter(x=>!SECTION.test(x)).join('\n').replace(/\s*\n\s*/g,'\n').trim();
 const pre=ih>0?a.slice(0,ih):a.slice(0,Math.min(12,a.length));let name=pre.map((x,i)=>({x,i,s:titleScore(x)})).filter(v=>v.s>=0).sort((u,v)=>v.s-u.s||u.i-v.i)[0]?.x||'';
 if(!name)name=clean(fileName.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '));
 name=name.replace(/^[^A-Za-z]+/,'').replace(/[✨⭐🌟]+/g,'').trim()||'Imported recipe';
 const desc=pre.find(x=>/^(?:a\s+tangy|a\s+rich|a\s+spicy|a\s+sweet|a\s+refreshing|a\s+classic|a\s+simple)/i.test(x))||'';
 return{name,description:desc,ingredients,method,cuisine:'',course:'',servings:'',raw_text:a.join('\n')};
}
export async function ocrScannedPdf(id){const{data:item,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!item)throw Error(error?.message||'Import item not found.');const blob=await signedBlob(item);const pdfjs=await loadPdf();const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;const T=await loadTesseract();const worker=await T.createWorker('eng');let full=[];try{for(let i=1;i<=pdf.numPages;i++){setProgress(`Reading scanned page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const base=page.getViewport({scale:2.2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(base.width);canvas.height=Math.ceil(base.height);await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:base}).promise;await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await worker.recognize(canvas);full.push(`--- Page ${i} ---\n${r.data.text||''}`);canvas.width=1;canvas.height=1}}finally{await worker.terminate()}const text=full.join('\n');if(!text.trim())throw Error('OCR could not find readable text in the scanned PDF.');const recipe=deriveRecipe(text,item.file_name||'Scanned recipe');const payload={version:2,scanned_pdf:true,recipe,raw_text:text};const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload),source_title:recipe.name,extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(ue)throw Error(ue.message);return{item:{...item,extracted_text:JSON.stringify(payload),source_title:recipe.name,extraction_status:'ready',review_status:'pending'},recipe};}
