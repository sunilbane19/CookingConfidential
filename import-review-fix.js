import { supabase } from './supabase-client-legacy.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import { checkRecipeQuality } from './recipe-quality.js?v=1.0.4';
import { readSourceTextWithVision } from './vision-text-reader.js?v=1.0.0';
import { createGenericEditor, editorValue, sanitizeRichHtml as sanitizeGenericRichHtml } from './generic-editor.js?v=1.3.10';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
async function extractionDiag(itemId,stage,details={}){try{const p=supabase.from('cc_extraction_diagnostics').insert({import_item_id:Number(itemId),stage,details});await Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error('diagnostic timeout')),5000))])}catch(e){console.warn('CC extraction diagnostic write failed',e)}}

const detailDialog=document.querySelector('#detailDialog'),importDialog=document.querySelector('#importDialog');
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const decodeEntities=s=>{let v=String(s??'');for(let i=0;i<2;i++){const t=document.createElement('textarea');t.innerHTML=v;const n=t.value;if(n===v)break;v=n}return v};
const clean=s=>decodeEntities(String(s??'').replace(/\s*\[[\s\d,;,-]+\]\s*/g,' ').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ')).replace(/[^\S\r\n]+/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const cleanMethod=s=>clean(s);
const sanitizeRichHtml=s=>String(s??'')
  .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'')
  .replace(/javascript:/gi,'')
  .trim();
const textToRichHtml=s=>String(s??'').split(/\n/).map(v=>decodeEntities(v).trim()).map(v=>v?`<div>${esc(v)}</div>`:'<div><br></div>').join('');
const courses=['','Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage','Ingredient'];
const types=['','Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
function mountReviewRichText(form,name,label){const ta=form.querySelector(`textarea[name="${CSS.escape(name)}"]`);if(!ta)return;const oldLabel=ta.closest('label');const wrap=document.createElement('div');wrap.className='rich-field';const initial=String(ta.value||'');const safe=initial.split(/\r?\n/).map(v=>v?'<div>'+esc(decodeEntities(v))+'</div>':'<div><br></div>').join('');wrap.innerHTML='<label>'+esc(label)+'</label><div class="rich-toolbar" role="toolbar" aria-label="'+esc(label)+' formatting"><button type="button" class="rich-tool" data-command="bold">B</button><button type="button" class="rich-tool" data-command="italic">I</button><button type="button" class="rich-tool" data-command="underline">U</button><button type="button" class="rich-tool" data-command="insertUnorderedList">•</button><button type="button" class="rich-tool" data-command="insertOrderedList">1.</button></div><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true">'+safe+'</div>';const hidden=document.createElement('input');hidden.type='hidden';hidden.name=name;hidden.value=initial;if(oldLabel)oldLabel.replaceWith(wrap);else ta.replaceWith(wrap);wrap.appendChild(hidden);ta.remove();const ed=wrap.querySelector('.rich-editor');const sync=()=>{hidden.value=ed.innerHTML};ed.addEventListener('input',sync);ed.addEventListener('blur',sync);wrap.querySelectorAll('.rich-tool').forEach(btn=>{btn.addEventListener('mousedown',e=>e.preventDefault());btn.addEventListener('click',()=>{ed.focus();document.execCommand(btn.dataset.command,false,null);sync()})});sync()}

function selectField(label,name,list,value){const v=String(value||'');const known=list.includes(v);return `<label>${label}<select name="${name}">${list.map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(o||'Select…')}</option>`).join('')}<option value="__custom__" ${v&&!known?'selected':''}>Other / custom…</option></select><input name="${name}_custom" placeholder="Enter category" style="display:${v&&!known?'block':'none'};margin-top:8px" value="${v&&!known?esc(v):''}"></label>`}
function parseRecipe(x){
  const rawFileTitle=String(x?.file_name||'Imported recipe').replace(/\.[^.]+$/,'').replace(/^\s*\d+[-_\s]+/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const fileTitle=rawFileTitle||'Imported recipe';
  const badTitle=/^(?:\*+|(?:\*\s*){2,}|_+|-+|=+|search(?:\s*\[|\s*$)|search\b|food52\b|home$|recipes?$|save recipe$|print$|share$|0 items? in your cart$|skip to main content$|advertisement$|loading$|menu$|subscribe$)/i;
  const usableTitle=v=>{
    const s=clean(String(v||'')).replace(/^[*_\-#\s]+|[*_\-#\s]+$/g,'').replace(/\s+/g,' ').trim();
    if(!s||badTitle.test(s)||s.length<3||s.length>160)return '';
    if(/^(?:https?:\/\/|\[[^\]]*\]\(https?:\/\/)/i.test(s))return '';
    if(/^(?:\*\s*)+$/.test(s))return '';
    return s;
  };
  const titleQuality=s=>{
    const v=usableTitle(s); if(!v)return 0;
    const letters=(v.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length;
    const words=v.split(/\s+/).filter(Boolean);
    let score=letters/Math.max(1,v.length);
    if(words.length>=2)score+=.18;
    if(/[A-Za-zÀ-ÖØ-öø-ÿ].*[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v))score+=.08;
    if(/[,:;()\[\]{}]/.test(v))score-=.08;
    return score;
  };
  const filenameTitle=v=>{
    const s=clean(String(v||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim());
    if(!s||/^\d+$/.test(s))return '';
    return s.replace(/\s+recipe$/i,'').trim();
  };
  let r={name:fileTitle,ingredients:[],method:'',cuisine:x?.inferred_cuisine||'',course:x?.inferred_course||'',servings:'',description:''};
  if(x?.extracted_text){
    try{
      const j=JSON.parse(x.extracted_text),s=j.recipe&&typeof j.recipe==='object'?j.recipe:j;
      const n=usableTitle(s.name);
      const fileFallback=filenameTitle(x?.file_name);
      const descriptionTitle=usableTitle(String(s.description||'').split(/[.!?]/)[0]);
      const bestFallback=fileFallback||descriptionTitle||fileTitle;
      const long=n.length>100||/\b(we will|here is|to make|using|ingredients list)\b/i.test(n);
      const weak=n&&titleQuality(n)<.68;
      const fallbackName=titleQuality(bestFallback)>=.68?bestFallback:fileTitle;
      r={...r,name:(long||weak||!n)?fallbackName:n,personal_notes:s.personal_notes||s.notes||'',ingredients:s.ingredients||s.recipeIngredient||[],method:s.method||s.recipeInstructions||'',cuisine:s.cuisine||s.recipeCuisine||r.cuisine,course:s.course||s.recipeCategory||r.course,servings:s.servings||s.recipeYield||'',description:s.description||(long?clean(n):'')};
      if(Array.isArray(r.method))r.method=r.method.map(v=>typeof v==='string'?v:v?.text||v?.name||'').join('\n');
    }catch{}
  }
  return r
}
function recipeNeedsUniversalRescue(x){
  try{
    const p=typeof x?.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x?.extracted_text;
    if(p?.multiple&&Array.isArray(p.recipes))return p.recipes.some(r=>(r?.ingredients?.length||0)<3||String(r?.method||'').replace(/<[^>]+>/g,' ').trim().length<40);
    const r=p?.recipe&&typeof p.recipe==='object'?p.recipe:p;
    const ingredients=Array.isArray(r?.ingredients)?r.ingredients:[];
    const method=Array.isArray(r?.method)?r.method.join('\n'):String(r?.method||r?.recipeInstructions||'');
    return !String(r?.name||'').trim()||ingredients.length<3||method.replace(/<[^>]+>/g,' ').trim().length<40;
  }catch{return true}
}
async function invokeExtract(itemId,textOverride=null){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)return {data:null,error:new Error('Your sign-in session has expired. Please sign in again.')};
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),90000);
    try{
      const res=await fetch(SUPABASE_URL+'/functions/v1/cc-import-extract-staging-v2',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+session.access_token,
          'apikey':session.access_token
        },
        body:JSON.stringify({import_item_id:Number(itemId),...(textOverride?{text_override:String(textOverride)}:{})}),
        signal:controller.signal
      });
      const raw=await res.text();
      let body=null;
      try{body=raw?JSON.parse(raw):null}catch{}
      if(!res.ok){
        const message=res.status===546||body?.error?.includes?.('compute resources')
          ? 'Supabase ran out of compute resources while extracting this recipe. No changes were made to your recipe.'
          : (body?.error||body?.message||raw||('Extraction failed (HTTP '+res.status+')'));
        lastError=new Error(message); lastError.status=res.status; lastError.body=body;
        if(res.status>=500&&attempt<2){await new Promise(r=>setTimeout(r,1500));continue}
        return {data:null,error:lastError};
      }
      return {data:body,error:null};
    }catch(e){
      lastError=e?.name==='AbortError'
        ? new Error('Recipe extraction took too long and was stopped. Please try again.')
        : new Error(e?.message||'Could not start recipe extraction.');
      if(attempt<2){await new Promise(r=>setTimeout(r,1500));continue}
      return {data:null,error:lastError};
    }finally{clearTimeout(timer)}
  }
  return {data:null,error:lastError||new Error('Could not start recipe extraction.')};
}
async function showOriginal(x,back=()=>showReview(x,x.id)){if(!x?.file_path)return window.ccShowError('Original file is not available.','Original file unavailable');let signedUrl;try{signedUrl=await getCachedSignedUrl(supabase,'cooking-confidential',x.file_path)}catch(error){return window.ccShowError(error?.message||'Could not open the original file.','Could not open original file')}const res=await fetch(signedUrl);if(!res.ok)return window.ccShowError('Could not load the original file.','Could not load original file');const blob=await res.blob(),name=x.file_name||'Original recipe',lower=name.toLowerCase();let body='';if(lower.endsWith('.docx')){const out=await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()});body=`<div class="original-viewer">${out.value||'<p>No readable content found.</p>'}</div>`}else if(lower.endsWith('.pdf')||blob.type==='application/pdf'){body=`<iframe class="original-pdf" title="Original recipe PDF" src="${URL.createObjectURL(blob)}"></iframe>`}else if(blob.type.startsWith('image/')){body=`<div class="original-viewer"><img class="original-image" alt="Original recipe" src="${URL.createObjectURL(blob)}"></div>`}else body=`<pre class="original-viewer">${esc(await blob.text())}</pre>`;detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccBackOriginal">×</button><p class="eyebrow">ORIGINAL RECIPE</p><h2>${esc(name)}</h2><p class="small-note">Original uploaded file — retained privately in Cooking Confidential.</p>${body}`;document.querySelector('#ccBackOriginal').onclick=back}
async function showReview(x,id){
  await extractionDiag(id,'show_review_start',{extraction_status:x?.extraction_status});
  if(!x)return window.ccShowError('Import item could not be loaded.','Could not load import');
  const r=parseRecipe(x);
  const ingredientHtml=Array.isArray(r.ingredients)
    ? r.ingredients.map(v=>typeof v==='string'?clean(v):[v?.quantity,v?.unit,v?.name].filter(Boolean).join(' ')).filter(Boolean).join('\n')
    : clean(r.ingredients||'');
  const sourceHtml=x.file_path
    ? '<div class="detail-section"><p><button class="secondary" type="button" id="ccViewOriginalImport">View original file</button><br><small>Original uploaded file · '+esc(x.file_name||'Recipe')+' · private</small></p></div>'
    : '';
  const dietaryOptions=['Vegetarian','Vegan','Pescatarian','Non-Veg','Gluten-Free','Dairy-Free','Egg-Free','Nut-Free','Low-Carb','Keto'];
  const editor=createGenericEditor({
    dialog:detailDialog,
    eyebrow:'REVIEW IMPORT',
    title:'Check the recipe before saving',
    sourceHtml,
    fields:[
      {label:'Recipe name',name:'name',value:r.name,required:true},
      {label:'Description',name:'description',value:r.description||'',type:'richtext'},
      {label:'Recipe image',name:'image_url',value:r.image_url||'',type:'url',className:'cc-image-field'},
      {group:[
        {label:'Cuisine',name:'cuisine',value:r.cuisine||'',type:'suggest',options:(window.ccRecipes||[]).map(v=>String(v?.cuisine||'').trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).sort(),placeholder:'Enter or choose a cuisine'},
        {label:'Course',name:'course',value:r.course||'',type:'select',options:courses,allowCustom:true}
      ]},
      {group:[
        {label:'Recipe type',name:'recipe_type',value:r.recipe_type||'',type:'select',options:types,allowCustom:true},
        {label:'Dietary / suitability',name:'dietary_tags',value:Array.isArray(r.dietary_tags)?r.dietary_tags:[],type:'multiselect',options:dietaryOptions}
      ]},
      {label:'Servings',name:'servings',value:r.servings||''},
      {label:'Ingredients',name:'ingredients',value:ingredientHtml,type:'richtext'},
      {label:'Method',name:'method',value:cleanMethod(r.method||''),type:'richtext'},
      {label:'My notes',name:'notes',value:r.personal_notes||'',type:'richtext'}
    ],
    actions:{saveLabel:'Save recipe'},
    onSave:async f=>{
      const{data:{user}}=await supabase.auth.getUser();
      if(!user)return window.ccShowError('Please sign in again before saving the recipe.','Sign-in required');
      const payload={
        name:clean(editorValue(f,'name')),
        description:sanitizeRichHtml(f.get('description')||'')||null,
        cuisine:clean(editorValue(f,'cuisine',true))||null,
        course:editorValue(f,'course',true)||null,
        recipe_type:editorValue(f,'recipe_type',true)||null,
        dietary_tags:Array.from(f.getAll('dietary_tags')).map(v=>String(v).trim()).filter(Boolean),
        servings:clean(editorValue(f,'servings'))||null,
        ingredients:{html:sanitizeRichHtml(f.get('ingredients')||'')},
        method:sanitizeRichHtml(f.get('method')||''),
        personal_notes:sanitizeRichHtml(f.get('notes')||'')||null,
        image_url:editorValue(f,'image_url')||null,
        source_type:x.source_url?'social':'file',
        source_url:x.source_url||null,
        source_title:x.source_url?x.source_title:x.file_name||null,
        created_by:user.id,
        visibility:'private'
      };
      let recipeId=x.recipe_id||null;
      if(!recipeId&&x.file_name){
        const q=await supabase.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type','file').eq('source_title',x.file_name).order('id',{ascending:true}).limit(1);
        if(q.error)return window.ccShowError(q.error.message,'Could not find existing recipe');
        recipeId=q.data?.[0]?.id||null;
      }
      const q=recipeId
        ? await supabase.from('cc_recipes').update(payload).eq('id',recipeId).select('id').single()
        : await supabase.from('cc_recipes').insert(payload).select('id').single();
      if(q.error)return window.ccShowError(q.error.message,'Could not save recipe');
      const savedId=recipeId||q.data?.id;
      const u=await supabase.from('cc_import_items').update({recipe_id:savedId,review_status:'approved',extraction_status:'ready'}).eq('id',id);
      if(u.error)return window.ccShowError(u.error.message,'Could not update import status');
      detailDialog.close();
      window.location.reload();
    }
  });
  if(window.ccMountImagePicker)window.ccMountImagePicker(editor,r.name||'');
  const original=editor.form.querySelector('#ccViewOriginalImport');
  if(original)original.onclick=e=>{e.preventDefault();showOriginal(x,()=>showReview(x,id));};
  detailDialog.showModal();
  await extractionDiag(id,'show_review_dialog_shown',{});
}
const REVIEW_MODULE_VERSION='1.4.66';
export async function reviewImportFixed(id){window.ccImportReviewActive=true;await extractionDiag(id,'review_module_version',{version:REVIEW_MODULE_VERSION});window.ccReturnToImportInbox=true;importDialog?.close();detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Preparing recipe…</h2><p class="small-note">Reading the selected upload. This may take a few seconds.</p></div>';detailDialog.showModal();let{data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(error||!x){detailDialog.close();return window.ccShowError(error?.message||'Import item could not be loaded.','Could not load import')}const displayName=x.file_name||x.source_url||'Recipe import';await extractionDiag(id,'review_open',{file_name:x.file_name||null,mime_type:x.mime_type||null,extraction_status:x.extraction_status,review_status:x.review_status,has_scanned_pdf:typeof x.extracted_text==='string'&&x.extracted_text.includes('"scanned_pdf":true')});detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card import-preparing"><p class="eyebrow">REVIEW IMPORT</p><h2>Preparing your recipe</h2><p class="small-note">Reading <strong>'+esc(displayName)+'</strong>.</p><div style="margin:18px 0 8px;padding:12px 14px;border:1px solid rgba(120,70,50,.18);border-radius:10px;background:rgba(120,70,50,.05);font-size:14px;line-height:1.5;color:#5d514a"><strong>Almost there.</strong><br>Your recipe is being extracted now.</div><p class="small-note import-status" style="margin-top:10px">Please keep this window open while the recipe is extracted.</p></div>';const image=/\.(png|jpe?g|webp)$/i.test(x.file_name||'')||String(x.mime_type||'').startsWith('image/');if(image){detailDialog.close();try{const mod=await import('./multi-recipe-import.js?v=1.2.11');if(typeof mod.reviewImageImport==='function')return mod.reviewImageImport(id);if(typeof window.ccMultiReview==='function')return window.ccMultiReview(id)}catch(e){return window.ccShowError(e.message||'Could not open image review.','Could not open image review')}return window.ccShowError('Image review module is not available.','Image review unavailable')}const pdf=/\.pdf$/i.test(x.file_name||'')||x.mime_type==='application/pdf';if(x.extraction_status==='pending'||x.extraction_status==='processing'){await extractionDiag(id,'before_invoke_extract',{status:x.extraction_status,pdf});const{error:fx}=await invokeExtract(id);if(fx){await extractionDiag(id,'invoke_extract_failed',{message:fx.message||null,status:fx.status||null});let detail=fx.message||'The recipe could not be extracted.';try{const ctx=fx.context;const body=ctx?.json?await ctx.json():ctx?.text?await ctx.text():null;if(body)detail=typeof body==='string'?body:(body.error||body.message||JSON.stringify(body))}catch{}if(!pdf){return window.ccShowError(detail,'Recipe extraction failed')}try{const mod=await import('./scanned-pdf-ocr.js?v=1.0.42');await extractionDiag(id,'legacy_scanned_pdf_invoked',{module:'scanned-pdf-ocr.js'});const out=await mod.ocrScannedPdf(id,x);x=out.item;const rr=out.recipe||{};if(!Array.isArray(rr.ingredients)||rr.ingredients.length<3){const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}}catch(e){try{const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}catch(_){return window.ccShowError(e.message||'The scanned PDF could not be read.','Scanned PDF could not be read')}}}else{await extractionDiag(id,'invoke_extract_succeeded',{});const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(q.error)return window.ccShowError(q.error.message,'Could not refresh import');x=q.data;await extractionDiag(id,'after_invoke_refresh',{extraction_status:x.extraction_status,source_title:x.source_title,has_scanned_pdf:typeof x.extracted_text==='string'&&x.extracted_text.includes('"scanned_pdf":true'),extracted_length:String(x.extracted_text||'').length})}}// x is already current here: the initial read is sufficient for ready items, and
  // pending/processing items refresh x themselves after extraction. Avoiding a
  // second identical Supabase read prevents Review from hanging on this path.
  // URL imports must always be re-extracted when Review opens. This prevents
  // an older cached extraction (for example raw HTML/JavaScript from a protected
  // page) from being shown after the URL extractor has been corrected.
  if(x.source_url&&x.extraction_status==='ready'){
    const{error:fx}=await invokeExtract(id);
    if(fx){return window.ccShowError(fx.message||'The recipe could not be extracted from this URL.','Recipe extraction failed')}
    const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();
    if(q.error)return window.ccShowError(q.error.message,'Could not refresh import');
    x=q.data;
  }
  // Only OCR a PDF when the server-side text extractor did not produce
  // a usable recipe, or when this is an older scanned-PDF OCR payload.
  if(pdf&&x.extraction_status==='ready'){
    let needsOcr=false;
    try{
      const parsed=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;
      const r=parsed?.recipe&&typeof parsed.recipe==='object'?parsed.recipe:parsed;
      needsOcr=parsed?.scanned_pdf===true || !Array.isArray(r?.ingredients) || r.ingredients.length<3;
    }catch{needsOcr=true}
    if(needsOcr){let diagRecipe={};try{const parsed=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;diagRecipe=parsed?.recipe&&typeof parsed.recipe==='object'?parsed.recipe:parsed}catch{}await extractionDiag(id,'legacy_scanned_pdf_path_triggered',{reason:'server_result_not_usable',recipe_name:diagRecipe?.name||null,ingredient_count:Array.isArray(diagRecipe?.ingredients)?diagRecipe.ingredients.length:null,method_length:String(diagRecipe?.method||'').length});
      await extractionDiag(id,'scanned_ocr_import_start',{module:'scanned-pdf-ocr.js',version:'1.0.42'});
      try{
        const sourceUrl='./scanned-pdf-ocr.js?v=1.0.42';
        const sourceRes=await fetch(sourceUrl,{cache:'no-store'});
        const sourceText=await sourceRes.text();
        let syntaxOk=null,syntaxError=null;
        try{
          const parseText=sourceText
            .replace(/^\s*import\s.+?;\s*$/gm,'')
            .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|var|class)/g,'');
          new Function(parseText);
          syntaxOk=true;
        }catch(e){syntaxOk=false;syntaxError={name:e?.name||null,message:e?.message||String(e)}}
        await extractionDiag(id,'scanned_ocr_source_check',{
          url:sourceUrl,
          status:sourceRes.status,
          ok:sourceRes.ok,
          content_type:sourceRes.headers.get('content-type'),
          content_length_header:sourceRes.headers.get('content-length'),
          text_length:sourceText.length,
          prefix:sourceText.slice(0,240),
          syntax_ok:syntaxOk,
          syntax_error:syntaxError
        });
        const externalUrl='https://esm.sh/@supabase/supabase-js@2';
        let externalCheck={url:externalUrl,fetch_status:null,content_type:null,text_length:null,prefix:null,import_ok:null,import_error:null};
        try{
          const extRes=await fetch(externalUrl,{cache:'no-store'});
          const extText=await extRes.text();
          externalCheck.fetch_status=extRes.status;
          externalCheck.content_type=extRes.headers.get('content-type');
          externalCheck.text_length=extText.length;
          externalCheck.prefix=extText.slice(0,320);
          try{await import(externalUrl);externalCheck.import_ok=true}
          catch(e){externalCheck.import_ok=false;externalCheck.import_error={name:e?.name||null,message:e?.message||String(e),stack:String(e?.stack||'').slice(0,900)}}
        }catch(e){externalCheck.fetch_error={name:e?.name||null,message:e?.message||String(e)}}
        await extractionDiag(id,'scanned_ocr_external_dependency_check',externalCheck);
        const depUrl='./storage-url-cache.js?v=1.0.0';
        const depRes=await fetch(depUrl,{cache:'no-store'});
        const depText=await depRes.text();
        let depSyntaxOk=null,depSyntaxError=null;
        try{
          const parseDep=depText
            .replace(/^\s*import\s.+?;\s*$/gm,'')
            .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|var|class)/g,'');
          new Function(parseDep);
          depSyntaxOk=true;
        }catch(e){depSyntaxOk=false;depSyntaxError={name:e?.name||null,message:e?.message||String(e)}}
        await extractionDiag(id,'scanned_ocr_dependency_check',{
          url:depUrl,
          status:depRes.status,
          ok:depRes.ok,
          content_type:depRes.headers.get('content-type'),
          content_length_header:depRes.headers.get('content-length'),
          text_length:depText.length,
          prefix:depText.slice(0,240),
          syntax_ok:depSyntaxOk,
          syntax_error:depSyntaxError
        });
        const mod=await import(sourceUrl);
        await extractionDiag(id,'scanned_ocr_import_loaded',{module:'scanned-pdf-ocr.js',version:'1.0.42'});
        const out=await mod.ocrScannedPdf(id,x);
        x=out.item;
        await extractionDiag(id,'after_ocr_return',{ingredient_count:Array.isArray(out.recipe?.ingredients)?out.recipe.ingredients.length:null,method_length:String(out.recipe?.method||'').length,extraction_status:x.extraction_status});
        const rr=out.recipe||{};
        if(!Array.isArray(rr.ingredients)||rr.ingredients.length<3){
          const rescue=await import('./rescue-ocr.js?v=1.1.1'); return rescue.rescueImport(id);
        }
      }catch(e){
        await extractionDiag(id,'scanned_ocr_import_error',{name:e?.name||null,message:e?.message||String(e),stack:String(e?.stack||'').slice(0,1400)});
        console.warn('Cooking Confidential scanned PDF refresh:',e);
        try{const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}catch(_){}
      }
    }
  }
  if(x.extraction_status==='failed'){if(pdf){try{const mod=await import('./scanned-pdf-ocr.js?v=1.0.42');const out=await mod.ocrScannedPdf(id,x);const rr=out.recipe||{};if(!Array.isArray(rr.ingredients)||rr.ingredients.length<3){const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}return showReview(out.item,id)}catch(e){try{const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}catch(_){return window.ccShowError(e.message||'The scanned PDF could not be read.','Last-resort extraction failed')}}}const{error:fx}=await invokeExtract(id);let detail=fx?.message||'The recipe could not be extracted.';try{const ctx=fx?.context;const body=ctx?.json?await ctx.json():ctx?.text?await ctx.text():null;if(body)detail=typeof body==='string'?body:(body.error||body.message||JSON.stringify(body))}catch{}if(fx)return window.ccShowError(detail,'Recipe extraction failed');const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(q.error)return window.ccShowError(q.error.message,'Could not refresh import');x=q.data;if(x.extraction_status==='failed')return window.ccShowError(x.error_message||'The recipe could not be extracted.','Recipe extraction failed')}await extractionDiag(id,'before_quality_gate',{extraction_status:x.extraction_status});
const parsedForQuality=(()=>{try{const j=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;return j?.recipe&&typeof j.recipe==='object'?j.recipe:j}catch{return null}})();
let quality;try{quality=checkRecipeQuality(parsedForQuality,{mode:'single'});await extractionDiag(id,'quality_gate_result',{good:quality.good,score:quality.score,reasons:quality.reasons,metrics:quality.metrics})}catch(e){await extractionDiag(id,'quality_gate_error',{name:e?.name||null,message:e?.message||String(e),stack:String(e?.stack||'').slice(0,1500)});throw e}
if(!quality.good && pdf){
  console.warn('Cooking Confidential PDF quality gate failed; trying Vision text reader:',quality);
  try{
    const visionText=await readSourceTextWithVision(id);
    const vr=await invokeExtract(id,visionText);
    if(!vr.error){
      const refreshed=await supabase.from('cc_import_items').select('*').eq('id',id).single();
      if(!refreshed.error){x=refreshed.data;const pj=typeof x.extracted_text==='string'?JSON.parse(x.extracted_text||'{}'):x.extracted_text;const pr=pj?.recipe&&typeof pj.recipe==='object'?pj.recipe:pj;quality=checkRecipeQuality(pr,{mode:'single'});}
    }
  }catch(e){console.warn('Cooking Confidential PDF Vision fallback failed:',e)}
}
if(!quality.good){await extractionDiag(id,'quality_gate_failed',{quality});
  console.warn('Cooking Confidential quality gate sent import to rescue:',quality);
  try{const rescue=await import('./rescue-ocr.js?v=1.1.1');return rescue.rescueImport(id)}catch(e){console.warn('Cooking Confidential universal rescue:',e)}
}
await extractionDiag(id,'before_show_review',{name:parsedForQuality?.name||null,ingredient_count:Array.isArray(parsedForQuality?.ingredients)?parsedForQuality.ingredients.length:0});window.ccImportReviewActive=false;await showReview(x,id);await extractionDiag(id,'show_review_returned',{});}
document.addEventListener('click',async event=>{const button=event.target.closest('.review-btn');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const id=Number(button.dataset.id);if(button.dataset.multi==='1'){try{const mod=await import('./multi-recipe-import.js?v=1.3.6');if(typeof mod.ccMultiReview==='function')return mod.ccMultiReview(id);if(typeof window.ccMultiReview==='function')return window.ccMultiReview(id);throw Error('Multi-recipe reviewer could not be loaded.')}catch(e){return window.ccShowError(e?.message||'Could not open multi-recipe review.','Multi-recipe review failed')}}reviewImportFixed(id)},true);
