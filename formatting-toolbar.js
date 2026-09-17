// Phase 1A: small reusable formatting toolbar for editable rich-text fields.
// Stores simple HTML in the field so the same foundation can later be used by Menus.
export function attachFormattingToolbar(textarea){
  if(!textarea || textarea.dataset.ccFormatting==='1') return;
  textarea.dataset.ccFormatting='1';
  const wrap=document.createElement('div');
  wrap.className='cc-format-wrap';
  const toolbar=document.createElement('div');
  toolbar.className='cc-format-toolbar';
  toolbar.setAttribute('role','toolbar');
  const buttons=[
    ['bold','B','Bold'],['italic','I','Italic'],['underline','U','Underline'],
    ['insertUnorderedList','•','Bulleted list'],['insertOrderedList','1.','Numbered list']
  ];
  buttons.forEach(([cmd,label,title])=>{
    const b=document.createElement('button');
    b.type='button'; b.className='cc-format-btn'; b.textContent=label; b.title=title; b.setAttribute('aria-label',title);
    if(cmd==='bold')b.style.fontWeight='700';
    if(cmd==='italic')b.style.fontStyle='italic';
    if(cmd==='underline')b.style.textDecoration='underline';
    b.onclick=()=>{
      textarea.focus();
      document.execCommand(cmd,false,null);
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    };
    toolbar.appendChild(b);
  });
  const editor=document.createElement('div');
  editor.className='cc-rich-editor';
  editor.contentEditable='true';
  editor.innerHTML=textarea.value||'';
  editor.dataset.placeholder=textarea.getAttribute('placeholder')||'';
  editor.addEventListener('input',()=>{textarea.value=editor.innerHTML;});
  editor.addEventListener('blur',()=>{textarea.value=editor.innerHTML;});
  textarea.style.display='none';
  textarea.parentNode.insertBefore(wrap,textarea);
  wrap.append(toolbar,editor);
  textarea._ccRichEditor=editor;
  textarea._ccSyncRich=()=>{editor.innerHTML=textarea.value||'';};
}

export function syncFormattingFields(form){
  form?.querySelectorAll('textarea[data-cc-format="1"]').forEach(t=>{if(t._ccRichEditor)t.value=t._ccRichEditor.innerHTML;});
}
