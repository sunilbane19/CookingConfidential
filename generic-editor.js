const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

function fieldMarkup(f){
  const value=String(f.value??'');
  const required=f.required?' required':'';
  const cls=f.className?` class="${esc(f.className)}"`:'';
  if(f.type==='textarea')return `<label${cls}>${esc(f.label)}<textarea name="${esc(f.name)}" rows="${f.rows||6}"${required}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}>${esc(value)}</textarea></label>`;
  if(f.type==='select'){
    const options=Array.isArray(f.options)?f.options:[];
    const known=options.includes(value);
    const custom=f.allowCustom&&value&&!known;
    return `<label${cls}>${esc(f.label)}<select name="${esc(f.name)}">${options.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o||'Select…')}</option>`).join('')}${f.allowCustom?`<option value="__custom__" ${custom?'selected':''}>Other / custom…</option>`:''}</select>${f.allowCustom?`<input name="${esc(f.name)}_custom" placeholder="Enter category" style="display:${custom?'block':'none'};margin-top:8px" value="${custom?esc(value):''}">`:''}</label>`;
  }
  return `<label${cls}><${f.type==='number'?'span':'span'}>${esc(f.label)}</span><input name="${esc(f.name)}" type="${esc(f.type||'text')}" value="${esc(value)}"${required}${f.placeholder?` placeholder="${esc(f.placeholder)}"`:''}></label>`;
}

function groupMarkup(group){
  return `<div class="two-col">${group.map(fieldMarkup).join('')}</div>`;
}

export function createGenericEditor({dialog, eyebrow='EDIT', title='Edit', sourceHtml='', fields=[], actions={}, onSave}){
  if(!dialog)throw new Error('Editor dialog not found');
  const content=dialog.querySelector('#detailContent');
  const body=[];
  fields.forEach(f=>body.push(f.group?groupMarkup(f.group):fieldMarkup(f)));
  content.innerHTML=`<button class="close" type="button" id="ccGenericEditorClose">×</button><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2>${sourceHtml||''}<form id="ccGenericEditorForm">${body.join('')}<div class="detail-actions"><button class="secondary" type="button" id="ccGenericEditorCancel">${esc(actions.cancelLabel||'Cancel')}</button>${actions.delete?`<button class="secondary" type="button" id="ccGenericEditorDelete">${esc(actions.deleteLabel||'Delete')}</button>`:''}<button class="primary" type="submit">${esc(actions.saveLabel||'Save changes')}</button></div></form>`;
  content.scrollTop=0;
  dialog.showModal();
  content.scrollTop=0;
  const form=content.querySelector('#ccGenericEditorForm');
  const close=()=>dialog.close();
  content.querySelector('#ccGenericEditorClose').onclick=close;
  content.querySelector('#ccGenericEditorCancel').onclick=close;
  if(actions.delete&&actions.onDelete)content.querySelector('#ccGenericEditorDelete').onclick=()=>actions.onDelete();
  content.querySelectorAll('select').forEach(sel=>{
    const custom=form.querySelector(`[name="${sel.name}_custom"]`);if(!custom)return;
    const sync=()=>{custom.style.display=sel.value==='__custom__'?'block':'none';if(sel.value!=='__custom__')custom.value=''};
    sel.addEventListener('change',sync);sync();
  });
  form.onsubmit=async e=>{e.preventDefault();await onSave(new FormData(form),form)};
  return {form,close};
}

export const editorValue=(formData,name,allowCustom=false)=>{const v=String(formData.get(name)||'').trim();return allowCustom&&v==='__custom__'?String(formData.get(`${name}_custom`)||'').trim():v};
