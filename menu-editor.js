import { supabase } from './supabase-client.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanHtml=(html='')=>{
  const doc=new DOMParser().parseFromString('<div>'+String(html||'')+'</div>','text/html');
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','SPAN','A','UL','OL','LI','FONT']);
  const walk=n=>{
    if(n.nodeType===Node.TEXT_NODE)return document.createTextNode(n.nodeValue||'');
    if(n.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');
    if(!allowed.has(n.tagName)){const f=document.createDocumentFragment();[...n.childNodes].forEach(x=>f.appendChild(walk(x)));return f}
    const el=document.createElement(n.tagName.toLowerCase());
    if(n.tagName==='A'&&n.getAttribute('href')){el.setAttribute('href',n.getAttribute('href'));el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');if(n.dataset.recipeId)el.dataset.recipeId=n.dataset.recipeId}
    if(n.tagName==='SPAN'&&n.getAttribute('style')){const s=n.getAttribute('style').replace(/position|behavior|content/gi,'');el.setAttribute('style',s)}
    if(n.tagName==='FONT'){if(n.getAttribute('face'))el.style.fontFamily=n.getAttribute('face');if(n.getAttribute('size')){const map={1:'12px',2:'14px',3:'16px',4:'18px',5:'22px',6:'26px',7:'30px'};el.style.fontSize=map[n.getAttribute('size')]||'16px'}}
    [...n.childNodes].forEach(x=>el.appendChild(walk(x)));return el
  };
  const out=document.createElement('div');[...(doc.body.firstElementChild?.childNodes||[])].forEach(x=>out.appendChild(walk(x)));return out.innerHTML
};
const textToBlocks=text=>String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter((x,i,a)=>x||i===0).map(x=>({type:'line',html:esc(x)}));
const docFromMenu=m=>{
  if(Array.isArray(m?.document?.blocks))return m.document;
  if(m?.content){try{const j=JSON.parse(m.content);if(Array.isArray(j?.blocks))return j}catch{}}
  return {version:1,blocks:[]}
};
const normalizeBlocks=blocks=>blocks.map(b=>({...b,html:cleanHtml(b.html||'')}));
const recipeCache=new Map();

function styles(){
 if(document.querySelector('#ccMenuEditorStyles'))return;
 const s=document.createElement('style');s.id='ccMenuEditorStyles';s.textContent=`
 #ccMenuEditorDialog{max-width:min(1080px,96vw);width:min(1080px,96vw);max-height:94vh}
 #ccMenuEditorDialog .dialog-card{max-height:94vh;overflow:auto;padding:26px}
 .cc-menu-toolbar{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 0 12px;margin-bottom:14px}
 .cc-menu-toolrow{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
 .cc-menu-toolrow button,.cc-menu-toolrow select,.cc-menu-toolrow input{min-height:38px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:7px 10px;font:13px Arial;color:var(--ink)}
 .cc-menu-toolrow button{cursor:pointer;font-weight:600}
 .cc-menu-toolrow .cc-tool-primary{background:var(--paper)}
 .cc-menu-document{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;min-height:520px;box-shadow:0 4px 18px rgba(40,30,20,.05)}
 .cc-menu-block{position:relative;min-height:30px;padding:7px 42px 7px 6px;margin:2px 0;border-radius:7px;outline:none;line-height:1.45;font-family:Georgia,"Times New Roman",serif}
 .cc-menu-block:focus{box-shadow:inset 0 0 0 1px rgba(155,63,47,.35)}
 .cc-menu-block.cc-divider{border-top:1px solid var(--line);height:1px;min-height:1px;padding:0;margin:16px 4px}
 .cc-menu-block .cc-block-controls{position:absolute;right:2px;top:5px;display:flex;gap:3px;opacity:.35}
 .cc-menu-block:hover .cc-block-controls,.cc-menu-block:focus-within .cc-block-controls{opacity:1}
 .cc-block-controls button{border:1px solid var(--line);background:var(--paper);border-radius:5px;width:28px;height:28px;padding:0;font:12px Arial}
 .cc-menu-meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
 .cc-menu-meta label{margin:8px 0}
 .cc-menu-meta input{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:9px;background:#fff;font:14px Arial}
 .cc-menu-original-note{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font:13px/1.4 Arial;color:var(--muted);margin:10px 0}
 .cc-menu-linkrow{margin-top:8px;display:flex;gap:7px;flex-wrap:wrap}
 .cc-menu-linkrow select,.cc-menu-linkrow input{min-height:36px}
 .cc-menu-actions-grid{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
 .cc-menu-actions-grid .danger{color:var(--accent)}
 .cc-menu-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
 .cc-menu-card-actions button{font:12px Arial;padding:8px 12px;border-radius:8px}
 .cc-menu-card-preview{font:15px/1.55 Georgia,serif;margin-top:12px;color:var(--ink);white-space:normal}
 .cc-menu-card-preview .more{color:var(--muted);font:12px Arial}
 @media(max-width:760px){
   #ccMenuEditorDialog{max-width:96vw;width:96vw}
   #ccMenuEditorDialog .dialog-card{padding:18px 14px}
   .cc-menu-meta{grid-template-columns:1fr}
   .cc-menu-document{padding:14px;min-height:420px}
   .cc-menu-toolrow button,.cc-menu-toolrow select{min-height:40px}
   .cc-menu-block{padding-right:34px}
 }
 @media print{
   body>*:not(#ccMenuEditorDialog){display:none!important}
   #ccMenuEditorDialog{display:block!important;position:static!important;width:auto!important;max-width:none!important;max-height:none!important}
   #ccMenuEditorDialog::backdrop{display:none}
   #ccMenuEditorDialog .dialog-card{box-shadow:none;border:0;max-height:none;overflow:visible}
   .cc-menu-toolbar,.cc-menu-actions-grid,.cc-menu-block-controls,.cc-menu-meta,.cc-menu-original-note,#ccMenuEditorClose{display:none!important}
   .cc-menu-document{border:0;box-shadow:none;padding:0;min-height:0}
 }`;
 document.head.appendChild(s)
}

function ensureDialog(){
 let d=document.querySelector('#ccMenuEditorDialog');
 if(d)return d;
 d=document.createElement('dialog');d.id='ccMenuEditorDialog';d.innerHTML='<div class="dialog-card" id="ccMenuEditorContent"></div>';document.body.appendChild(d);return d
}
async function recipesForLinks(){
 if(recipeCache.size)return [...recipeCache.values()];
 const q=await supabase.from('cc_recipes').select('id,name,cuisine,course,recipe_type').order('name');
 if(!q.error)(q.data||[]).forEach(r=>recipeCache.set(Number(r.id),r));
 return [...recipeCache.values()]
}
function getSelectionEditor(){const s=getSelection();const n=s?.anchorNode?.parentElement?.closest?.('.cc-menu-block');return n||null}
function exec(cmd,value=null){document.execCommand('styleWithCSS',false,true);document.execCommand(cmd,false,value)}
function fontSize(value){
 const map={'12px':1,'14px':2,'16px':3,'18px':4,'22px':5,'26px':6,'30px':7};
 exec('fontSize',map[value]||3);
 const ed=getSelectionEditor();if(ed)ed.innerHTML=cleanHtml(ed.innerHTML)
}
function addLink(href,recipeId=null){
 const ed=getSelectionEditor();if(!ed)return window.ccShowError('Place the cursor in a menu line and select some text first.','Select menu text');
 if(!getSelection()?.toString())return window.ccShowError('Select the text you want to link first.','Select menu text');
 exec('createLink',href);
 const sel=getSelection();let node=sel?.anchorNode?.parentElement?.closest?.('a');if(recipeId&&ed){ed.querySelectorAll('a').forEach(a=>{if(a.getAttribute('href')===('#recipe-'+recipeId)||a.getAttribute('href')?.endsWith('#recipe-'+recipeId))a.dataset.recipeId=String(recipeId)})}if(ed)ed.innerHTML=cleanHtml(ed.innerHTML)
}
async function collectDocument(){
 const blocks=[...document.querySelectorAll('#ccMenuDocument .cc-menu-block')].map(el=>{
   if(el.classList.contains('cc-divider'))return {type:'divider',html:''};
   const clone=el.cloneNode(true);clone.querySelectorAll('.cc-block-controls').forEach(x=>x.remove());
   return {type:'line',html:cleanHtml(clone.innerHTML)}
 }).filter((b,i)=>b.type==='divider'||b.html||i===0);
 return {version:1,blocks}
}
function blockMarkup(b,i){
 if(b.type==='divider')return '<div class="cc-menu-block cc-divider" data-index="'+i+'" contenteditable="false"><div class="cc-block-controls"><button type="button" data-move="-1" title="Move up">↑</button><button type="button" data-move="1" title="Move down">↓</button><button type="button" data-delete="1" title="Delete">×</button></div></div>';
 return '<div class="cc-menu-block" data-index="'+i+'" contenteditable="true">'+(b.html||'')+'<div class="cc-block-controls"><button type="button" data-move="-1" title="Move up">↑</button><button type="button" data-move="1" title="Move down">↓</button><button type="button" data-delete="1" title="Delete">×</button></div></div>'
}
async function openEditor(menu,{blocks=null,sourceLabel='',newMenu=false}={}){
 styles();const d=ensureDialog();let source=blocks?{version:1,blocks}:docFromMenu(menu);if(!blocks&&menu.id&&!(source.blocks||[]).length){const legacy=await supabase.from('cc_menu_items').select('sort_order,custom_label,section,recipe_id,cc_recipes(id,name)').eq('menu_id',menu.id).order('sort_order');if(!legacy.error&&legacy.data?.length){source={version:1,blocks:legacy.data.map(x=>({type:'line',html:'<a href=\"#recipe-'+x.recipe_id+'\" data-recipe-id=\"'+x.recipe_id+'\">'+esc(x.custom_label||x.cc_recipes?.name||'Recipe')+'</a>'}))}}}const initial=normalizeBlocks(source.blocks||[]);
 const recipes=await recipesForLinks();
 d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" type="button" id="ccMenuEditorClose">×</button><p class="eyebrow">'+(newMenu?'NEW MENU':'MENU EDITOR')+'</p><h2>'+(newMenu?'Create a menu':esc(menu.name||'Edit menu'))+'</h2><div class="cc-menu-meta"><label>Menu name<input id="ccMenuName" value="'+esc(menu.name||'')+'" required></label><label>Date<input id="ccMenuDate" type="date" value="'+esc(menu.menu_date||'')+'"></label><label>Guests<input id="ccMenuGuests" type="number" min="1" value="'+esc(menu.guest_count??'')+'"></label></div><label>Occasion<input id="ccMenuOccasion" value="'+esc(menu.occasion||'')+'"></label><div class="cc-menu-original-note" id="ccMenuOriginalNote">'+(sourceLabel?'Original uploaded: <strong>'+esc(sourceLabel)+'</strong>. It is retained unchanged.':'Menu content is editable. Your saved version is separate from any original upload.')+'</div><div class="cc-menu-toolbar"><div class="cc-menu-toolrow"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><select id="ccMenuFont" title="Font"><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Verdana">Verdana</option></select><select id="ccMenuSize" title="Font size"><option value="12px">Small</option><option value="14px">14</option><option value="16px" selected>Normal</option><option value="18px">Large</option><option value="22px">Extra large</option><option value="30px">Title</option></select><button type="button" data-block-style="normal">Normal</button><button type="button" data-block-style="heading">Heading</button><button type="button" data-block-style="subheading">Subheading</button><button type="button" id="ccMenuBullet">• List</button><button type="button" id="ccMenuNumber">1. List</button><button type="button" id="ccMenuDivider">Divider</button><button type="button" id="ccMenuAddLine">＋ Line</button></div><div class="cc-menu-linkrow"><select id="ccMenuRecipeLink"><option value="">Link selected text to a recipe…</option>'+recipes.map(r=>'<option value="'+r.id+'">'+esc(r.name)+'</option>').join('')+'</select><button type="button" id="ccMenuApplyRecipeLink">Link recipe</button><input id="ccMenuUrl" type="url" placeholder="https:// external link"><button type="button" id="ccMenuApplyUrl">Link URL</button></div></div><div id="ccMenuDocument" class="cc-menu-document" spellcheck="true">'+initial.map(blockMarkup).join('')+'</div><div class="cc-menu-actions-grid"><button class="secondary" type="button" id="ccMenuShowOriginal">Show Original</button><button class="secondary" type="button" id="ccMenuSaveAs">Save As</button><button class="secondary" type="button" id="ccMenuPrint">Print</button><button class="secondary" type="button" id="ccMenuShare">Share</button><button class="secondary" type="button" id="ccMenuFavourite">'+(menu.is_favourite?'★ Unfavourite':'☆ Favourite')+'</button><button class="secondary danger" type="button" id="ccMenuDelete" '+(newMenu?'disabled':'')+'>Delete</button><button class="primary" type="button" id="ccMenuSave">Save</button></div>';
 d.showModal();
 const content=d.querySelector('#ccMenuEditorContent');
 content.querySelector('#ccMenuEditorClose').onclick=()=>d.close();
 content.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>{const ed=getSelectionEditor();if(!ed)return;ed.focus();exec(b.dataset.cmd)});
 content.querySelector('#ccMenuFont').onchange=e=>{const ed=getSelectionEditor();if(ed){ed.focus();exec('fontName',e.target.value)}};
 content.querySelector('#ccMenuSize').onchange=e=>{const ed=getSelectionEditor();if(ed){ed.focus();fontSize(e.target.value)}};
 content.querySelectorAll('[data-block-style]').forEach(b=>b.onclick=()=>{const ed=getSelectionEditor();if(!ed)return;ed.focus();const tag=b.dataset.blockStyle==='heading'?'h3':b.dataset.blockStyle==='subheading'?'h4':'div';exec('formatBlock',tag)});
 content.querySelector('#ccMenuBullet').onclick=()=>exec('insertUnorderedList');
 content.querySelector('#ccMenuNumber').onclick=()=>exec('insertOrderedList');
 content.querySelector('#ccMenuDivider').onclick=()=>{const doc=d.querySelector('#ccMenuDocument');doc.insertAdjacentHTML('beforeend','<div class="cc-menu-block cc-divider" contenteditable="false"><div class="cc-block-controls"><button type="button" data-move="-1">↑</button><button type="button" data-move="1">↓</button><button type="button" data-delete="1">×</button></div></div>')};
 content.querySelector('#ccMenuAddLine').onclick=()=>{const doc=d.querySelector('#ccMenuDocument');doc.insertAdjacentHTML('beforeend','<div class="cc-menu-block" contenteditable="true"><br><div class="cc-block-controls"><button type="button" data-move="-1">↑</button><button type="button" data-move="1">↓</button><button type="button" data-delete="1">×</button></div></div>');doc.lastElementChild.focus()};
 content.querySelector('#ccMenuApplyRecipeLink').onclick=()=>{const id=content.querySelector('#ccMenuRecipeLink').value;if(!id)return;const r=recipes.find(x=>String(x.id)===String(id));if(!r)return;addLink('#recipe-'+id,id)};
 content.querySelector('#ccMenuApplyUrl').onclick=()=>{const u=content.querySelector('#ccMenuUrl').value.trim();if(/^https?:\\/\\//i.test(u))addLink(u)};
 d.querySelector('#ccMenuDocument').addEventListener('click',e=>{
   const del=e.target.closest('[data-delete]'),move=e.target.closest('[data-move]');
   const block=e.target.closest('.cc-menu-block');if(!block)return;
   if(del){block.remove();return}
   if(move){const dir=Number(move.dataset.move);const sib=dir<0?block.previousElementSibling:block.nextElementSibling;if(!sib)return;dir<0?block.parentNode.insertBefore(block,sib):block.parentNode.insertBefore(sib,block)}
   const a=e.target.closest('a[data-recipe-id]');if(a){e.preventDefault();openRecipe(Number(a.dataset.recipeId))}
 });
 const save=async asNew=>{
   const name=String(content.querySelector('#ccMenuName').value||'').trim();if(!name)return window.ccShowError('Please enter a menu name.','Menu name required');
   const documentData=await collectDocument();const {data:{user}}=await supabase.auth.getUser();if(!user)return window.ccShowError('Please sign in again.','Sign-in required');
   const payload={name,menu_date:content.querySelector('#ccMenuDate').value||null,guest_count:content.querySelector('#ccMenuGuests').value?Number(content.querySelector('#ccMenuGuests').value):null,occasion:String(content.querySelector('#ccMenuOccasion').value||'').trim()||null,content:JSON.stringify(documentData),document:documentData,visibility:'private',created_by:user.id};
   if(!asNew&&menu.id)payload.id=menu.id;
   if(menu.original_file_path){payload.original_file_path=menu.original_file_path;payload.original_file_name=menu.original_file_name;payload.original_mime_type=menu.original_mime_type}
   const q=asNew||!menu.id?await supabase.from('cc_menus').insert(payload).select().single():await supabase.from('cc_menus').update(payload).eq('id',menu.id).select().single();
   if(q.error)return window.ccShowError(q.error.message,asNew?'Could not save menu as new':'Could not save menu');
   d.close();await window.ccReloadMenus?.()
 };
 content.querySelector('#ccMenuSave').onclick=()=>save(false);
 content.querySelector('#ccMenuSaveAs').onclick=async()=>{const base=String(content.querySelector('#ccMenuName').value||menu.name||'Menu').trim();content.querySelector('#ccMenuName').value=base+' — Copy';await save(true)};
 content.querySelector('#ccMenuPrint').onclick=()=>window.print();
 content.querySelector('#ccMenuShare').onclick=async()=>shareMenu(menu,content);
 content.querySelector('#ccMenuFavourite').onclick=async()=>{if(!menu.id)return;const next=!menu.is_favourite;const q=await supabase.from('cc_menus').update({is_favourite:next}).eq('id',menu.id);if(q.error)return window.ccShowError(q.error.message,'Could not update favourite');menu.is_favourite=next;content.querySelector('#ccMenuFavourite').textContent=next?'★ Unfavourite':'☆ Favourite'};
 content.querySelector('#ccMenuDelete').onclick=async()=>{if(!menu.id||!confirm('Delete this menu permanently?'))return;const q=await supabase.from('cc_menus').delete().eq('id',menu.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete menu');d.close();await window.ccReloadMenus?.()};
 content.querySelector('#ccMenuShowOriginal').onclick=()=>showOriginal(menu);
}
async function openRecipe(id){const q=await supabase.from('cc_recipes').select('id,name,description,ingredients,method').eq('id',id).single();if(q.error)return window.ccShowError(q.error.message,'Could not open recipe');const d=ensureDialog();d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccRecipeBack">×</button><p class="eyebrow">RECIPE LINK</p><h2>'+esc(q.data.name)+'</h2><div class="cc-menu-original-note">This menu item is linked to the Cooking Confidential recipe.</div><div class="detail-section"><h4>Ingredients</h4><div>'+esc(Array.isArray(q.data.ingredients)?q.data.ingredients.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join('\\n'):String(q.data.ingredients||''))+'</div></div><div class="detail-section"><h4>Method</h4><div>'+cleanHtml(q.data.method||'')+'</div></div>';d.showModal();d.querySelector('#ccRecipeBack').onclick=()=>d.close()}
async function showOriginal(menu){
 if(!menu.original_file_path)return window.ccShowError('No original upload is attached to this menu.','Original unavailable');
 const name=menu.original_file_name||'Original menu';let url;try{const q=await supabase.storage.from('cooking-confidential').createSignedUrl(menu.original_file_path,900);if(q.error||!q.data?.signedUrl)throw Error(q.error?.message||'Could not open original file');url=q.data.signedUrl}catch(e){return window.ccShowError(e.message,'Could not open original menu')}
 const lower=name.toLowerCase(),d=ensureDialog();
 if(lower.endsWith('.docx')){try{const blob=await fetch(url).then(r=>r.blob());const out=await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()});d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><div class="original-viewer">'+(out.value||'<p>No readable content found.</p>')+'</div>';d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);return}catch(e){}}
 if(/\\.(png|jpe?g|webp|gif)$/i.test(name)){d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><div class="original-viewer"><img class="original-image" src="'+esc(url)+'" alt="Original menu"></div>';d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);return}
 if(lower.endsWith('.pdf')){d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><iframe class="original-pdf" title="Original menu PDF" src="'+esc(url)+'"></iframe>';d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);return}
 d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><p><a class="primary" href="'+esc(url)+'" target="_blank" rel="noopener">Open original file</a></p>';d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu)
}
async function shareMenu(menu,content){
 const doc=await collectDocument();const text=doc.blocks.map(b=>b.type==='divider'?'---':String(b.html||'').replace(/<[^>]+>/g,' ')).join('\\n');
 try{if(navigator.share){await navigator.share({title:menu.name||'Cooking Confidential menu',text});return}await navigator.clipboard.writeText(text);window.ccShowError('Menu text copied to the clipboard.','Share menu')}catch(e){if(e.name!=='AbortError')window.ccShowError(e.message||'Could not share menu.','Could not share menu')}
}
async function extractMenu(file){
 const name=file.name||'Imported menu';const lower=name.toLowerCase();
 if(lower.endsWith('.docx')){const out=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return textToBlocks(out.value)}
 if(lower.endsWith('.txt'))return textToBlocks(await file.text());
 if(lower.endsWith('.pdf')){
   try{
     const pdfjs=await import('https://esm.sh/pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
     const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data}).promise;let text='';
     for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();text+=c.items.map(x=>x.str||'').join(' ')+'\\n'}
     return textToBlocks(text)
   }catch(e){return [{type:'line',html:esc('PDF uploaded. The original is preserved; please enter the menu text here if automatic extraction is unavailable.')}]} 
 }
 if(file.type.startsWith('image/'))return [{type:'line',html:esc('Image menu uploaded. The original is preserved; please type or paste the menu text here.')}];
 throw new Error('Please upload a DOCX, PDF, TXT or image menu.');
}
async function uploadExisting(){
 const input=document.createElement('input');input.type='file';input.accept='.docx,.pdf,.txt,.png,.jpg,.jpeg,.webp';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return window.ccShowError('Please sign in again.','Sign-in required');const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');const path='menu-originals/'+user.id+'/'+Date.now()+'-'+safeName;const up=await supabase.storage.from('cooking-confidential').upload(path,file,{contentType:file.type||'application/octet-stream',cacheControl:'86400',upsert:false});if(up.error)return window.ccShowError(up.error.message,'Could not upload original menu');let blocks;try{blocks=await extractMenu(file)}catch(e){await supabase.storage.from('cooking-confidential').remove([path]);return window.ccShowError(e.message,'Could not read menu')};const menu={name:file.name.replace(/\\.[^.]+$/,''),menu_date:null,guest_count:null,occasion:null,content:'',document:{version:1,blocks},original_file_path:path,original_file_name:file.name,original_mime_type:file.type||null,is_favourite:false};await openEditor(menu,{blocks,sourceLabel:file.name,newMenu:true})};input.click()
}
function newBlank(){openEditor({name:'',menu_date:'',guest_count:null,occasion:'',document:{version:1,blocks:[{type:'line',html:''}]},is_favourite:false},{newMenu:true})}
function menuActions(){
 document.querySelectorAll('[data-menu-action]').forEach(b=>{if(b.dataset.ccBound)return;b.dataset.ccBound='1';b.onclick=async e=>{e.preventDefault();e.stopPropagation();const id=Number(b.dataset.id);const m=(window.ccMenus||[]).find(x=>Number(x.id)===id);if(!m)return;if(b.dataset.menuAction==='open'||b.dataset.menuAction==='edit')return openEditor(m);if(b.dataset.menuAction==='original')return showOriginal(m);if(b.dataset.menuAction==='print')return openEditor(m).then(()=>setTimeout(()=>window.print(),250));if(b.dataset.menuAction==='share')return openEditor(m).then(()=>document.querySelector('#ccMenuShare')?.click());if(b.dataset.menuAction==='saveas')return openEditor(m).then(()=>setTimeout(()=>document.querySelector('#ccMenuSaveAs')?.click(),100));if(b.dataset.menuAction==='fav'){const q=await supabase.from('cc_menus').update({is_favourite:!m.is_favourite}).eq('id',m.id);if(q.error)return window.ccShowError(q.error.message,'Could not update favourite');m.is_favourite=!m.is_favourite;window.ccRenderMenus?.();}if(b.dataset.menuAction==='delete'){if(!confirm('Delete this menu permanently?'))return;const q=await supabase.from('cc_menus').delete().eq('id',m.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete menu');await window.ccReloadMenus?.()}}})
}
function enhance(){
 styles();const head=document.querySelector('#content .section-head h2');if(!head||!head.textContent.includes('Your menus'))return;
 const old=document.querySelector('#newMenuBtn');if(old&&!document.querySelector('#ccUploadMenuBtn')){const wrap=document.createElement('div');wrap.className='cc-menu-actions-grid';const upload=document.createElement('button');upload.className='primary';upload.id='ccUploadMenuBtn';upload.textContent='＋ Upload existing menu';upload.onclick=uploadExisting;const blank=old;blank.className='secondary';blank.textContent='＋ New menu';blank.onclick=e=>{e.preventDefault();newBlank()};wrap.append(upload,blank);blank.parentNode.insertBefore(wrap,blank);wrap.appendChild(blank)}
 menuActions()
}
window.ccMenuEditor={openEditor,uploadExisting,newBlank,showOriginal};
const obs=new MutationObserver(()=>enhance());obs.observe(document.body,{subtree:true,childList:true});enhance();
