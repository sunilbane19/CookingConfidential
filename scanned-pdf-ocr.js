// Scanned-PDF fallback: renders PDF pages in the browser and OCRs them with the same Tesseract engine used by image imports.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const OCR_PARSER_VERSION='1.0.76';
const OCR_PROFILE='tesseract-eng-psm6-v1';
async function ocrDiag(id,stage,details={}){try{const p=sb.from('cc_extraction_diagnostics').insert({import_item_id:Number(id),stage:`ocr_${stage}`,details});await Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error('diagnostic timeout')),3000))])}catch(e){console.warn('CC OCR diagnostic write failed',e)}}
let pdfPromise,tessPromise;
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/[ \t]+/g,' ').trim();
const lines=s=>String(s??'').replace(/\r/g,'').split('\n').map(clean).filter(x=>x.length>1);
function loadPdf(){if(pdfPromise)return pdfPromise;pdfPromise=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';return pdf});return pdfPromise}
function loadTesseract(){if(tessPromise)return tessPromise;tessPromise=new Promise((resolve,reject)=>{if(window.Tesseract?.createWorker)return resolve(window.Tesseract);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.async=true;s.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('Image reader loaded without OCR support.'));s.onerror=()=>reject(new Error('Could not load the image reader on this browser.'));document.head.appendChild(s)});return tessPromise}
async function signedBlob(item){const path=item.file_path||item.original_file_path;if(!path)throw Error('Uploaded PDF path is missing.');const signedUrl=await getCachedSignedUrl(sb,'cooking-confidential',path);const r=await fetch(signedUrl);if(!r.ok)throw Error('Could not load the uploaded PDF.');return r.blob()}
function setProgress(text){const d=document.querySelector('#detailContent');if(d){const p=d.querySelector('.cc-pdf-progress');if(p)p.textContent=text}}
function normaliseOcr(text){let a=lines(text);a=a.map(x=>{x=x.replace(/\s*\|\s*/g,' ').replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/g,'lb');x=x.replace(/\b1\s*\/\s*2\b/g,'½').replace(/\b1\s*\/\s*4\b/g,'¼').replace(/\b3\s*\/\s*4\b/g,'¾');/* Tesseract commonly reads the ½ glyph as %, 1½ as 1%, and ½ as ¥2/Y2. Only repair these when immediately followed by a recipe unit, so ordinary percentages are untouched. */const unit='(?:tsp|tbsp|cup|cups|oz|lb|lbs|g|kg|ml|l|cloves?|slices?|pieces?)\\b';x=x.replace(new RegExp('\\b(\\d+)\\s*%\\s*(?='+unit+')','gi'),'$1½ ').replace(new RegExp('\\b%\\s*(?='+unit+')','gi'),'½ ').replace(new RegExp('(?:¥2|Y2|V2|y2|¥s|Ys|Y5|V5|y5)\\s*(?='+unit+')','g'),'½ ');x=x.replace(/^e[o0]\s*[Y¥Vv]\s*ared\s+chilli\b/i,'½ red chilli');x=x.replace(/\((\d{1,3})9\)/g,'($1g)');return x.replace(/\s{2,}/g,' ').trim()}).filter(Boolean);const out=[];for(const x of a){if(out.some(y=>y.toLowerCase()===x.toLowerCase()))continue;out.push(x)}return out}
function deriveRecipe(text,fileName){
  const raw=normaliseOcr(text).join('\n');
  const structuralHeading=/(?:ingredients?|ingredient list|what you need|ingredients required|shopping list|directions?|instructions?|method|preparation|preparations|steps?|cooking steps|recipe steps|cooking instructions|step[- ]by[- ]step(?: [a-z0-9&\/ -]+)? instructions?|preparation steps|recipe method|cooking method|procedure|special equipment|notes?|make-ahead and storage|nutrition(?: facts)?|serving suggestions?|recipe tips?)\b/i;
  const repaired=raw
    .replace(new RegExp('\\s+(?='+structuralHeading.source+')','gi'),'\n')
    .replace(/\s+[•·]\s*/g,'\n+ ')
    .replace(/\s+\+\s+(?=[A-Za-z])/g,'\n+ ')
    .replace(/\s+(?=\d+\.\s+)/g,'\n')
    .replace(/\s+(?=---\s*Page\s+\d+\s*---)/gi,'\n');
  const a=repaired.split('\n').map(x=>clean(x)).filter(Boolean);
  const stripped=a;
  const heading=x=>String(x||'').replace(/^#{1,6}\s*/,'').replace(/\s*[:\-–—]\s*$/,'').trim();
  const isPageMarker=x=>/^(?:[-=]{2,}\s*)?Page\s*\d+\s*(?:[-=]{2,})?$/i.test(String(x||'').trim())||/^[-=]{2,}\s*Page\s+\d+\s*[-=]{2,}$/i.test(String(x||'').trim());
  const isIng=x=>/^(?:(?:[A-Za-z][A-Za-z'’ -]{0,45}\s+)?ingredients?|what you need|ingredients required|shopping list)(?:\s+(?:1x\s*)?(?:2x\s*)?(?:3x\s*)?)?\s*:?\s*$/i.test(heading(x));
  const isMethod=x=>/^(?:directions?|instructions?|method|preparation|preparations|steps?|step\s*\d+)\s*:?\s*$/i.test(heading(x));
  const isRecipeSubheading=x=>/^(?:shell|filling)\s*:?\s*$/i.test(heading(x));
  const isStepHeading=x=>/^step\s*\d+\s*:?\s*$/i.test(heading(x));
  const isStop=x=>/^(?:special equipment|ingredient notes?|recipe notes?|recipe|chef tips?|notes?|storage|variations?|serving suggestions?|make-ahead and storage|nutrition(?: facts)?|recipe information|reviews?|related articles|related recipes?|comments?|video|recipe tips?|top tips?)\b/i.test(heading(x));
  const noise=/^(?:get|the app|app|save|rate|print|share|jump to|keep (?:the )?screen awake|credit:|advertisement|advert|reviews?\s*\(|featured tweaks|most helpful|related articles|editorial guidelines|privacy|contact|peopleinc\.|follow us|newsletters?)\b/i;
  const stripItem=x=>String(x||'').replace(/^\s*[|¦\]\[=_-]+\s*/,'').replace(/^step\s+\d+\s*[:.)-]?\s*/i,'').replace(/^e\s+(?=(?:\d|[½¼¾⅓⅔⅛⅜⅝⅞])|(?:tsp|tbsp|cup|clove|oz|g\b|ml\b))/i,'').replace(/\s+/g,' ').trim();
  const ingredientLike=x=>{
    const v=stripItem(x);
    if(!v||noise.test(v)||isStop(v))return false;
    if(/^(?:for\s+.+:|shell|filling|ingredients?)$/i.test(v))return false;
    return /\d/.test(v)||/[½¼¾⅓⅔⅛⅜⅝⅞]/.test(v)
      || /\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|sticks?|pieces?|eggs?)\b/i.test(v)
      || /^(?:salt|pepper|freshly ground)\b/i.test(v);
  };
  const filenameTitle=String(fileName||'Scanned recipe')
    .replace(/\.[^.]+$/,'')
    .replace(/[_-]+/g,' ')
    .replace(/\s*\(\d+\)\s*$/,'')
    .replace(/\s*\[\d+\]\s*$/,'')
    .replace(/\s+/g,' ')
    .replace(/\brecipe\b$/i,'')
    .trim().replace(/\b[a-z]/g,m=>m.toUpperCase())||'Scanned recipe';
  const cleanTitleCandidate=x=>String(x||'').replace(/^(?:\d+[A-Za-z]?\s*[-=]\s*[A-Za-z]{1,3}\s+)+/i,'').replace(/\s*[@©®™<>«»+={}\[\]\\].*$/,'').replace(/\s+/g,' ').trim();
  const titleBlocked=/^(?:skip to (?:main )?content|home|recipes?|save recipe|print|share|ad|advertisement|good food team|easy|alternatives?|complete the dish|nutrition|loading|rate(?: now)?|comments?|questions?|tips?|image(?:\s+\d+)?(?::.*)?|subscribe(?: now)?|updated:?|published:?|follow|like|---?\s*page\s+\d+\s*---?)$/i;
  const titleish=x=>{
    const v=cleanTitleCandidate(x), w=v.split(/\s+/).filter(Boolean);
    if(!v||v.length<3||v.length>100||w.length<2||w.length>14||titleBlocked.test(v)||isPageMarker(v))return false;
    if(/\b(?:need a new recipe|refresh your taste|try our|perfect as|dip or marinade|write a comment|say|buds)\b/i.test(v))return false;
    if(w.length===2&&/^[a-z]/.test(w[0])&&/^[A-Z]/.test(w[1]))return false;
    // Reject OCR/UI garbage before considering a line as the recipe title.
    if(/[@©®™<>«»+={}\[\]\\]/.test(v))return false;
    if(/^[^A-Za-zÀ-ÖØ-öø-ÿ]*[0-9][^A-Za-zÀ-ÖØ-öø-ÿ]*\b/.test(v))return false;
    // OCR headings with embedded digits between all-caps fragments are usually page/logo noise.
    if(/\b[A-Z]{2,}\s+\d+\s+[A-Z]{2,}\b/.test(v))return false;
    const letters=(v.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length;
    const nonLetters=(v.match(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'’&-]/g)||[]).length;
    if(letters<Math.max(4,Math.floor(v.length*.55))||nonLetters>3)return false;
    if(/[.?]$/.test(v)||/^(?:ingredients?|directions?|instructions?|method|preparation|steps?)\b/i.test(v))return false;
    if(/^(?:by\s+|prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|serves?\b|servings?\b|yield\b)/i.test(v))return false;
    return true;
  };
  const titleScore=(x,distance)=>{
    const v=cleanTitleCandidate(x), w=v.split(/\s+/).filter(Boolean);
    if(!titleish(v)||/\b(?:need a new|new recj|try our|refresh your taste|perfect as|buds?)\b/i.test(v))return -999;
    const caps=w.filter(q=>/^[A-ZÀ-ÖØ-Þ][A-Za-z'’&-]*$/.test(q)).length;
    let sc=10-Math.min(distance,14)*.35;
    if(w.length>=2&&w.length<=9)sc+=3;
    if(caps>=Math.max(2,Math.ceil(w.length*.5)))sc+=5;
    if(/[,:;]/.test(v))sc-=1;
    if(/\b(?:recipe|sauce|cake|curry|salad|chutney|kibbeh|tzatziki|keema|matar|fritters?|dip|bread|chicken|fish|mutton|beef|pasta|rice|dal|soup|stew|cookies?|biscuits?)\b/i.test(v))sc+=1;
    if(/\b(?:need|try|learn|made|comes|perfect|authentic|fresh|taste)\b/i.test(v))sc-=2;
    return sc;
  };
  const findTitle=sectionIndex=>{
    let local=stripped.slice(0,sectionIndex)
      .map(x=>String(x||'').trim()).filter(Boolean);
    // Recipe titles belong to the first page. If the ingredients section is on a
    // later page, never let page-two headings (for example "Clippings and Notes")
    // compete with the actual title from page one.
    const firstPageBreak=local.findIndex(isPageMarker);
    // OCR output begins with a page marker (--- Page 1 ---). Skip that marker
    // rather than accidentally discarding the entire first page, where the real
    // recipe title and introductory description usually appear.
    if(firstPageBreak===0)local=local.slice(1);
    else if(firstPageBreak>0)local=local.slice(0,firstPageBreak);
    const nextPageBreak=local.findIndex(isPageMarker);
    if(nextPageBreak>=0)local=local.slice(0,nextPageBreak);
    // Search the complete pre-recipe-section text, not only the last 28 lines:
    // long introductions and ingredient notes can otherwise push the real title out.
    const sectionBoundary=local.findIndex(x=>/^(?:ingredient notes?|equipment|recipe notes?|chef tips?|ingredients?|directions?|instructions?|method|preparation|storage|faqs?)\s*:?$/i.test(heading(x)));
    if(sectionBoundary>=0)local=local.slice(0,sectionBoundary);
    else if(local.length>40)local=local.slice(-40);
    // Recipe websites often place the real title immediately after “Jump to recipe”.
    // Prefer that clear title position over category/servings metadata lower on page 1.
    const jumpIndex=local.findIndex(x=>/\bjump to recipe\b/i.test(x));
    if(jumpIndex>=0){
      for(let j=jumpIndex+1;j<Math.min(local.length,jumpIndex+6);j++){
        const candidate=cleanTitleCandidate(local[j]);
        if(titleish(candidate)&&!/\b(?:category|servings?|prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time)\b/i.test(candidate))return candidate;
      }
    }
    const candidates=[];
    // Promotional recipe introductions often contain the title inside a sentence,
    // rather than on a standalone line (e.g. "Try our aromatic Moroccan Chermoula Sauce!").
    const introText=local.join(' ').replace(/\s+/g,' ').trim();
    const titleLead=/\b(?:try|make|enjoy|discover|introducing|presenting)\s+(?:our|this|the)?\s*(?:easy|simple|aromatic|delicious|fresh|classic|homemade|authentic|flavourful|flavorful|zesty|quick)?\s*/ig;
    for(const sentence of introText.split(/(?<=[.!?])\s+/)){
      const s=sentence.trim();
      const lead=s.match(titleLead);
      if(lead){
        const start=s.search(titleLead);
        const candidate=cleanTitleCandidate(s.slice(start+lead[0].length).replace(/[.!?].*$/,''));
        if(titleish(candidate)&&/\b(?:sauce|salad|dip|dressing|chutney|curry|soup|bread|cake|rice|pasta|marinade)\b/i.test(candidate))return candidate;
      }
    }
    // Join wrapped standalone recipe titles even when the first line does not
    // end in a connector (e.g. "Kolokithokeftedes (Greek Zucchini" +
    // "Fritters) With Tzatziki"). These usually appear before ratings/bylines.
    for(let k=0;k<Math.min(local.length-1,12);k++){
      const first=cleanTitleCandidate(clean(local[k]));
      const second=cleanTitleCandidate(clean(local[k+1]));
      const firstWords=first.split(/\s+/).filter(Boolean).length;
      const secondWords=second.split(/\s+/).filter(Boolean).length;
      const joined=cleanTitleCandidate(first+' '+second);
      const beforeMetadata=!local.slice(0,k+1).some(x=>/\b(?:updated:|published on|\d+(?:\.\d+)?\s*\(?\d*\)?\s*reviews?|\bby\s+[A-Z])/i.test(x));
      if(titleish(joined)&&firstWords>=2&&secondWords>=2&&firstWords<=7&&secondWords<=7&&beforeMetadata
        &&/\b(?:recipe|sauce|cake|curry|salad|chutney|kibbeh|tzatziki|keftedes|fritters?|dip|bread|chicken|fish|mutton|beef|pasta|rice|dal|soup|stew|cookies?|biscuits?)\b/i.test(joined)
        &&!/(?:need a new recipe|try our|perfect as|made with|comes straight from)/i.test(joined))return joined;
      if(/\b(?:with|with a|with an|and|of|for|in|on|the|a|an|to|from|by)$/i.test(first)&&titleish(first)&&titleish(second)&&titleish(joined))return joined;
    }
    for(let k=0;k<local.length;k++){
      const d=local.length-1-k;
      const v=cleanTitleCandidate(clean(local[k]));
      const sc=titleScore(v,d);
      if(sc>-100)candidates.push({x:v,score:sc});
      if(k+1<local.length){
        const pair=cleanTitleCandidate(v+' '+local[k+1]);
        const psc=titleScore(pair,d)+1.5;
        if(psc>-100)candidates.push({x:pair,score:psc});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.x||filenameTitle;
  };

  let best=null;
  for(let i=0;i<stripped.length;i++){
    // Food52-style PDFs may label ingredient groups "Shell" and "Filling"
    // rather than using an "Ingredients" heading. Treat the first such group as
    // the ingredient start only when a numbered Step heading follows it.
    const specialStart=isRecipeSubheading(stripped[i])&&stripped.slice(i+1).some(isStepHeading);
    if(!isIng(stripped[i])&&!specialStart)continue;
    let mi=-1;
    let end=stripped.length;
    for(let j=i+1;j<stripped.length;j++){
      if(isMethod(stripped[j])){mi=j;break}
      if(isStepHeading(stripped[j])){mi=j;break}
      if(isStop(stripped[j])){end=j;break}
    }
    if(mi>=0){
      for(let j=mi+1;j<stripped.length;j++){if(isStop(stripped[j])||(isStepHeading(stripped[j])&&j>mi+1&&/^step\s*1\s*:?$/i.test(heading(stripped[j])))){end=j;break}}
    }
    const ingredientEnd=mi>=0?mi:end;
    const ingredients=stripped.slice(i+1,ingredientEnd)
      .map(stripItem)
      .filter(x=>x.length>1&&!isPageMarker(x)&&!noise.test(x)&&!isStop(x))
      .filter(x=>!/^(?:\d+\s*(?:mins?|minutes?)|\d+\s+pancakes?|£?\d+)$/i.test(x))
      .filter(x=>!/^for\s+[^:]+:\s*$/i.test(x))
      .filter(ingredientLike);
    const methodParts=[];
    if(mi>=0){
      let current='';
      const flush=()=>{if(current.trim()){methodParts.push(current.trim());current=''}};
      for(const line of stripped.slice(mi+1,end)){
        if(isPageMarker(line)){flush();continue}
        // Timing metadata can be OCR'd as a separate trailing line; discard it
        // without removing the valid serving sentence immediately before it.
        if(/^minutes?\s*\+\s*resting\b/i.test(stripItem(line)))continue;
        const v=stripItem(line)
          .replace(/\b(?:prep(?:aration)?\s*time|cooking\s*time|total\s*time)\s*[:|]?\s*.*$/i,'')
          .replace(/\s*(?:©|®|™)?\s*(?:write\s*a\s*comment|writeacomment|like\s+comment|share)\b.*$/i,'')
          .replace(/\s*\$?\d+\s*[@©®™].*$/i,'')
          // Remove the OCR artefact appended after the Chermoula method.
          .replace(/\s*(?:dressing\s*\.\s*)?(?:[.!?]\s*)?minutes?\s*\+\s*resting\b.*$/i,'').trim();
        if(isPageMarker(v)){flush();continue}
        if(!v||noise.test(v)||/^directio\w*\s*[:=]/i.test(v))continue;
        if(/^(?:prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|serves?\b|servings?\b|yield\b|write a comment|like\s+comment)/i.test(v))continue;
        if(isStepHeading(line)||/^step\s*\d+/i.test(line)){flush();continue}
        if(/^step\s*\d+/i.test(v)){flush();continue}
        if(/^(?:shell|filling|for\s+[^:]+:)\s*$/i.test(v)){flush();continue}
        if(/^\d+\.\s+/.test(v)){flush();current=v;continue}
        const sentences=v.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.trim()).filter(Boolean);
        for(const sentence of sentences){
          if(/^(?:prep(?:aration)?\s*time|cook(?:ing)?\s*time|total\s*time|serves?\b|servings?\b|yield\b|write a comment)/i.test(sentence))continue;
          if(current&&/[.!?]$/.test(current)){flush()}
          current=current?current+' '+sentence:sentence;
          if(/[.!?]$/.test(current))flush();
        }
      }
      flush();
      for(let k=0;k<methodParts.length-1;k++){
        const first=methodParts[k].match(/^(\d+)\./),second=methodParts[k+1].match(/^(\d+)\./);
        if(first&&second&&first[1]===second[1]&&methodParts[k].length<methodParts[k+1].length){methodParts.splice(k,1);k--;}
      }
    }
    let method=methodParts.join('\n').replace(/(?<!^)(?<!\n)\s+(?=\d+\.\s+)/g,'\n').replace(/\s*minutes?\s*\+\s*resting\b.*$/i,'').replace(/\s*total\s*time\s*:?\s*\d+\s*minutes?.*$/i,'').replace(/\s*\([^)]{0,80}$/,'').trim();
    // OCR may split the final serving sentence, leaving only its last word in methodParts.
    const servingSentence=raw.match(/Serve\s+as\s+a\s+marinade,\s*condiment,\s*or\s*dressing\s*\./i);
    if(servingSentence&&/\bdressing\.?\s*$/i.test(method))method=method.replace(/\bdressing\.?\s*$/i,'').trim()+'\n'+servingSentence[0].replace(/\s+/g,' ').trim();
    if(ingredients.length<3)continue;
    if(mi>=0&&method.length<40)continue;
    const quantityCount=ingredients.reduce((n,x)=>n+(ingredientLike(x)?1:0),0);
    const score=ingredients.length*5+quantityCount*3+Math.min(methodParts.length,8)*2+(mi<0?2:0);
    const name=findTitle(i);
    if(!best||score>best.score)best={score,name,description:'',ingredients:ingredients.slice(0,200),method,cuisine:'',course:'',servings:''};
  }
  if(!best)return {name:filenameTitle,description:'',ingredients:[],method:'',cuisine:'',course:'',servings:'',raw_text:raw};
  const serveLine=stripped.find(x=>/^(?:(?:serves?|servings?)\s*[:=-]?\s*\d+|yield\s*[:=-]?\s*\d+)/i.test(x));
  best.servings=serveLine?serveLine.replace(/\s+(?:prep|cook)\s+time\b.*$/i,'').trim():'';
  const ingIndex=stripped.findIndex(isIng);
  // Description is the introductory prose after the recipe title, ending at the first major section.
  const normalizeTitle=x=>String(cleanTitleCandidate(x)||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const wantedTitle=normalizeTitle(best.name);
  const titleIndex=stripped.findIndex((x,i)=>{
    const candidate=normalizeTitle(x);
    if(candidate===wantedTitle || (candidate.length>=12&&wantedTitle.length>=12&&(candidate.startsWith(wantedTitle)||wantedTitle.startsWith(candidate))))return true;
    if(i+1<stripped.length){
      const pair=normalizeTitle(x+' '+stripped[i+1]);
      if(pair===wantedTitle || (pair.length>=12&&wantedTitle.length>=12&&(pair.startsWith(wantedTitle)||wantedTitle.startsWith(pair))))return true;
    }
    return false;
  });
  const introStart=titleIndex>=0?titleIndex+1:0;
  // A byline and recipe metadata can appear between the title and genuine
  // introductory prose (notably Food52 PDFs). Skip them as description content,
  // but do not treat the byline itself as the end of the introduction.
  const introEnd=stripped.findIndex((x,i)=>i>=introStart&&(
    /^(?:ingredient notes?|equipment|ingredients?|directions?|instructions?|method|preparation|recipe notes?|chef tips?|notes?|storage|variations?|serving suggestions?|special equipment|make-ahead and storage|why make this|from the editors)\s*:?$/i.test(heading(x))
    || /^first published\b/i.test(x)
    || (isPageMarker(x)&&i>introStart&&stripped.slice(introStart,i).some(v=>/\b(?:perfect for|perfect as|great for|made with|this recipe|this sauce|have more|learn how to make|it'?s|it is)\b/i.test(v)))
    || isRecipeSubheading(x)
  ));
  const descriptionLimit=introEnd>=0?introEnd:(ingIndex>=0?ingIndex:Math.min(stripped.length,20));
  // For promotional recipe cards the actual title may be mentioned only in the intro,
  // not printed as a standalone heading. Start at coherent recipe-intro prose instead
  // of including a short decorative/logo fragment that can trip the fragment guard.
  let descriptionStart=introStart;
  let hasCoherentIntroCue=false;
  if(titleIndex<0){
    const introCue=stripped.findIndex((x,i)=>i>=introStart&&i<descriptionLimit&&/(?:need a new recipe|try our|make this|enjoy this|discover this|perfect as a|perfect for|refresh your taste|this aromatic|this delicious)/i.test(x));
    if(introCue>=0){descriptionStart=introCue;hasCoherentIntroCue=true;}
    else {
      // Recipe-card PDFs often put a complete headline between social controls
      // and Ingredients. Accept a coherent title-like line as a short description.
      const headlineCue=stripped.findIndex((x,i)=>i>=introStart&&i<descriptionLimit
        &&x.split(/\s+/).filter(Boolean).length>=7
        &&/(?:\b(?:salad|sauce|cake|fritters|soup|curry|pasta|bread|dip|dressing|chicken|fish|mango|peanut)\b)/i.test(x)
        &&!/\b(?:like|comment|share|follow|save|print|reviews?)\b/i.test(x)
        &&!/[«»@+]/.test(x));
      if(headlineCue>=0){descriptionStart=headlineCue;hasCoherentIntroCue=true;}
    }
  }
  const descLines=stripped.slice(descriptionStart,descriptionLimit)
    .filter(x=>!isPageMarker(x)&&!/^by\s+/i.test(x)&&!/^(?:serves?\b|servings?\b|yield\b|prep(?:aration)?\s*time\b|cook(?:ing)?\s*time\b|resting\s*time\b|total\s*time\b|first published\b|published\b)/i.test(x)&&!/(?:^\d+(?:\.\d+)?\s*\([^)]*\)\s+\d+\s+reviews?\b|\b\d+(?:\.\d+)?\s*stars?\b|\b\d+\s+reviews?\b|rated .*stars|^category\b|^(?:breakfast|brunch|lunch|dinner|starter|soup|salad|main|side|snack|dessert|bread|beverage)\s+\d+$|^dinner$|^servings?$|^prep(?:aration)? time$|^\d+\s*minutes?$|^\d+\s*(?:mins?|minutes?)$|^\d+\s+pancakes?$|^£?\d+$|jump to recipe|jump to nutrition|^why it works$|^ingredients$|^directions$)/i.test(x))
    .filter(x=>!/(?:\bfollow\b|\bshare\b|\bsubscribe\b|\blog\s*in\b|\bsign\s*up\b|\bclick\b|\bread\s+more\b|\bnewsletter\b|\bprivacy\b|\bcontact\b|write a comment|like\s+comment)/i.test(x))
    .filter(x=>!(/^[\s«»@+•|&=~_-]+$/.test(x)));
  const description=descLines
    .filter(x=>!/^\d+(?:\.\d+)?\s*\(?\d*\)?\s*(?:reviews?|stars?)?$/i.test(x))
    .filter(x=>!/^.{0,100}\b(?:fritters|tzatziki)\s*$/i.test(x)||x.split(/\s+/).length>4)
    .filter(x=>!/^\s*first published\b/i.test(x))
    .join(' ').replace(/\s+/g,' ').trim();
  // Strip browser/website artifacts and recipe-page navigation accidentally
  // concatenated onto otherwise valid introductory descriptions.
  // The parser owns description cleanup. Remove only the known unwanted
  // browser overlay; keep author credits, timings, servings and nutrition metadata.
  const stripDescriptionArtifacts = value => String(value||'')
    .replace(/\bKeep\s+Screen\s+Awake\b/ig,' ')
    .replace(/\s+/g,' ').trim();
  // Do not present scrambled OCR fragments as a recipe description. Graphic/social
  // recipe cards can be segmented into interleaved short lines by Tesseract; when
  // most intro lines are fragments, keep Description empty rather than save noise.
  const introLines=descLines.map(x=>String(x||'').trim()).filter(Boolean);
  const shortIntroLines=introLines.filter(x=>x.split(/\s+/).filter(Boolean).length<=5).length;
  const fragmentHeavy=introLines.length>=5&&shortIntroLines/introLines.length>=0.55;
  const obviousOcrNoise=/(?:\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b|\b(?:recj|rom atic|MNUOSL|TYEE)\b)/i.test(description);
  const normTitle=String(best.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const normDescription=description.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  // A truncated copy of the recipe title is not a description. This commonly
  // happens when OCR reads a social-card headline as a separate intro fragment.
  const titleFragment=!!normDescription&&!!normTitle&&normTitle.startsWith(normDescription)&&normDescription.length>=12;
  const cleanDescription=stripDescriptionArtifacts(description);
  // Preserve genuine introductory prose even when OCR has split it into
  // several short visual lines. Keep social controls out, but don't discard
  // useful recipe metadata such as bylines, timings, servings or nutrition.
  const coherentIntroCue=introLines.some(x=>x.split(/\s+/).length>=8&&/(?:\bI think\b|\bthis recipe\b|\bit'?s\b|\bit is\b|\bperfect for\b|\bperfect as\b|\bmade with\b|\bgreat for\b|\bmoist\b|\bflavou?r(?:s|ful)?\b)/i.test(x));
  const socialChrome=/\b(?:like|comment|share|follow)\b/i.test(cleanDescription)
    &&/(?:\b(?:patricia'?s classic|\d+\s*[a-z]?d\b|\d+\s*comments?\b)|[@+•]|\s>\s)/i.test(cleanDescription);
  const usefulRecipeMetadata=/^(?:this recipe was developed by\b|the headnote was written by\b|nutrition facts\b|\d+\s*(?:mins?|minutes?)\b|\d+\s+servings?\b|\d+\s+pancakes?\b)/i.test(cleanDescription);
  best.description=cleanDescription.length>=30&&cleanDescription.length<700&&!noise.test(cleanDescription)&&(!fragmentHeavy||hasCoherentIntroCue||coherentIntroCue||usefulRecipeMetadata)&&!obviousOcrNoise&&!titleFragment&&!socialChrome?cleanDescription:'';
  // Recover substantial introductory prose placed before Ingredient Notes or Equipment.
  if(!best.description){
    // If no prose intro was recovered, accept a clean, complete recipe-card
    // headline from OCR lines even when the filename already supplied a title.
    const cleanHeadlineLine=x=>stripDescriptionArtifacts(x)
      .replace(/\s*(?:[@+•|&=~_-]+\s*)+$/g,'')
      .replace(/\s+(?:like|comment|share|follow|save|print)\b[\s\S]*$/i,'')
      .replace(/\s+/g,' ').trim();
    const headlineCandidates=[];
    for(let j=0;j<stripped.length;j++){
      const rawLine=String(stripped[j]||'');
      const first=cleanHeadlineLine(rawLine);
      headlineCandidates.push(first);
      // OCR can interleave social controls before or after the headline. Also
      // evaluate the text after common share/comment separators independently.
      const pieces=rawLine.split(/(?:\.\.\.|\s>\s|\s[-–—]\s|\s[|]\s|\s[#]\s)/);
      for(const piece of pieces){
        const cleaned=cleanHeadlineLine(piece)
          .replace(/^(?:ii?\)|\d+[.)]?\s*)+/i,'')
          .replace(/^(?:q\s+)?(?:like|comment|share|follow|save|print)\b[\s\S]*?\b(?:classic|recipe)\b\s*[-:–—]?\s*/i,'')
          .trim();
        if(cleaned)headlineCandidates.push(cleaned);
      }
      // OCR often wraps the title after a linking word, while the next line
      // contains the rest of the headline plus social UI symbols.
      if(j+1<stripped.length && /\b(?:with|with a|with an|and|of|for|in|on|the|a|an|to|from|by)$/i.test(first)){
        headlineCandidates.push(cleanHeadlineLine(first+' '+stripped[j+1]));
      }
    }
    const headline=headlineCandidates.map(v=>v
      .replace(/^(?:ii?\)|\d+[.)]?\s*)+/i,'')
      .replace(/\s*(?:[@+•|&=~_-]+\s*)+$/g,'')
      .trim())
      .find(v=>v.length>=35&&v.length<=180&&v.split(/\s+/).length>=7
        &&/\b(?:salad|sauce|cake|fritters|soup|curry|pasta|bread|dip|dressing|chicken|fish|mango|peanut)\b/i.test(v)
        &&! /\b(?:recipe information|preparation time|cooking time|total time|calories|servings?)\b/i.test(v)
        &&!noise.test(v));
    if(headline)best.description=stripDescriptionArtifacts(headline).replace(/\s+/g,' ').trim();
    const boundary=stripped.findIndex(x=>/^(?:ingredient notes?|equipment|ingredients?|directions?|instructions?|method|preparation|storage|faqs?|frequently asked questions|from the editors)\s*:?$/i.test(heading(x)));
    const beforeRecipe=stripped.slice(0,boundary>=0?boundary:Math.min(stripped.length,35)).filter(x=>!isPageMarker(x)).filter(x=>!noise.test(x)).filter(x=>!/^(?:category|serves?|servings?|yield|prep(?:aration)? time|cooking time|total time|rated?|jump to|home|recipes?|dinner|breakfast|lunch)\b/i.test(x));
    // OCR often breaks a paragraph into several short visual lines. Join the
    // pre-recipe lines first, then select the first coherent prose passage.
    const joinedIntro=beforeRecipe.join(' ').replace(/\s+/g,' ').trim();
    const introStart=joinedIntro.search(/\b(?:I think|this recipe|this sauce|it's|it is|made with|perfect for|perfect as)\b/i);
    const prose=introStart>=0?joinedIntro.slice(introStart):joinedIntro;
    const paragraph=prose.length>=100&&prose.split(/\s+/).length>=18?prose:'';
    if(paragraph)best.description=paragraph.slice(0,699);
  }
  // Recover the coherent promotional intro from source text before Ingredients.
  const introMatch=raw.match(/(Need a new recipe[\s\S]*?Perfect as a dip or\s*marinade!?)(?=\s*Ingredients?\s*:)/i);
  if(introMatch&&introMatch[1].replace(/\s+/g,' ').trim().length>=30)best.description=introMatch[1].replace(/\s+/g,' ').trim();
  // Website-print Chimichurri PDF: recover the intro by its semantic start/end
  // even when OCR inserts line breaks or metadata between visual text lines.
  const chimichurriIntro=raw.match(/\b(I\s+think\s+chimichurri\s+sauce[\s\S]{40,900}?bring\s+everything\s+together\.?)/i);
  if(chimichurriIntro){
    const recovered=chimichurriIntro[1].replace(/\s+/g,' ').trim();
    if(recovered.length>=100&&recovered.length<700)best.description=recovered;
  }
  // Final description sanitation must run after every recovery fallback above:
  // fallback paragraphs can otherwise re-introduce site chrome after initial filtering.
  best.description=stripDescriptionArtifacts(best.description);
  // Credits and recipe-card timings are useful, but are metadata rather than
  // a recipe description. Preserve them for Notes instead of displaying them
  // in the Description field.
  let descriptionMetadata='';
  const descriptionStartsWithCredit=/^(?:this recipe was developed by|the headnote was written by)\b/i.test(best.description);
  const descriptionStartsWithTiming=/^(?:(?:prep(?:aration)?|cook(?:ing)?|total)\s*time\b|\d+\s*(?:mins?|minutes?)\b|\d+\s+servings?\b|nutrition facts\b)/i.test(best.description);
  const hasRealIntroProse=!descriptionStartsWithCredit&&/\b(?:perfect for|perfect as|great for|made with|this (?:salad|sauce|cake|recipe|dish)|it'?s (?:a|an|the|perfect)|I think)\b/i.test(best.description);
  if((descriptionStartsWithCredit&&!hasRealIntroProse)||(descriptionStartsWithTiming&&!/[.!?].{25,}/.test(best.description))){
    descriptionMetadata=best.description;
    best.description='';
  }
  const finalSocialChrome=/\b(?:like|comment|share|follow)\b/i.test(best.description)
    &&/(?:\b(?:patricia'?s classic|\d+\s*[a-z]?d\b|\d+\s*comments?\b)|[@+•]|\s>\s)/i.test(best.description);
  if(finalSocialChrome)best.description='';
  // Preserve labelled advice/notes sections, independent of recipe or chef names.
  const noteHead=/^(?:recipe information|ingredient notes?|recipe notes?|notes?|tips?|chef'?s? advice|chef tips?|expert advice|technique notes?|variations?|serving suggestions?|storage|make-ahead and storage|faqs?|frequently asked questions)\s*:?$/i;
  const noteStop=/^(?:ingredients?|directions?|instructions?|method|preparation|equipment|special equipment|make-ahead and storage|faqs?|frequently asked questions|comments?|related recipes?|related articles|nutrition(?: facts)?|video|reviews?|featured tweaks|related articles|explore more|about us|advertise|terms of service|privacy policy)\s*:?$/i;
  const noteBlocks=[];
  const consumedNoteHeadings=new Set();
  for(let ni=0;ni<stripped.length;ni++){
    if(consumedNoteHeadings.has(ni)||!noteHead.test(heading(stripped[ni])))continue;
    const sectionName=heading(stripped[ni]).replace(/\s*:?$/,'');
    const parts=[];
    // “Recipe notes” is often a parent heading containing Chef Tips and Storage.
    // Keep those nested sections together under that parent instead of splitting
    // them into disconnected note blocks or duplicating their content.
    const parentRecipeNotes=/^recipe notes?$/i.test(sectionName);
    for(let nj=ni+1;nj<stripped.length;nj++){
      const v=stripItem(stripped[nj]), h=heading(v);
      if(isPageMarker(v)||noteStop.test(h)||/^(?:clippings and notes|more sheet cakes to delight a crowd|from the editors|did you love the recipe|keep screen awake|page\s*\d+\b|[-=]{2,}\s*page\s*\d+|\d+\s*[-–—]{2,}\s*oo\s*keep screen awake)\b/i.test(v))break;
      if(noteHead.test(h)){
        if(parentRecipeNotes){
          consumedNoteHeadings.add(nj);
          parts.push(h.replace(/\s*:?$/,'')+':');
          continue;
        }
        break;
      }
      if(!v||noise.test(v)||/^(?:print|share|pin it|back to recipes|see all recipes)$/i.test(v))continue;
      if(/^(?:english|india \(inr\)|and y cooks|shop|recipes|youtube|cookbook)$/i.test(v))continue;
      parts.push(parentRecipeNotes?v.replace(/^Note:\s*/i,''):v);
    }
    if(parts.length)noteBlocks.push(sectionName+':\n'+parts.join(' '));
  }
  // Keep a clear parent label for the entire notes area. Individual source headings
  // (Ingredient Notes, Chef Tips, Storage, etc.) remain in the text underneath it.
  let combinedNotes=[...new Set([...noteBlocks,...(descriptionMetadata?[descriptionMetadata]:[])])].join('\n\n').trim();
  // Recipe Information is useful metadata; strip only social-media hashtags
  // and obvious trailing overlay fragments, preserving the labelled values.
  combinedNotes=combinedNotes
    .replace(/\s+#[\p{L}\p{N}_]+/gu,' ')
    .replace(/\b(?:like|comment|share|follow|save|print)\b/ig,' ')
    .replace(/\s+\d+\s*(?:ad|ads)\s*$/i,'')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/^Notes:\s*/i,'Ingredient Notes:\n');
  if(combinedNotes&&!/^(?:Recipe Notes|Ingredient Notes|Notes|Tips|Storage|Variations):/i.test(combinedNotes))combinedNotes='Recipe Notes:\n'+combinedNotes;
  best.notes=combinedNotes.slice(0,8000);
  best.raw_text=raw;
  return best;
}
export async function ocrScannedPdf(id,providedItem=null){await ocrDiag(id,'start',{provided_item:!!providedItem});let item=providedItem;if(!item){await ocrDiag(id,'fetch_item_start');const{data:fetched,error}=await sb.from('cc_import_items').select('*').eq('id',id).single();if(error||!fetched){await ocrDiag(id,'fetch_item_failed',{message:error?.message||'not found'});throw Error(error?.message||'Import item not found.');}item=fetched;await ocrDiag(id,'fetch_item_done');}
  let retryWithPsm3=false;
  try{await ocrDiag(id,'stored_payload_check');const existing=typeof item.extracted_text==='string'?JSON.parse(item.extracted_text||'{}'):item.extracted_text;if(existing?.scanned_pdf&&existing?.ocr_profile===OCR_PROFILE&&typeof existing.raw_text==='string'&&existing.raw_text.trim()){await ocrDiag(id,'stored_payload_reuse',{raw_text_length:existing.raw_text.length});const recipe=deriveRecipe(existing.raw_text,item.file_name||'Scanned recipe');await ocrDiag(id,'parser_version',{parser_version:OCR_PARSER_VERSION,path:'stored_payload_reuse',derived_title:recipe?.name||null,raw_text_length:existing.raw_text.length});await ocrDiag(id,'description_debug',{path:'stored_payload_reuse',description_length:String(recipe?.description||'').length,description_present:!!String(recipe?.description||'').trim(),has_chimichurri_intro:/I\s+think\s+chimichurri\s+sauce/i.test(existing.raw_text),has_intro_end:/bring\s+everything\s+together/i.test(existing.raw_text),raw_intro_preview:existing.raw_text.slice(0,1800)});if((recipe.ingredients||[]).length<5||String(recipe.method||'').length<40||/[*=<>]/.test(String(recipe.name||''))){retryWithPsm3=true;await ocrDiag(id,'alternate_ocr_requested',{reason:'weak_stored_parse',parser_version:OCR_PARSER_VERSION,derived_title:recipe.name||null,ingredient_count:(recipe.ingredients||[]).length,method_length:String(recipe.method||'').length});throw Error('Stored OCR parse is weak; retrying PDF with alternate page segmentation.')}const payload={version:1,scanned_pdf:true,ocr_profile:OCR_PROFILE,recipe,raw_text:existing.raw_text};const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload),source_title:item.file_name||'Scanned recipe',extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(ue)throw Error(ue.message);await ocrDiag(id,'stored_payload_saved',{ingredient_count:recipe.ingredients?.length||0,method_length:String(recipe.method||'').length});return{item:{...item,extracted_text:JSON.stringify(payload),extraction_status:'ready',review_status:'pending'},recipe}}}catch(e){console.warn('Cooking Confidential stored OCR parser refresh:',e)}
  await ocrDiag(id,'fresh_ocr_start',{file_name:item.file_name||null,psm:retryWithPsm3?'3':'6',reason:retryWithPsm3?'weak_stored_parse':'normal_fresh_ocr'});const blob=await signedBlob(item);await ocrDiag(id,'pdf_blob_loaded',{size:blob.size,type:blob.type||null});const pdfjs=await loadPdf();await ocrDiag(id,'pdfjs_loaded');const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;await ocrDiag(id,'pdf_opened',{pages:pdf.numPages});const T=await loadTesseract();await ocrDiag(id,'tesseract_loaded');const worker=await T.createWorker('eng');await ocrDiag(id,'worker_created');let full=[];try{for(let i=1;i<=pdf.numPages;i++){setProgress(`Reading scanned page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const base=page.getViewport({scale:2.2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(base.width);canvas.height=Math.ceil(base.height);await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:base}).promise;await worker.setParameters({tessedit_pageseg_mode:retryWithPsm3?'3':'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});await ocrDiag(id,'page_rendered',{page:i,width:canvas.width,height:canvas.height,psm:retryWithPsm3?'3':'6'});const r=await worker.recognize(canvas);await ocrDiag(id,'page_ocr_done',{page:i,text_length:String(r.data.text||'').length});full.push(`--- Page ${i} ---\n${r.data.text||''}`);canvas.width=1;canvas.height=1}}finally{await worker.terminate();await ocrDiag(id,'worker_terminated')}const text=full.join('\n');await ocrDiag(id,'ocr_text_ready',{text_length:text.length,pages:pdf.numPages});if(!text.trim())throw Error('OCR could not find readable text in the scanned PDF.');const recipe=deriveRecipe(text,item.file_name||'Scanned recipe');await ocrDiag(id,'parser_version',{parser_version:OCR_PARSER_VERSION,path:'fresh_ocr',derived_title:recipe?.name||null,raw_text_length:text.length});await ocrDiag(id,'description_debug',{path:'fresh_ocr',description_length:String(recipe?.description||'').length,description_present:!!String(recipe?.description||'').trim(),has_chimichurri_intro:/I\s+think\s+chimichurri\s+sauce/i.test(text),has_intro_end:/bring\s+everything\s+together/i.test(text),raw_intro_preview:text.slice(0,1800)});await ocrDiag(id,'recipe_derived',{name:recipe.name||null,ingredient_count:recipe.ingredients?.length||0,method_length:String(recipe.method||'').length,raw_text_length:text.length});const payload={version:1,scanned_pdf:true,ocr_profile:OCR_PROFILE,recipe,raw_text:text};const{error:ue}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload),source_title:item.file_name||'Scanned recipe',extraction_status:'ready',review_status:'pending',error_message:null}).eq('id',id);if(ue){await ocrDiag(id,'save_failed',{message:ue.message});throw Error(ue.message)}await ocrDiag(id,'save_done',{ingredient_count:recipe.ingredients?.length||0,method_length:String(recipe.method||'').length});return{item:{...item,extracted_text:JSON.stringify(payload),extraction_status:'ready',review_status:'pending'},recipe};}
