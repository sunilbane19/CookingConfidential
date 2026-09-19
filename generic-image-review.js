import { supabase } from './supabase-client-legacy.js?v=1.0.0';
import { createWorker } from 'https://esm.sh/tesseract.js@5';
import { getCachedSignedUrl } from './storage-url-cache.js?v=1.0.0';
import { createGenericEditor, editorValue, sanitizeRichHtml } from './generic-editor.js?v=1.3.3';
const detailDialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/^[\[\]{}()<>|•·▪◦●○✓✔☐☑\s]+/,'').replace(/\s+/g,' ').trim();
const courses=['','Breakfast','Brunch','Starter','Soup','Salad','Main','Side','Snack','Dessert','Bread','Beverage'];
const types=['','Dish','Dip','Dressing','Sauce','Chutney','Marinade','Rub','Paste','Spice Blend','Stock / Broth','Pickle','Condiment'];
const generic=/^(recipe|recipes|ingredients?|method|directions?|instructions?|preparation|steps?|servings?|notes?|tips?|storage|serving suggestions?|for the .+|for .+)[:.]?$/i;
const garbage=s=>{const x=clean(s);if(!x||generic.test(x)||/[©®™]/.test(x))return true;if(/\b(?:follow|subscribe|like|share|save|comment|link in bio|learn more|ends in)\b/i.test(x))return true;if((x.match(/[A-Za-z]/g)||[]).length<2)return true;return false};
function headingKind(x){const s=clean(x).toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();if(/\bingredients?\b/.test(s)||/\bingredient\s+list\b/.test(s))return'ingredients';if(/\b(method|directions?|instructions?|preparation|steps?)\b/.test(s))return'method';if(/\b(notes?|tips?|storage|serving suggestions?)\b/.test(s))return'notes';return'';}
function parseLines(text){const a=String(text||'').replace(/\r/g,'').split('\n').map(clean).filter(x=>!garbage(x));let section='',ingredients=[],method=[];for(let x of a){const kind=headingKind(x);if(kind==='ingredients'){section='ingredients';x=x.replace(/.*?\bingredients?(?:\s+list)?\b\s*[:\-]?/i,'').trim();if(!x)continue}else if(kind==='method'){section='method';x=x.replace(/.*?\b(method|directions?|instructions?|preparation|steps?)\b\s*[:\-]?/i,'').trim();if(!x)continue}else if(kind==='notes'){section='notes';continue}if(/^(?:\d{1,2}[.)]|step\s*\d+)/i.test(x)&&section!=='notes')section='method';if(!x||garbage(x))continue;if(section==='method')method.push(x);else ingredients.push(x)}return{ingredients:[...new Set(ingredients)],method:[...new Set(method)]};}
function ocrLineData(words){const valid=(words||[]).filter(w=>w.text?.trim()&&Number(w.confidence||0)>=20&&w.bbox);if(!valid.length)return[];const medH=valid.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(valid.length/2)]||20,rows=[];for(const w of [...valid].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2;let row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(8,medH*.6));if(!row){row={cy,words:[]};rows.push(row)}row.words.push(w)}return rows.map(r=>{r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);return{text:clean(r.words.map(w=>w.text).join(' ')),height:Math.max(...r.words.map(w=>w.bbox.y1-w.bbox.y0)),y0:Math.min(...r.words.map(w=>w.bbox.y0)),y1:Math.max(...r.words.map(w=>w.bbox.y1))}}).filter(r=>r.text.length>1);}
function titleFromOcr(variants){const all=variants.flatMap(v=>ocrLineData(v.data?.words||[]));if(!all.length)return'Imported recipe';const ingIndex=all.map(x=>headingKind(x.text)).findIndex(x=>x==='ingredients');const pre=all.slice(0,ingIndex>0?ingIndex:Math.min(all.length,12));const med=all.map(x=>x.height).sort((a,b)=>a-b)[Math.floor(all.length/2)]||20;const candidates=pre.filter(x=>x.text.length>=4&&x.text.length<=70&&!garbage(x.text)&&!/^recipe$/i.test(x.text));if(!candidates.length)return'Imported recipe';const tall=candidates.filter(x=>x.height>=med*1.22);return clean((tall.length?tall:candidates).sort((a,b)=>b.height-a.height||a.y0-b.y0)[0].text);}
async function preprocessImage(blob,mode){const bmp=await createImageBitmap(blob);const max=2400,scale=Math.min(3,max/Math.max(bmp.width,bmp.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();if(mode!=='original'){const im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];let v=(y-128)*(mode==='threshold'?1.9:1.45)+128;if(mode==='threshold')v=v>160?255:0;v=Math.max(0,Math.min(255,v));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0)}return canvas;}
async function recognizeVariants(worker,blob,status){const variants=[];for(const mode of ['original','enhanced','threshold']){status(mode==='original'?'Reading image…':mode==='enhanced'?'Enhancing text…':'Checking text layout…');const canvas=await preprocessImage(blob,mode);await worker.setParameters({tessedit_pageseg_mode:mode==='original'?'6':'11',preserve_interword_spaces:'1'});variants.push(await worker.recognize(canvas));canvas.width=1;canvas.height=1;}return variants;}
async function readImage(item,status){const path=item.file_path||item.original_file_path;if(!path)throw Error('Uploaded image path is missing.');const signedUrl=await getCachedSignedUrl(supabase,'cooking-confidential',path);const res=await fetch(signedUrl);if(!res.ok)throw Error('Could not load the uploaded image.');const blob=await res.blob();const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')status(`Reading image… ${Math.round((m.progress||0)*100)}%`)}});try{const variants=await recognizeVariants(worker,blob,status);const texts=variants.map(v=>String(v.data?.text||''));const parsed=parseLines(texts.join('\n'));parsed.name=titleFromOcr(variants);const sectionTexts=texts.map(parseLines);for(const p of sectionTexts){parsed.ingredients.push(...p.ingredients);parsed.method.push(...p.method)}parsed.ingredients=[...new Set(parsed.ingredients)].slice(0,80);parsed.method=[...new Set(parsed.method)].slice(0,80);return parsed}finally{await worker.terminate()}}
function field(label,name,list,value){const v=String(value||'');const known=list.includes(v);return `<label>${label}<select name="${name}">${list.map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(o||'Select…')}</option>`).join('')}<option value="__custom__" ${v&&!known?'selected':''}>Other / custom…</option></select><input name="${name}_custom" placeholder="Enter category" style="display:${v&&!known?'block':'none'};margin-top:8px" value="${v&&!known?esc(v):''}"></label>`}
async function imagePicker(form,recipeName){const input=form.querySelector('[name="image_url"]');if(!input)return;input.type='hidden';const wrap=document.createElement('div');wrap.className='cc-upload-image-picker';wrap.innerHTML='<label>Recipe photo<input class="cc-upload-image-search" type="text" placeholder="Search by recipe title or keywords"></label><button type="button" class="secondary cc-upload-image-search-btn">Search images</button><div class="cc-upload-image-selected"></div><div class="cc-upload-image-results"></div>';input.parentElement.replaceWith(wrap);wrap.appendChild(input);const search=wrap.querySelector('.cc-upload-image-search'),btn=wrap.querySelector('.cc-upload-image-search-btn'),selected=wrap.querySelector('.cc-upload-image-selected'),results=wrap.querySelector('.cc-upload-image-results');search.value=recipeName&&recipeName!=='Imported recipe'?recipeName:'';btn.disabled=search.value.trim().length<3;const show=()=>{const u=input.value.trim();selected.innerHTML=u?'<p class="small-note">Selected image</p><img src="'+esc(u)+'" class="cc-image-preview" alt="Selected recipe image">':''};show();async function find(){const q=search.value.trim();if(q.length<3)return;btn.disabled=true;results.innerHTML='<p class="small-note">Searching images…</p>';try{const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(q+' food')+'&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*';const data=await fetch(api).then(r=>r.json());const pages=Object.values(data.query?.pages||{}).filter(p=>p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url).slice(0,5);results.innerHTML=pages.length?pages.map((p,i)=>{const u=p.imageinfo[0].thumburl||p.imageinfo[0].url;return '<button type="button" class="cc-upload-image-option" data-u="'+esc(u)+'"><img src="'+esc(u)+'" alt="Food image '+(i+1)+'"><span>Use image '+(i+1)+'</span></button>'}).join(''):'<p class="small-note">No matching images found. Try fewer words.</p>';results.querySelectorAll('.cc-upload-image-option').forEach(b=>b.onclick=()=>{input.value=b.dataset.u;show();results.querySelectorAll('.cc-upload-image-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})}catch(e){results.innerHTML='<p class="small-note">Could not search images. Please try again.</p>'}finally{btn.disabled=false}}btn.onclick=find;search.addEventListener('input',()=>{btn.disabled=search.value.trim().length<3});search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}})}
async function reviewImage(id){
  const{data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!x)return window.ccShowError(error?.message||'Import item could not be loaded.','Could not load import');
  importDialog?.close();
  detailDialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Reading image…</h2><p class="small-note" id="genericImageStatus">Preparing the recipe for review.</p></div>';
  detailDialog.showModal();
  try{
    const status=t=>{const e=document.querySelector('#genericImageStatus');if(e)e.textContent=t};
    const parsed=await readImage(x,status);
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
  }catch(e){window.ccShowError(e.message||String(e),'Image extraction failed')}
}
export { reviewImage };