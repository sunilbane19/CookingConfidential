import { supabase } from './supabase-client.js?v=1.0.0';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatMenuDate=v=>{
 const s=String(v??'').trim();
 let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
 if(m)return m[3]+'-'+m[2]+'-'+m[1];
 m=/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(s);
 return m?m[1]+'-'+m[2]+'-'+m[3]:s;
};
const parseMenuDate=v=>{
 const s=String(v??'').trim();
 if(!s)return null;
 const m=/^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
 if(!m)return null;
 const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
 const dt=new Date(Date.UTC(y,mo-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return null;
 return y.toString().padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
};
const cleanHtml=(html='')=>{
  const doc=new DOMParser().parseFromString('<div>'+String(html||'')+'</div>','text/html');
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','SPAN','A','UL','OL','LI','FONT','H1','H2','H3','H4','H5','H6','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH']);
  const walk=n=>{
    if(n.nodeType===Node.TEXT_NODE)return document.createTextNode(n.nodeValue||'');
    if(n.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');
    if(!allowed.has(n.tagName)){const f=document.createDocumentFragment();[...n.childNodes].forEach(x=>f.appendChild(walk(x)));return f}
    const el=document.createElement(n.tagName.toLowerCase());
    if(n.tagName==='A'&&n.getAttribute('href')){el.setAttribute('href',n.getAttribute('href'));el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');if(n.dataset.recipeId)el.dataset.recipeId=n.dataset.recipeId}
    if(n.getAttribute('style')){const s=n.getAttribute('style').replace(/position|behavior|content|url\s*\(/gi,'');el.setAttribute('style',s)}
    if(n.tagName==='FONT'){if(n.getAttribute('face'))el.style.fontFamily=n.getAttribute('face');if(n.getAttribute('size')){const map={1:'12px',2:'14px',3:'16px',4:'18px',5:'22px',6:'26px',7:'30px'};el.style.fontSize=map[n.getAttribute('size')]||'16px'}}
    [...n.childNodes].forEach(x=>el.appendChild(walk(x)));return el
  };
  const out=document.createElement('div');[...(doc.body.firstElementChild?.childNodes||[])].forEach(x=>out.appendChild(walk(x)));return out.innerHTML
};
const textToBlocks=text=>String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter((x,i,a)=>x||i===0).map(x=>({type:'line',html:esc(x)}));
const htmlToBlocks=html=>{
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const nodes=[...doc.body.children];
  if(!nodes.length)return textToBlocks(doc.body.textContent||'');
  return nodes.map((el,i)=>({type:'line',html:cleanHtml(el.outerHTML)})).filter((b,i)=>b.html||i===0);
};
const docFromMenu=m=>{
  if(Array.isArray(m?.document?.blocks))return m.document;
  if(m?.content){try{const j=JSON.parse(m.content);if(Array.isArray(j?.blocks))return j}catch{}}
  return {version:1,blocks:[]}
};
const normalizeBlocks=blocks=>blocks.map(b=>({...b,html:cleanHtml(b.html||'')}));
const recipeCache=new Map();

function styles(){
 /* menu editor UI refresh 1.9.14 */
 if(document.querySelector('#ccMenuEditorStyles'))return;
 const s=document.createElement('style');s.id='ccMenuEditorStyles';s.textContent=`
 #ccMenuEditorDialog{max-width:min(1120px,96vw);width:100%;max-height:94vh}
 #ccMenuEditorDialog .dialog-card{max-height:90vh;overflow:auto;padding:30px 36px}
 .cc-menu-toolbar{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 0 12px;margin-bottom:14px}
 .cc-menu-toolrow{display:flex;flex-wrap:nowrap;gap:5px;align-items:center;overflow-x:auto;overflow-y:hidden;padding-bottom:2px;scrollbar-width:thin}
 .cc-menu-toolrow button,.cc-menu-toolrow select,.cc-menu-toolrow input{min-height:36px;flex:0 0 auto;border:1px solid var(--line);border-radius:8px;background:#fff;padding:6px 9px;font:13px Arial;color:var(--ink)}
 .cc-menu-toolrow button{cursor:pointer;font-weight:600}.cc-menu-align{min-width:42px}.cc-menu-align.active{background:var(--accent);color:#fff;border-color:var(--accent)}
 .cc-menu-toolrow .cc-tool-primary{background:var(--paper)}
 .cc-menu-document{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;min-height:520px;box-shadow:0 4px 18px rgba(40,30,20,.05)}
 .cc-menu-document[contenteditable="true"] .cc-menu-block{position:relative;min-height:30px;padding:7px 42px 7px 6px;margin:2px 0;border-radius:7px;outline:none;line-height:1.45;font-family:Georgia,"Times New Roman",serif}
 .cc-menu-block:focus{box-shadow:inset 0 0 0 1px rgba(155,63,47,.35)} .cc-menu-block h1,.cc-menu-block h2,.cc-menu-block h3,.cc-menu-block h4,.cc-menu-block h5,.cc-menu-block h6{margin:0 0 8px}.cc-menu-block table{border-collapse:collapse;width:100%;margin:6px 0;table-layout:auto}.cc-menu-block th,.cc-menu-block td{border:1px solid var(--line);padding:5px 7px;vertical-align:top;text-align:inherit}
 .cc-menu-block.cc-divider{border-top:1px solid var(--line);height:1px;min-height:1px;padding:0;margin:16px 4px}
 .cc-menu-block .cc-block-controls{position:absolute;right:2px;top:5px;display:flex;gap:3px;opacity:.35}
 .cc-menu-block:hover .cc-block-controls,.cc-menu-block:focus-within .cc-block-controls{opacity:1}
 .cc-block-controls button{border:1px solid var(--line);background:var(--paper);border-radius:5px;width:28px;height:28px;padding:0;font:12px Arial}
 .cc-menu-meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
 .cc-menu-meta label{margin:8px 0}
 .cc-menu-meta input{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:9px;background:#fff;font:14px Arial}
 .cc-menu-original-note{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8f5ee;font:13px/1.4 Arial;color:var(--muted);margin:10px 0}
 .cc-menu-linkrow{margin-top:8px;display:grid;grid-template-columns:minmax(260px,1fr) auto minmax(220px,.8fr) auto auto;gap:7px;align-items:center}
 .cc-menu-linkrow select,.cc-menu-linkrow input{min-height:38px;width:100%;min-width:0;border:1px solid var(--line);border-radius:8px;background:#fff;padding:7px 10px;font:13px Arial;color:var(--ink)} .cc-menu-linkrow button{min-height:38px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:#fff;padding:7px 13px;font:600 13px Arial;cursor:pointer;white-space:nowrap} .cc-menu-upload-list{display:grid;gap:10px;margin-top:14px}.cc-menu-upload-item{border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}.cc-menu-upload-item .meta{font:13px/1.4 Arial;color:var(--muted)}.cc-menu-upload-actions{display:flex;gap:7px;flex-wrap:wrap}.cc-menu-upload-actions button{min-height:36px;border:1px solid var(--line);border-radius:8px;background:var(--paper);padding:7px 12px;font:600 13px Arial;cursor:pointer}.cc-menu-upload-actions .primary-action{background:var(--accent);border-color:var(--accent);color:#fff}
 .cc-menu-actions-grid{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
 #ccMenuConfirmDialog{border:0;border-radius:16px;padding:0;width:min(430px,92vw);background:transparent;box-shadow:0 18px 60px rgba(30,20,10,.22)}
 #ccMenuConfirmDialog::backdrop{background:rgba(35,28,22,.48)}
 .cc-confirm-card{background:var(--card);padding:28px;border:1px solid var(--line);border-radius:16px;text-align:center}
 .cc-confirm-icon{width:38px;height:38px;margin:0 auto 10px;border-radius:50%;background:var(--paper);color:var(--accent);display:grid;place-items:center;font:bold 18px Arial}
 .cc-confirm-card h2{margin:4px 0 10px}.cc-confirm-card p:not(.eyebrow){line-height:1.5;color:var(--muted)}
 .cc-confirm-actions{display:flex;justify-content:center;gap:10px;margin-top:22px}

 .cc-menu-actions-grid .danger{color:var(--accent)}
 .cc-menu-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
 .cc-menu-card-actions button{font:12px Arial;padding:9px 12px;border-radius:10px;min-height:40px}
 .cc-menu-card-preview{font:15px/1.55 Georgia,serif;margin-top:12px;color:var(--ink);white-space:normal}
 .cc-menu-card-preview .more{color:var(--muted);font:12px Arial}
 .cc-menu-original-viewer{max-height:72vh;overflow:auto;background:#e9e5dd;border:1px solid var(--line);border-radius:12px;padding:18px}
 .cc-menu-original-viewer .docx-wrapper{margin:0 auto!important}
 .cc-menu-original-viewer .docx{margin:0 auto}
 .cc-menu-original-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
 .cc-menu-original-actions a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
 .cc-menu-original-viewer img{max-width:100%;height:auto}

 @media(max-width:760px){
   #ccMenuEditorDialog{max-width:98vw;width:98vw}
   #ccMenuEditorDialog .dialog-card{padding:18px 14px}
   .cc-menu-meta{grid-template-columns:1fr}
   .cc-menu-document{padding:14px;min-height:420px}
   .cc-menu-toolrow button,.cc-menu-toolrow select{min-height:40px}
   .cc-menu-block{padding-right:34px}
 }
 .cc-menu-clear-selection{margin-left:auto}
 body.cc-menu-printing #ccMenuPrintPage{display:block!important}
 #ccMenuPrintPage{display:none}
 @media print{
   @page{size:A4 portrait;margin:8mm}
   body.cc-menu-printing{padding:0!important;background:#fff!important}
   body.cc-menu-printing>*:not(#ccMenuPrintPage){display:none!important}
   body.cc-menu-printing #ccMenuPrintPage{display:block!important;width:194mm;margin:0 auto;background:#fff;color:#111}
   #ccMenuPrintPage .cc-print-page{width:100%}
   #ccMenuPrintPage .cc-print-header{text-align:center;margin:0 0 .8em}
   #ccMenuPrintPage .cc-print-header h1{font:700 22px Georgia,serif;margin:0 0 .2em}
   #ccMenuPrintPage .cc-print-header div{font:11px Arial,sans-serif;line-height:1.35;margin:0}
   #ccMenuPrintPage .cc-print-document{font:13px/1.35 Georgia,"Times New Roman",serif}
   #ccMenuPrintPage .cc-print-document h1,#ccMenuPrintPage .cc-print-document h2,#ccMenuPrintPage .cc-print-document h3,#ccMenuPrintPage .cc-print-document h4,#ccMenuPrintPage .cc-print-document h5,#ccMenuPrintPage .cc-print-document h6{margin:0 0 .65em}
   #ccMenuPrintPage .cc-print-document p{margin:0 0 .65em}
   #ccMenuPrintPage .cc-print-document ul,#ccMenuPrintPage .cc-print-document ol{margin:0 0 .65em;padding-left:22px}
   #ccMenuPrintPage .cc-print-document .cc-menu-block{padding:0!important;margin:0 0 .65em!important;min-height:0!important}
   #ccMenuPrintPage .cc-print-document .cc-divider{border-top:1px solid #aaa;height:1px;padding:0!important;margin:.8em 0!important}
 }
 @media print{
   body:not(.cc-menu-printing)>*:not(#ccMenuEditorDialog){display:none!important}
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
async function ccPrompt(message,title='Save As',initialValue=''){
 return new Promise(resolve=>{
  let d=document.querySelector('#ccMenuPromptDialog');
  if(!d){d=document.createElement('dialog');d.id='ccMenuPromptDialog';document.body.appendChild(d)}
  d.innerHTML='<div class="cc-confirm-card"><button class="close" type="button" data-prompt-cancel>×</button><p class="eyebrow">COOKING CONFIDENTIAL</p><h2>'+esc(title)+'</h2><p>'+esc(message)+'</p><label style="text-align:left">Menu name<input id="ccMenuPromptInput" value="'+esc(initialValue)+'" autocomplete="off"></label><div class="cc-confirm-actions"><button type="button" class="secondary" data-prompt-cancel>Cancel</button><button type="button" class="primary" data-prompt-ok>Save copy</button></div></div>';
  const input=d.querySelector('#ccMenuPromptInput');
  const finish=v=>{try{d.close()}catch{};resolve(v)};
  d.querySelectorAll('[data-prompt-cancel]').forEach(b=>b.onclick=()=>finish(null));
  d.querySelector('[data-prompt-ok]').onclick=()=>{const v=String(input.value||'').trim();if(v)finish(v);else input.focus()};
  d.addEventListener('cancel',()=>finish(null),{once:true});
  d.showModal();requestAnimationFrame(()=>{input.focus();input.select()});
 });
}
async function ccConfirm(message,title='Please confirm',confirmLabel='Continue'){
 return new Promise(resolve=>{
  let d=document.querySelector('#ccMenuConfirmDialog');
  if(!d){d=document.createElement('dialog');d.id='ccMenuConfirmDialog';document.body.appendChild(d)}
  d.innerHTML='<div class="cc-confirm-card"><div class="cc-confirm-icon">!</div><p class="eyebrow">COOKING CONFIDENTIAL</p><h2>'+esc(title)+'</h2><p>'+esc(message)+'</p><div class="cc-confirm-actions"><button type="button" class="secondary" data-confirm-cancel>Cancel</button><button type="button" class="primary" data-confirm-ok>'+esc(confirmLabel)+'</button></div></div>';
  const finish=v=>{try{d.close()}catch{};resolve(v)};
  d.querySelector('[data-confirm-cancel]').onclick=()=>finish(false);
  d.querySelector('[data-confirm-ok]').onclick=()=>finish(true);
  d.addEventListener('cancel',()=>finish(false),{once:true});
  d.showModal();
 });
}
async function recipesForLinks(){
 if(recipeCache.size)return [...recipeCache.values()];
 const q=await supabase.from('cc_recipes').select('id,name,cuisine,course,recipe_type').order('name');
 if(!q.error)(q.data||[]).forEach(r=>recipeCache.set(Number(r.id),r));
 return [...recipeCache.values()]
}
let lastEditorBlock=null,lastRange=null;
function getSelectionEditor(){const s=getSelection();const n=s?.anchorNode?.parentElement?.closest?.('.cc-menu-block');return n||lastEditorBlock||null}
function rememberSelection(){const s=getSelection();if(!s?.rangeCount)return;const n=s.anchorNode?.parentElement?.closest?.('.cc-menu-block');if(n){lastEditorBlock=n;lastRange=s.getRangeAt(0).cloneRange()}}
function clearSelection(){try{getSelection()?.removeAllRanges()}catch{}lastEditorBlock=null;lastRange=null}
function restoreSelection(){if(!lastRange)return;const s=getSelection();s.removeAllRanges();s.addRange(lastRange)}
function exec(cmd,value=null){restoreSelection();document.execCommand('styleWithCSS',false,true);document.execCommand(cmd,false,value);rememberSelection()}
function fontSize(value){
 const map={'12px':1,'14px':2,'16px':3,'18px':4,'22px':5,'26px':6,'30px':7};
 exec('fontSize',map[value]||3);
 const ed=getSelectionEditor();if(ed)ed.innerHTML=cleanHtml(ed.innerHTML)
}
function addLink(href,recipeId=null,linkText=''){
 const ed=getSelectionEditor();if(!ed)return window.ccShowError('Place the cursor in a menu line first.','Select menu line');
 restoreSelection();
 const sel=getSelection();
 const selectedText=sel?.toString()||'';
 if(selectedText){
   exec('createLink',href);
 }else if(recipeId&&linkText){
   const range=sel?.rangeCount?sel.getRangeAt(0):null;
   if(!range||!ed.contains(range.commonAncestorContainer))return window.ccShowError('Place the cursor in a menu line first.','Select menu line');
   const a=document.createElement('a');
   a.href=href;a.dataset.recipeId=String(recipeId);a.textContent=linkText;
   range.deleteContents();range.insertNode(a);
   range.setStartAfter(a);range.collapse(true);
   sel.removeAllRanges();sel.addRange(range);
 }else{
   return window.ccShowError('Select the text you want to link first.','Select menu text');
 }
 if(recipeId&&ed){
   ed.querySelectorAll('a').forEach(a=>{
     if(a.getAttribute('href')===('#recipe-'+recipeId)||a.getAttribute('href')?.endsWith('#recipe-'+recipeId))a.dataset.recipeId=String(recipeId)
   })
 }
 if(ed)ed.innerHTML=cleanHtml(ed.innerHTML);
 rememberSelection();
}
async function collectDocument(){
 const blocks=[...document.querySelectorAll('#ccMenuDocument .cc-menu-block')].map(el=>{
   if(el.classList.contains('cc-divider'))return {type:'divider',html:''};
   const clone=el.cloneNode(true);clone.querySelectorAll('.cc-block-controls').forEach(x=>x.remove());
   return {type:'line',html:cleanHtml(clone.innerHTML)}
 }).filter((b,i)=>b.type==='divider'||b.html||i===0);
 return {version:1,blocks}
}
async function printMenuDocument(contentOrMenu){
 let content=null,doc,title,occasion,date;
 if(contentOrMenu?.querySelector){content=contentOrMenu;doc=content.querySelector('#ccMenuDocument');title=esc(content.querySelector('#ccMenuName')?.value||'Menu');occasion=esc(content.querySelector('#ccMenuOccasion')?.value||'');date=esc(content.querySelector('#ccMenuDate')?.value||'');}
 else{const menu=contentOrMenu||{},source=docFromMenu(menu);doc=document.createElement('div');doc.id='ccMenuDocument';doc.className='cc-menu-document';doc.innerHTML=(source.blocks||[]).map(blockMarkup).join('');title=esc(menu.name||'Menu');occasion=esc(menu.occasion||'');date=esc(formatMenuDate(menu.menu_date||''));}
 if(!doc)return; const old=document.querySelector('#ccMenuPrintPage');if(old)old.remove();
 const sheet=document.createElement('div');sheet.id='ccMenuPrintPage';const page=document.createElement('div');page.className='cc-print-page';
 const clone=doc.cloneNode(true);clone.removeAttribute('contenteditable');clone.classList.add('cc-print-document');clone.querySelectorAll('.cc-block-controls').forEach(x=>x.remove());
 page.innerHTML='<div class="cc-print-header"><h1>'+title+'</h1>'+(occasion?'<div>'+occasion+'</div>':'')+(date?'<div>'+date+'</div>':'')+'</div>';page.appendChild(clone);sheet.appendChild(page);document.body.appendChild(sheet);document.body.classList.add('cc-menu-printing');
 const cleanup=()=>{document.body.classList.remove('cc-menu-printing');sheet.remove()};window.addEventListener('afterprint',cleanup,{once:true});setTimeout(()=>window.print(),80);setTimeout(()=>{if(document.body.contains(sheet))cleanup()},10000);
}
async function applyDocxParagraphAlignment(html,arrayBuffer){
  try{
    const mod=await import('https://esm.sh/jszip@3.10.1?bundle');
    const JSZip=mod.default||mod;
    const zip=await JSZip.loadAsync(arrayBuffer);
    const xmlFile=zip.file('word/document.xml');
    if(!xmlFile)return html;
    const xml=await xmlFile.async('string');
    const xmlDoc=new DOMParser().parseFromString(xml,'application/xml');
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs=[...xmlDoc.getElementsByTagNameNS(ns,'p')];
    const alignments=paragraphs.map(p=>{
      const jc=p.getElementsByTagNameNS(ns,'jc')[0];
      const v=jc?.getAttributeNS(ns,'val')||jc?.getAttribute('w:val')||'';
      return ({start:'left',left:'left',center:'center',end:'right',right:'right',both:'justify',distribute:'justify'}[v]||null);
    });
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    const targets=[...doc.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')];
    targets.forEach((el,i)=>{const a=alignments[i];if(a)el.style.textAlign=a});
    return doc.body.innerHTML;
  }catch(e){return html}
}
function blockMarkup(b,i){
 if(b.type==='divider')return '<div class="cc-menu-block cc-divider" data-index="'+i+'" contenteditable="false"><div class="cc-block-controls" contenteditable="false"><button type="button" data-move="-1" title="Move up">↑</button><button type="button" data-move="1" title="Move down">↓</button><button type="button" data-delete="1" title="Delete">×</button></div></div>';
 return '<div class="cc-menu-block" data-index="'+i+'">'+(b.html||'')+'<div class="cc-block-controls"><button type="button" data-move="-1" title="Move up">↑</button><button type="button" data-move="1" title="Move down">↓</button><button type="button" data-delete="1" title="Delete">×</button></div></div>'
}
async function openEditor(menu,{blocks=null,sourceLabel='',newMenu=false}={}){
 styles();const d=ensureDialog();let source=blocks?{version:1,blocks}:docFromMenu(menu);if(!blocks&&menu.id&&!(source.blocks||[]).length){const legacy=await supabase.from('cc_menu_items').select('sort_order,custom_label,section,recipe_id,cc_recipes(id,name)').eq('menu_id',menu.id).order('sort_order');if(!legacy.error&&legacy.data?.length){source={version:1,blocks:legacy.data.map(x=>({type:'line',html:'<a href=\"#recipe-'+x.recipe_id+'\" data-recipe-id=\"'+x.recipe_id+'\">'+esc(x.custom_label||x.cc_recipes?.name||'Recipe')+'</a>'}))}}}const initial=normalizeBlocks(source.blocks||[]);
 const recipes=await recipesForLinks();
 d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" type="button" id="ccMenuEditorClose">×</button><p class="eyebrow">'+(newMenu?'NEW MENU':'MENU EDITOR')+'</p><h2>'+(newMenu?'Create a menu':esc(menu.name||'Edit menu'))+'</h2><div class="cc-menu-meta"><label>Menu name<input id="ccMenuName" value="'+esc(menu.name||'')+'" required></label><label>Date<input id="ccMenuDate" type="text" inputmode="numeric" maxlength="10" placeholder="DD-MM-YYYY" value="'+esc(formatMenuDate(menu.menu_date||''))+'"></label><label>Guests<input id="ccMenuGuests" type="number" min="1" value="'+esc(menu.guest_count??'')+'"></label></div><label>Occasion<input id="ccMenuOccasion" value="'+esc(menu.occasion||'')+'"></label><div class="cc-menu-toolbar"><div class="cc-menu-toolrow"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><select id="ccMenuFont" title="Font"><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Verdana">Verdana</option></select><select id="ccMenuSize" title="Font size"><option value="12px">Small</option><option value="14px">14</option><option value="16px" selected>Normal</option><option value="18px">Large</option><option value="22px">Extra large</option><option value="30px">Title</option></select><button type="button" data-block-style="normal">Normal</button><button type="button" data-block-style="heading">Heading</button><button type="button" data-block-style="subheading">Subheading</button><button type="button" class="cc-menu-align" data-align="left" title="Align left">L</button><button type="button" class="cc-menu-align" data-align="center" title="Align center">C</button><button type="button" class="cc-menu-align" data-align="right" title="Align right">R</button><button type="button" id="ccMenuBullet">• List</button><button type="button" id="ccMenuNumber">1. List</button><button type="button" id="ccMenuDivider">Divider</button><button type="button" id="ccMenuAddLine">＋ Line</button></div><div class="cc-menu-linkrow"><select id="ccMenuRecipeLink"><option value="">Link selected text to a recipe…</option>'+recipes.map(r=>'<option value="'+r.id+'">'+esc(r.name)+'</option>').join('')+'</select><button type="button" id="ccMenuApplyRecipeLink">Link recipe</button><input id="ccMenuUrl" type="url" placeholder="https:// external link"><button type="button" id="ccMenuApplyUrl">Link URL</button><button type="button" class="secondary cc-menu-clear-selection" id="ccMenuClearSelection">Clear selection</button></div></div><div id="ccMenuDocument" class="cc-menu-document" contenteditable="true" spellcheck="true">'+initial.map(blockMarkup).join('')+'</div><div class="cc-menu-actions-grid"><button class="secondary" type="button" id="ccMenuShowOriginal">Show Original</button><button class="secondary" type="button" id="ccMenuSaveAs">Save As</button><button class="secondary danger" type="button" id="ccMenuDelete" '+(newMenu?'disabled':'')+'>Delete</button><button class="primary" type="button" id="ccMenuSave">Save</button></div>';
 d.showModal();
 const content=d.querySelector('#ccMenuEditorContent');
 requestAnimationFrame(()=>{d.scrollTop=0;content.scrollTop=0;});
 lastEditorBlock=null;lastRange=null;
 content.querySelector('#ccMenuDocument').addEventListener('mouseup',rememberSelection);
 content.querySelector('#ccMenuDocument').addEventListener('keyup',rememberSelection);
 content.querySelector('#ccMenuDocument').addEventListener('focusin',e=>{const b=e.target.closest('.cc-menu-block');if(b)lastEditorBlock=b;});
 const selectionListener=()=>rememberSelection();document.addEventListener('selectionchange',selectionListener);d.addEventListener('close',()=>document.removeEventListener('selectionchange',selectionListener),{once:true});
 const dateInput=content.querySelector('#ccMenuDate');
dateInput.addEventListener('input',e=>{const digits=Array.from(e.target.value).filter(ch=>ch>='0'&&ch<='9').slice(0,8).join('');e.target.value=digits.length<=2?digits:digits.length<=4?digits.slice(0,2)+'-'+digits.slice(2):digits.slice(0,2)+'-'+digits.slice(2,4)+'-'+digits.slice(4)});
content.querySelector('#ccMenuClearSelection').onclick=()=>clearSelection();
content.querySelector('#ccMenuDocument').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();clearSelection()}});
content.querySelector('#ccMenuDocument').addEventListener('click',e=>{if(e.target===e.currentTarget)clearSelection()});
content.querySelector('#ccMenuEditorClose').onclick=()=>d.close();
 const reviewOriginal=content.querySelector('#ccMenuReviewOriginal');if(reviewOriginal)reviewOriginal.onclick=e=>{e.preventDefault();showOriginal(menu)};
 content.querySelectorAll('[data-cmd]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const ed=getSelectionEditor();if(!ed)return;ed.focus();exec(b.dataset.cmd)}});
 content.querySelector('#ccMenuFont').onmousedown=e=>e.preventDefault();content.querySelector('#ccMenuFont').onchange=e=>{const ed=getSelectionEditor();if(ed){ed.focus();exec('fontName',e.target.value)}};
 content.querySelector('#ccMenuSize').onmousedown=e=>e.preventDefault();content.querySelector('#ccMenuSize').onchange=e=>{const ed=getSelectionEditor();if(ed){ed.focus();fontSize(e.target.value)}};
 content.querySelectorAll('[data-block-style]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{
 const ed=getSelectionEditor();if(!ed)return;ed.focus();restoreSelection();
 const kind=b.dataset.blockStyle;
 const sel=getSelection();const node=sel?.anchorNode?.nodeType===1?sel.anchorNode:sel?.anchorNode?.parentElement;
 const block=node?.closest?.('.cc-menu-block')||ed;
 const current=block.querySelector('h1,h2,h3,h4,h5,h6');
 let tag='DIV';
 if(kind==='heading')tag=current?.tagName==='H3'?'DIV':'H3';
 else if(kind==='subheading')tag=current?.tagName==='H4'?'DIV':'H4';
 document.execCommand('formatBlock',false,tag);rememberSelection()
}});
content.querySelectorAll('[data-align]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const ed=getSelectionEditor();if(!ed)return;ed.focus();exec(b.dataset.align==='center'?'justifyCenter':b.dataset.align==='right'?'justifyRight':'justifyLeft')}});
 content.querySelector('#ccMenuBullet').onmousedown=e=>e.preventDefault();content.querySelector('#ccMenuBullet').onclick=()=>exec('insertUnorderedList');
 content.querySelector('#ccMenuNumber').onmousedown=e=>e.preventDefault();content.querySelector('#ccMenuNumber').onclick=()=>exec('insertOrderedList');
 content.querySelector('#ccMenuDivider').onclick=()=>{const doc=d.querySelector('#ccMenuDocument');doc.insertAdjacentHTML('beforeend','<div class="cc-menu-block cc-divider" contenteditable="false"><div class="cc-block-controls"><button type="button" data-move="-1">↑</button><button type="button" data-move="1">↓</button><button type="button" data-delete="1">×</button></div></div>')};
 content.querySelector('#ccMenuAddLine').onclick=()=>{
 const doc=d.querySelector('#ccMenuDocument');if(!doc)return;
 restoreSelection();
 const s=getSelection(),range=s?.rangeCount?s.getRangeAt(0):null;
 const current=range?.commonAncestorContainer?.nodeType===1?range.commonAncestorContainer:range?.commonAncestorContainer?.parentElement;
 const block=current?.closest?.('.cc-menu-block')||lastEditorBlock||doc.lastElementChild;
 const line=document.createElement('div');line.className='cc-menu-block';line.innerHTML='<br><div class="cc-block-controls"><button type="button" data-move="-1">↑</button><button type="button" data-move="1">↓</button><button type="button" data-delete="1">×</button></div>';
 if(block&&block.parentNode===doc)block.after(line);else doc.appendChild(line);
 const editRange=document.createRange();editRange.selectNodeContents(line);editRange.collapse(true);s?.removeAllRanges();s?.addRange(editRange);lastEditorBlock=line;lastRange=editRange.cloneRange();line.focus();
};
 content.querySelector('#ccMenuApplyRecipeLink').onclick=()=>{const id=content.querySelector('#ccMenuRecipeLink').value;if(!id)return;const r=recipes.find(x=>String(x.id)===String(id));if(!r)return;addLink('#recipe-'+id,id,r.name)};
 content.querySelector('#ccMenuApplyUrl').onclick=()=>{const u=content.querySelector('#ccMenuUrl').value.trim();if(/^https?:\/\//i.test(u))addLink(u)};
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
   const payload={name,menu_date:(()=>{const raw=content.querySelector('#ccMenuDate').value.trim();if(!raw)return null;const iso=parseMenuDate(raw);if(!iso){window.ccShowError('Please enter the date as DD-MM-YYYY.','Invalid date');throw new Error('Invalid menu date')}return iso})(),guest_count:content.querySelector('#ccMenuGuests').value?Number(content.querySelector('#ccMenuGuests').value):null,occasion:String(content.querySelector('#ccMenuOccasion').value||'').trim()||null,content:JSON.stringify(documentData),document:documentData,visibility:'private',created_by:user.id,status:menu.status==='draft'?'published':'published'};
   if(!asNew&&menu.id)payload.id=menu.id;
   if(menu.original_file_path){payload.original_file_path=menu.original_file_path;payload.original_file_name=menu.original_file_name;payload.original_mime_type=menu.original_mime_type}
   const q=asNew||!menu.id?await supabase.from('cc_menus').insert(payload).select().single():await supabase.from('cc_menus').update(payload).eq('id',menu.id).select().single();
   if(q.error)return window.ccShowError(q.error.message,asNew?'Could not save menu as new':'Could not save menu');
   d.close();if(typeof window.ccReloadMenus==='function')await window.ccReloadMenus();
 };
 content.querySelector('#ccMenuSave').onclick=()=>save(false);
 content.querySelector('#ccMenuSaveAs').onclick=async()=>{
   const base=String(content.querySelector('#ccMenuName').value||menu.name||'Menu').trim()||'Menu';
   const name=await ccPrompt('Enter a name for the copy. Your current edits will be saved into the new menu.', 'Save menu as', base+' — Copy');
   if(!name)return;
   content.querySelector('#ccMenuName').value=name;
   await save(true);
 };
 
 content.querySelector('#ccMenuDelete').onclick=async()=>{if(!menu.id||!(await ccConfirm('Delete this menu permanently?','Delete menu','Delete')))return;const q=await supabase.from('cc_menus').delete().eq('id',menu.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete menu');d.close();await window.ccReloadMenus?.()};
 content.querySelector('#ccMenuShowOriginal').onclick=()=>showOriginal(menu);
}
async function openRecipe(id){const q=await supabase.from('cc_recipes').select('id,name,description,ingredients,method').eq('id',id).single();if(q.error)return window.ccShowError(q.error.message,'Could not open recipe');const d=ensureDialog();d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccRecipeBack">×</button><p class="eyebrow">RECIPE LINK</p><h2>'+esc(q.data.name)+'</h2><div class="cc-menu-original-note">This menu item is linked to the Cooking Confidential recipe.</div><div class="detail-section"><h4>Ingredients</h4><div>'+esc(Array.isArray(q.data.ingredients)?q.data.ingredients.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join('\\n'):String(q.data.ingredients||''))+'</div></div><div class="detail-section"><h4>Method</h4><div>'+cleanHtml(q.data.method||'')+'</div></div>';d.showModal();d.querySelector('#ccRecipeBack').onclick=()=>d.close()}
async function showOriginal(menu){
 if(!menu.original_file_path)return window.ccShowError('No original upload is attached to this menu.','Original unavailable');
 const name=menu.original_file_name||'Original menu';let url;try{const q=await supabase.storage.from('cooking-confidential').createSignedUrl(menu.original_file_path,900);if(q.error||!q.data?.signedUrl)throw Error(q.error?.message||'Could not open original file');url=q.data.signedUrl}catch(e){return window.ccShowError(e.message,'Could not open original menu')}
 const lower=name.toLowerCase(),d=ensureDialog();
 if(lower.endsWith('.docx')){
   try{
     const blob=await fetch(url).then(r=>r.blob());
     const bytes=await blob.arrayBuffer();
     d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged. This preview uses the Word document layout rather than the editable menu representation.</p><div class="cc-menu-original-viewer" id="ccDocxOriginalViewer"><p class="small-note">Loading original document…</p></div><div id="ccDocxOriginalStyles" hidden></div><div class="cc-menu-original-actions"><a class="secondary" href="'+esc(url)+'" target="_blank" rel="noopener">Open original file</a></div>';
     if(!d.open)d.showModal();
     const viewer=d.querySelector('#ccDocxOriginalViewer');
     try{
       const mod=await import('https://esm.sh/docx-preview@0.4.1?bundle');
       await mod.renderAsync(bytes,viewer,d.querySelector('#ccDocxOriginalStyles'),{className:'ccDocx',inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false});
     }catch(previewError){
       viewer.innerHTML='<p class="small-note">The in-app Word preview could not be rendered. Use <strong>Open original file</strong> above to view the unchanged document.</p>';
     }
     d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);
     return;
   }catch(e){return window.ccShowError(e.message||'Could not render the original DOCX.','Could not open original menu')}
 }
 if(/\\.(png|jpe?g|webp|gif)$/i.test(name)){d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><div class="original-viewer"><img class="original-image" src="'+esc(url)+'" alt="Original menu"></div>';if(!d.open)d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);return}
 if(lower.endsWith('.pdf')){d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><iframe class="original-pdf" title="Original menu PDF" src="'+esc(url)+'"></iframe>';if(!d.open)d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu);return}
 d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" id="ccOriginalBack">×</button><p class="eyebrow">ORIGINAL MENU</p><h2>'+esc(name)+'</h2><p class="small-note">Original uploaded file — retained unchanged.</p><p><a class="primary" href="'+esc(url)+'" target="_blank" rel="noopener">Open original file</a></p>';d.showModal();d.querySelector('#ccOriginalBack').onclick=()=>openEditor(menu)
}
async function shareMenu(menu,content=null){
 const doc=content?.querySelector ? await collectDocument() : docFromMenu(menu);
 const text=doc.blocks.map(b=>b.type==='divider'?'---':String(b.html||'').replace(/<[^>]+>/g,' ')).join('\\n');
 try{if(navigator.share){await navigator.share({title:menu.name||'Cooking Confidential menu',text});return}await navigator.clipboard.writeText(text);window.ccShowError('Menu text copied to the clipboard.','Share menu')}catch(e){if(e.name!=='AbortError')window.ccShowError(e.message||'Could not share menu.','Could not share menu')}
}
async function extractMenu(file){
 const name=file.name||'Imported menu';const lower=name.toLowerCase();
 if(lower.endsWith('.docx')){
   const bytes=await file.arrayBuffer();
   const out=await mammoth.convertToHtml({arrayBuffer:bytes});
   const html=await applyDocxParagraphAlignment(out.value,bytes);
   return htmlToBlocks(html)
 }
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
 const d=ensureDialog();styles();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return window.ccShowError('Please sign in again.','Sign-in required');
 const renderUploadLibrary=async()=>{
   const pending=await supabase.from('cc_menus').select('id,name,created_at,original_file_path,original_file_name,original_mime_type,status,document,content,menu_date,guest_count,occasion,is_favourite').not('original_file_path','is',null).eq('status','draft').order('created_at',{ascending:false});
   const rows=pending.error?[]:(pending.data||[]);
   const htmlRows=rows.length?rows.map(m=>'<div class="cc-menu-upload-item"><div><strong>'+esc(m.name||m.original_file_name||'Untitled menu')+'</strong><div class="meta">'+esc(m.original_file_name||'Original file')+(m.created_at?' · '+new Date(m.created_at).toLocaleDateString():'')+'</div></div><div class="cc-menu-upload-actions"><button type="button" class="primary-action" data-upload-review="'+m.id+'">Review</button><button type="button" data-upload-delete="'+m.id+'">Delete</button></div></div>').join(''):'<div class="empty compact">No uploaded menus yet.</div>';
   d.querySelector('#ccMenuEditorContent').innerHTML='<button class="close" type="button" id="ccMenuUploadClose">×</button><p class="eyebrow">UPLOAD MENU</p><h2>Uploaded Menus</h2><p class="small-note">Choose a menu file to add it to your library. The original file is retained unchanged. After upload, use <strong>Review</strong> to open it in the menu editor.</p><div class="cc-menu-upload-note"><label class="primary" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;padding:10px 14px;border-radius:8px">＋ Choose menu file<input id="ccMenuUploadFile" type="file" multiple accept=".docx,.pdf,.txt,.png,.jpg,.jpeg,.webp" style="display:none"></label><span id="ccMenuUploadStatus" class="small-note" style="margin-left:14px"></span></div><h3 style="margin-top:36px;padding-top:8px">Previously uploaded menus</h3><div class="cc-menu-upload-list" id="ccMenuUploadList">'+htmlRows+'</div>';
   d.showModal();
   d.querySelector('#ccMenuUploadClose').onclick=()=>d.close();
   d.querySelector('#ccMenuUploadFile').onchange=async e=>{
     const files=[...e.target.files||[]];if(!files.length)return;
     const status=d.querySelector('#ccMenuUploadStatus');status.textContent='Uploading…';
     for(const file of files){
       const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
       const path='menu-originals/'+user.id+'/'+Date.now()+'-'+safeName;
       const up=await supabase.storage.from('cooking-confidential').upload(path,file,{contentType:file.type||'application/octet-stream',cacheControl:'86400',upsert:false});
       if(up.error){status.textContent=up.error.message;continue}
       let blocks;try{blocks=await extractMenu(file)}catch(err){await supabase.storage.from('cooking-confidential').remove([path]);status.textContent=err.message;continue}
       const documentData={version:1,blocks};
       const payload={name:file.name.replace(/\.[^.]+$/,''),menu_date:null,guest_count:null,occasion:null,content:JSON.stringify(documentData),document:documentData,original_file_path:path,original_file_name:file.name,original_mime_type:file.type||null,is_favourite:false,visibility:'private',created_by:user.id,status:'draft'};
       const ins=await supabase.from('cc_menus').insert(payload);
       if(ins.error){await supabase.storage.from('cooking-confidential').remove([path]);status.textContent='Could not save '+file.name+': '+ins.error.message;continue}
     }
     status.textContent='Upload complete.';
     await window.ccReloadMenus?.();
     await renderUploadLibrary();
   };
   d.querySelectorAll('[data-upload-review]').forEach(b=>b.onclick=async()=>{const q=await supabase.from('cc_menus').select('*').eq('id',Number(b.dataset.uploadReview)).single();const m=q.data;if(m){d.close();await openEditor(m,{sourceLabel:m.original_file_name||''})}});
   d.querySelectorAll('[data-upload-delete]').forEach(b=>b.onclick=async()=>{const q0=await supabase.from('cc_menus').select('id,original_file_path').eq('id',Number(b.dataset.uploadDelete)).single();const m=q0.data;if(!m||!(await ccConfirm('Delete this uploaded menu?','Delete uploaded menu','Delete')))return;if(m.original_file_path)await supabase.storage.from('cooking-confidential').remove([m.original_file_path]);const q=await supabase.from('cc_menus').delete().eq('id',m.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete menu');await window.ccReloadMenus?.();renderUploadLibrary()});
 };
 renderUploadLibrary();
}
function newBlank(){openEditor({name:'',menu_date:'',guest_count:null,occasion:'',document:{version:1,blocks:[{type:'line',html:''}]},is_favourite:false},{newMenu:true})}
function menuActions(){
 document.querySelectorAll('[data-menu-action]').forEach(b=>{if(b.dataset.ccBound)return;b.dataset.ccBound='1';b.onclick=async e=>{e.preventDefault();e.stopPropagation();const id=Number(b.dataset.id);const m=(window.ccMenus||[]).find(x=>Number(x.id)===id);if(!m)return;if(b.dataset.menuAction==='open'||b.dataset.menuAction==='edit')return openEditor(m);if(b.dataset.menuAction==='original')return showOriginal(m);if(b.dataset.menuAction==='print')return window.ccMenuEditor?.printMenu?.(m);if(b.dataset.menuAction==='share')return window.ccMenuEditor?.shareMenu?.(m);if(b.dataset.menuAction==='saveas')return openEditor(m).then(()=>setTimeout(()=>document.querySelector('#ccMenuSaveAs')?.click(),100));if(b.dataset.menuAction==='fav'){const q=await supabase.from('cc_menus').update({is_favourite:!m.is_favourite}).eq('id',m.id);if(q.error)return window.ccShowError(q.error.message,'Could not update favourite');m.is_favourite=!m.is_favourite;window.ccRenderMenus?.();}if(b.dataset.menuAction==='delete'){if(!confirm('Delete this menu permanently?'))return;const q=await supabase.from('cc_menus').delete().eq('id',m.id);if(q.error)return window.ccShowError(q.error.message,'Could not delete menu');await window.ccReloadMenus?.()}}})
}
function enhance(){
 styles();
 menuActions()
}
window.ccMenuEditor={openEditor,uploadExisting,newBlank,showOriginal,printMenu:async menu=>printMenuDocument(menu),shareMenu:async menu=>shareMenu(menu)};
const obs=new MutationObserver(()=>enhance());obs.observe(document.body,{subtree:true,childList:true});enhance();
