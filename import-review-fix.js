import { supabase } from './supabase-client-legacy.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';

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
  let r={name:fileTitle,ingredients:[],method:'',cuisine:x?.inferred_cuisine||'',course:x?.inferred_course||'',servings:'',description:''};
  if(x?.extracted_text){
    try{
      const j=JSON.parse(x.extracted_text),s=j.recipe&&typeof j.recipe==='object'?j.recipe:j;
      const n=usableTitle(s.name);
      const long=n.length>100||/\b(we will|here is|to make|using|ingredients list)\b/i.test(n);
      r={...r,name:long?fileTitle:(n||fileTitle),personal_notes:s.personal_notes||s.notes||'',ingredients:s.ingredients||s.recipeIngredient||[],method:s.method||s.recipeInstructions||'',cuisine:s.cuisine||s.recipeCuisine||r.cuisine,course:s.course||s.recipeCategory||r.course,servings:s.servings||s.recipeYield||'',description:s.description||(long?clean(n):'')};
      if(Array.isArray(r.method))r.method=r.method.map(v=>typeof v==='string'?v:v?.text||v?.name||'').join('\n');
    }catch{}
  }
  return r
}
async function invokeExtract(itemId){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)return {data:null,error:new Error('Your sign-in session has expired. Please sign in again.')};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const res=await fetch(SUPABASE_URL+'/functions/v1/cc-import-extract',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+session.access_token,
        'apikey':session.access_token
      },
      body:JSON.stringify({import_item_id:Number(itemId)}),
      signal:controller.signal
    });
    const raw=await res.text();
    let body=null;
    try{body=raw?JSON.parse(raw):null}catch{}
    if(!res.ok){
      const message=res.status===546||body?.error?.includes?.('compute resources')
        ? 'Supabase ran out of compute resources while reading this legacy Word file. No changes were made to your recipe.'
        : (body?.error||body?.message||raw||('Extraction failed (HTTP '+res.status+')'));
      const e=new Error(message); e.status=res.status; e.body=body;
      return {data:null,error:e};
    }
    return {data:body,error:null};
  }catch(e){
    const message=e?.name==='AbortError'
      ? 'Recipe extraction took too long and was stopped. Please try again.'
      : (e?.message||'Could not start recipe extraction.');
    return {data:null,error:new Error(message)};
  }finally{clearTimeout(timer)}
}
function parseLegacyDocText(text,fileName){
  const raw=String(text||'')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/h[1-6]>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/\r\n?/g,'\n')
    .replace(/[\u000B\u000C]/g,'\n')
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F\uFFFD]/g,' ')
    .replace(/[\t|]+/g,'\n')
    .replace(/[•·▪◦]/g,'\n• ');
  const normalized=raw
    .replace(/\s+(?=(?:ingredients?|what you.?ll need|you will need)\s*:?\s*)/ig,'\n')
    .replace(/\s+(?=(?:method|directions?|instructions?|preparation|steps?)\s*:?\s*)/ig,'\n');
  const lines=normalized.split(/\n+/).map(s=>clean(s)).filter(Boolean);
  if(!lines.length)throw new Error('The legacy Word file contained no readable text.');

  const heading=(s,kind)=>{
    const v=String(s||'').replace(/^[-•*]\s*/,'').trim();
    return kind==='ingredients'
      ? /^(?:ingredients?|what you.?ll need|you will need)\s*:?-?$/i.test(v)
      : /^(?:method|directions?|instructions?|preparation|steps?)\s*:?-?$/i.test(v);
  };
  const ii=lines.findIndex(s=>heading(s,'ingredients'));
  const mi=lines.findIndex((s,i)=>i>(ii<0?0:ii)&&heading(s,'method'));

  let name=String(fileName||'Imported recipe').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
  const titleCandidate=(s)=>{
    let v=clean(String(s||''))
      .replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/gi,'$1')
      .replace(/https?:\/\/[^\s]+/gi,'')
      .replace(/^[-•*]\s*/,'')
      .replace(/^search\s*[:|>-]?\s*/i,'')
      .replace(/\s+/g,' ')
      .trim();
    if(!v)return '';
    if(/^(?:search|food52|home|recipes?|save|share|print|log ?in|sign ?in|sign ?up|subscribe|menu|skip to|jump to|advertisement)$/i.test(v))return '';
    if(/^(?:search|food52)\b/i.test(v)&&v.length<60)return '';
    return v.length<=140?v:'';
  };

  const qty=/^(?:\d+(?:[.,]\d+)?(?:\/\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b/i;
  const unit=/\b(?:kg|g|grams?|mg|ml|l|litres?|liters?|oz|ounces?|lb|lbs|pounds?|cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|cloves?|slices?|sticks?|pieces?|sprigs?|heads?|bulbs?|bunch(?:es)?|pinch|handful)\b/i;
  const ingredientLike=s=>qty.test(s)||unit.test(s)||/^[-•*]/.test(s);
  const methodLike=s=>/\b(?:peel|boil|cook|bake|roast|fry|heat|add|mix|stir|combine|place|put|pour|drain|mash|blend|whisk|season|serve|remove|transfer|cover|simmer|bring to|preheat|chop|slice|cut|dice|grate)\b/i.test(s)&&s.length>18;

  let ingredients=[];
  let method=[];

  if(ii>=0){
    const end=mi>ii?mi:lines.length;
    ingredients=lines.slice(ii+1,end);
    if(mi>ii)method=lines.slice(mi+1);
  }else{
    // Legacy Word files often come back from the browser reader without
    // paragraph headings. Find the first convincing ingredient line and
    // collect the contiguous ingredient block, allowing unquantified items
    // such as salt to remain in the block.
    const firstIng=lines.findIndex((s,i)=>i>0&&ingredientLike(s));
    if(firstIng>0){
      const titleLines=lines.slice(0,firstIng)
        .map(titleCandidate)
        .filter(Boolean);
      if(titleLines.length)name=titleLines[0];
      let i=firstIng;
      for(;i<lines.length;i++){
        const s=lines[i];
        if(methodLike(s)&&ingredients.length>=2)break;
        if(ingredientLike(s)||ingredients.length<2){
          ingredients.push(s.replace(/^[-•*]\s*/,'').trim());
          continue;
        }
        // A short unquantified ingredient such as "salt" or "pepper".
        if(ingredients.length>=2&&s.length<=35&&!/^[A-Z][a-z]+\s+to\s+/i.test(s)){
          ingredients.push(s);
          continue;
        }
        break;
      }
      method=lines.slice(i);
    }
  }

  ingredients=ingredients
    .map(s=>s.replace(/^[-•*]\s*/,'').trim())
    .filter(Boolean);
  method=method
    .map(s=>s.replace(/^\d+[.)]\s*/,'').trim())
    .filter(Boolean);

  if(!ingredients.length){
    throw new Error('The older Word file was read, but its Ingredients section could not be identified.');
  }

  return {
    name:name||'Imported recipe',
    description:null,
    ingredients,
    method:method.join('\n'),
    cuisine:null,
    course:null,
    servings:null
  };
}
async function extractLegacyDocInBrowser(x,id){
  if(!x?.file_path)throw new Error('The original Word file is not available.');
  let signedUrl;
  try{signedUrl=await getCachedSignedUrl(supabase,'cooking-confidential',x.file_path)}catch(e){throw new Error('Could not access the uploaded Word file: '+(e?.message||'signed URL failed.'))}
  let res;
  try{res=await fetch(signedUrl)}catch(e){throw new Error('Could not download the uploaded Word file: '+(e?.message||'network request failed.'))}
  if(!res.ok)throw new Error('Could not download the uploaded Word file (HTTP '+res.status+').');
  const blob=await res.blob();
  const status=detailDialog.querySelector('.import-status');
  if(status)status.textContent='Reading the legacy Word document in your browser…';
  let mod;
  try{mod=await import('https://esm.sh/@zhenghy/doc-preview@0.7.3?bundle')}catch(e){throw new Error('Could not load the legacy Word reader in the browser: '+(e?.message||'module load failed.'))}
  let text;
  try{
  const parsed=mod.parseDocFileFromBuffer(await blob.arrayBuffer());
  if(typeof parsed==='string') text=parsed;
  else if(parsed && typeof parsed.text==='string') text=parsed.text;
  else if(parsed && typeof parsed.plainText==='string') text=parsed.plainText;
  else if(parsed?.document?.paragraphs) text=parsed.document.paragraphs.map(p=>typeof p==='string'?p:(p?.text||'')).join('\n');
  else if(Array.isArray(parsed?.paragraphs)) text=parsed.paragraphs.map(p=>typeof p==='string'?p:(p?.text||'')).join('\n');
  else text=String(parsed??'');
}catch(e){throw new Error('The legacy Word document could not be read: '+(e?.message||'parser failed.'))}
  const recipe=parseLegacyDocText(text,x.file_name||'Imported recipe');
  const {error}=await supabase.from('cc_import_items').update({
    extracted_text:JSON.stringify(recipe),
    source_title:recipe.name,
    extraction_status:'ready',
    review_status:'pending',
    error_message:null
  }).eq('id',id);
  if(error)throw new Error(error.message||'Could not save the extracted recipe.');
  return {...x,extracted_text:JSON.stringify(recipe),source_title:recipe.name,extraction_status:'ready',review_status:'pending',error_message:null};
}
async function showOriginal(x,back=()=>showReview(x,x.id)){if(!x?.file_path)return window.ccShowError('Original file is not available.','Original file unavailable');let signedUrl;try{signedUrl=await getCachedSignedUrl(supabase,'cooking-confidential',x.file_path)}catch(error){return window.ccShowError(error?.message||'Could not open the original file.','Could not open original file')}const res=await fetch(signedUrl);if(!res.ok)return window.ccShowError('Could not load the original file.','Could not load original file');const blob=await res.blob(),name=x.file_name||'Original recipe',lower=name.toLowerCase();let body='';if(lower.endsWith('.docx')){const out=await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()});body=`<div class="original-viewer">${out.value||'<p>No readable content found.</p>'}</div>`}else if(lower.endsWith('.pdf')||blob.type==='application/pdf'){body=`<iframe class="original-pdf" title="Original recipe PDF" src="${URL.createObjectURL(blob)}"></iframe>`}else if(blob.type.startsWith('image/')){body=`<div class="original-viewer"><img class="original-image" alt="Original recipe" src="${URL.createObjectURL(blob)}"></div>`}else body=`<pre class="original-viewer">${esc(await blob.text())}</pre>`;detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccBackOriginal">×</button><p class="eyebrow">ORIGINAL RECIPE</p><h2>${esc(name)}</h2><p class="small-note">Original uploaded file — retained privately in Cooking Confidential.</p>${body}`;document.querySelector('#ccBackOriginal').onclick=back}
async function showReview(x,id){if(!x)return window.ccShowError('Import item could not be loaded.','Could not load import');const r=parseRecipe(x);const ingredients=Array.isArray(r.ingredients)?r.ingredients.map(v=>typeof v==='string'?v:[v?.amount,v?.quantity,v?.unit,v?.name].filter(Boolean).join(' ')).map(v=>clean(v)).join('\n'):clean(r.ingredients);let duplicateRecipeId=null;let duplicateNameMatch=false;if(x.source_url){const dq=await supabase.from('cc_recipes').select('id,name').eq('created_by',x.created_by).eq('source_url',x.source_url).limit(20);if(!dq.error&&dq.data?.length){const hit=dq.data.find(z=>String(z.name||'').trim().toLowerCase()===String(r.name||'').trim().toLowerCase());if(hit){duplicateRecipeId=hit.id;duplicateNameMatch=true;}}}else if(x.file_name){const dq=await supabase.from('cc_recipes').select('id,name').eq('created_by',x.created_by).eq('source_type','file').eq('source_title',x.file_name).limit(20);if(!dq.error&&dq.data?.length){const hit=dq.data.find(z=>String(z.name||'').trim().toLowerCase()===String(r.name||'').trim().toLowerCase());if(hit){duplicateRecipeId=hit.id;duplicateNameMatch=true;}}}const original=x.file_path?`<button class="secondary" type="button" id="ccViewOriginal">View original file</button>`:'';detailDialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccCloseReview">×</button><p class="eyebrow">REVIEW IMPORT</p><h2>Check the recipe before saving</h2><p class="small-note">The cleaned recipe below is the version that will be saved. The original uploaded file is retained separately.${duplicateNameMatch?'<span style="display:block;color:#b33b2e;font-weight:700;margin-top:6px">An existing recipe with the same name and source was found; saving will overwrite that recipe.</span>':''}</p><form id="ccImportReviewForm"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><label>Description<textarea name="description" rows="4">${esc(r.description)}</textarea></label><label>Recipe image<input name="image_url" type="url" class="cc-image-field" value="${esc(x.image_url||'')}" placeholder="Paste image URL (optional)"></label><div class="two-col"><label>Cuisine<input name="cuisine" value="${esc(r.cuisine)}"></label>${selectField('Category','course',courses,r.course)}</div>${selectField('Recipe type','recipe_type',types,r.recipe_type)}<label>Servings<input name="servings" value="${esc(r.servings)}"></label><label>Ingredients<textarea name="ingredients" rows="8">${esc(ingredients)}</textarea></label><label>Method<textarea name="method" rows="9">${esc(cleanMethod(r.method))}</textarea></label><label>My notes<textarea name="notes" rows="5">${esc(r.personal_notes||'')}</textarea></label><div class="detail-actions">${original}<button class="secondary" type="button" id="ccCancelReview">Cancel</button><button class="primary" type="submit">${duplicateNameMatch?'Overwrite existing recipe':'Save recipe'}</button></div></form>`;detailDialog.showModal();const form=document.querySelector('#ccImportReviewForm');window.ccCurrentRecipe=r;['description','ingredients','method','notes'].forEach(n=>{const labels={description:'Description',ingredients:'Ingredients',method:'Method',notes:'My notes'};mountReviewRichText(form,n,labels[n])});try{const mod=await import('./recipe-edit-fix.js?v=1.4.12');if(typeof mod.mountImagePicker==='function')mod.mountImagePicker({form},r.name||'');else if(window.ccMountImagePicker)window.ccMountImagePicker({form},r.name||'')}catch(e){if(window.ccMountImagePicker)window.ccMountImagePicker({form},r.name||'')}['course','recipe_type'].forEach(n=>{const s=form.querySelector(`[name="${n}"]`),c=form.querySelector(`[name="${n}_custom"]`);s.onchange=()=>{c.style.display=s.value==='__custom__'?'block':'none';if(s.value!=='__custom__')c.value=''}});document.querySelector('#ccCloseReview').onclick=()=>detailDialog.close();document.querySelector('#ccCancelReview').onclick=()=>detailDialog.close();document.querySelector('#ccViewOriginal')?.addEventListener('click',()=>showOriginal(x));form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='Saving…'}try{const{data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw new Error('Please sign in again before saving the recipe.');const f=new FormData(form),val=n=>{const v=String(f.get(n)||'');return v==='__custom__'?String(f.get(`${n}_custom`)||'').trim():v.trim()},payload={name:clean(f.get('name')),description:clean(f.get('description'))||null,image_url:clean(f.get('image_url'))||null,cuisine:clean(f.get('cuisine'))||null,course:val('course')||null,recipe_type:val('recipe_type')||null,servings:clean(f.get('servings'))||null,ingredients:{html:sanitizeRichHtml(f.get('ingredients')||'')},method:sanitizeRichHtml(f.get('method')||''),personal_notes:sanitizeRichHtml(f.get('notes')||'')||null,source_type:x.source_url?'social':'file',source_url:x.source_url||null,source_title:x.source_url?x.source_title:x.file_name||null,created_by:user.id,visibility:'private',original_file_path:x.file_path||null,original_file_name:x.file_path?(x.file_name||null):null,original_mime_type:x.file_path?(x.mime_type||null):null};let recipeId=x.recipe_id||duplicateRecipeId||null;const q=recipeId?await supabase.from('cc_recipes').update(payload).eq('id',recipeId):await supabase.from('cc_recipes').insert(payload).select('id').single();if(q.error)throw new Error(q.error.message||'Could not save recipe');const savedId=recipeId||q.data?.id;if(!savedId)throw new Error('Recipe was not saved: no recipe ID was returned.');const u=await supabase.from('cc_import_items').update({recipe_id:savedId,review_status:'approved',extraction_status:'ready'}).eq('id',id);if(u.error)throw new Error(u.error.message||'Could not update import status');
  if(typeof window.ccReloadRecipes==='function')await window.ccReloadRecipes();
  window.ccReturnToImportInbox=true;
  detailDialog.close();
}catch(error){console.error('Cooking Confidential recipe save failed:',error);window.ccShowError(error?.message||'The recipe could not be saved.','Could not save recipe');if(btn){btn.disabled=false;btn.textContent=duplicateNameMatch?'Overwrite existing recipe':'Save recipe'}}
}}
export async function reviewImportFixed(id){window.ccReturnToImportInbox=true;importDialog?.close();detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Preparing recipe…</h2><p class="small-note">Reading the selected upload. This may take a few seconds.</p></div>';detailDialog.showModal();let{data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(error||!x){detailDialog.close();return window.ccShowError(error?.message||'Import item could not be loaded.','Could not load import')}const displayName=x.file_name||x.source_url||'Recipe import';const isLegacyDoc=/\.doc$/i.test(x.file_name||'')||x.mime_type==='application/msword';detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card import-preparing"><p class="eyebrow">REVIEW IMPORT</p><h2>Preparing your recipe</h2><p class="small-note">Reading <strong>'+esc(displayName)+'</strong>.</p><div style="margin:18px 0 8px;padding:12px 14px;border:1px solid rgba(120,70,50,.18);border-radius:10px;background:rgba(120,70,50,.05);font-size:14px;line-height:1.5;color:#5d514a"><strong>'+(isLegacyDoc?'Older Word document detected.':'Almost there.')+'</strong><br>'+(isLegacyDoc?'This older .doc format is being read directly in your browser.':'Your recipe is being extracted now.')+'</div><p class="small-note import-status" style="margin-top:10px">'+(isLegacyDoc?'Reading the document…':'Please keep this window open while the recipe is extracted.')+'</p></div>';const image=/\.(png|jpe?g|webp)$/i.test(x.file_name||'')||String(x.mime_type||'').startsWith('image/');if(image){detailDialog.close();try{const mod=await import('./multi-recipe-import.js?v=1.2.10');if(typeof mod.reviewImageImport==='function')return mod.reviewImageImport(id);if(typeof window.ccMultiReview==='function')return window.ccMultiReview(id)}catch(e){return window.ccShowError(e.message||'Could not open image review.','Could not open image review')}return window.ccShowError('Image review module is not available.','Image review unavailable')}const pdf=/\.pdf$/i.test(x.file_name||'')||x.mime_type==='application/pdf';if(isLegacyDoc){try{x=await extractLegacyDocInBrowser(x,id);return showReview(x,id)}catch(e){return window.ccShowError(e?.message||'The older Word document could not be read.','Legacy Word document failed')}}if(x.extraction_status==='pending'||x.extraction_status==='processing'){const{error:fx}=await invokeExtract(id);if(fx){let detail=fx.message||'The recipe could not be extracted.';try{const ctx=fx.context;const body=ctx?.json?await ctx.json():ctx?.text?await ctx.text():null;if(body)detail=typeof body==='string'?body:(body.error||body.message||JSON.stringify(body))}catch{}if(!pdf)return window.ccShowError(detail,'Recipe extraction failed');try{const mod=await import('./scanned-pdf-ocr.js?v=1.0.6');const out=await mod.ocrScannedPdf(id);x=out.item}catch(e){return window.ccShowError(e.message||'The scanned PDF could not be read.','Scanned PDF could not be read')}}else{const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(q.error)return window.ccShowError(q.error.message,'Could not refresh import');x=q.data}}const latest=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(latest.error)return window.ccShowError(latest.error.message,'Could not refresh import');x=latest.data;
  // URL imports must always be re-extracted when Review opens. This prevents
  // an older cached extraction (for example raw HTML/JavaScript from a protected
  // page) from being shown after the URL extractor has been corrected.
  if(x.source_url&&x.extraction_status==='ready'){
    const{error:fx}=await invokeExtract(id);
    if(fx)return window.ccShowError(fx.message||'The recipe could not be extracted from this URL.','Recipe extraction failed');
    const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();
    if(q.error)return window.ccShowError(q.error.message,'Could not refresh import');
    x=q.data;
  }
  // If an older scanned-PDF OCR result is still cached with the page marker as
  // its recipe name, rerun the OCR with the current parser before showing Review.
  if(pdf&&x.extraction_status==='ready'){
    try{
      const mod=await import('./scanned-pdf-ocr.js?v=1.0.11');
      const out=await mod.ocrScannedPdf(id);
      x=out.item;
    }catch(e){console.warn('Cooking Confidential scanned PDF refresh:',e)}
  }
  if(x.extraction_status==='failed'){if(pdf){try{const mod=await import('./scanned-pdf-ocr.js?v=1.0.6');const out=await mod.ocrScannedPdf(id);return showReview(out.item,id)}catch(e){return window.ccShowError(e.message||'The scanned PDF could not be read.','Scanned PDF could not be read')}}const{error:fx}=await invokeExtract(id);let detail=fx?.message||'The recipe could not be extracted.';try{const ctx=fx?.context;const body=ctx?.json?await ctx.json():ctx?.text?await ctx.text():null;if(body)detail=typeof body==='string'?body:(body.error||body.message||JSON.stringify(body))}catch{}const q=await supabase.from('cc_import_items').select('*').eq('id',id).single();if(fx||q.error)return window.ccShowError(detail||q.error?.message||'The recipe could not be extracted.','Recipe extraction failed');x=q.data;if(x.extraction_status==='failed')return window.ccShowError(x.error_message||'The recipe could not be extracted.','Recipe extraction failed')}showReview(x,id)}
document.addEventListener('click',async event=>{const button=event.target.closest('.review-btn');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const id=Number(button.dataset.id);if(button.dataset.multi==='1'){try{const mod=await import('./multi-recipe-import.js?v=1.3.6');if(typeof mod.ccMultiReview==='function')return mod.ccMultiReview(id);if(typeof window.ccMultiReview==='function')return window.ccMultiReview(id);throw Error('Multi-recipe reviewer could not be loaded.')}catch(e){return window.ccShowError(e?.message||'Could not open multi-recipe review.','Multi-recipe review failed')}}reviewImportFixed(id)},true);
