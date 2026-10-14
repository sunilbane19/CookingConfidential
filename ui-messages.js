/* Cooking Confidential — shared branded messages and confirmations. */
(function(){
  if(window.ccShowMessage)return;
  const css=`
  #ccGlobalMessageDialog{border:0;border-radius:18px;padding:0;background:transparent;max-width:min(480px,92vw);width:100%;box-shadow:0 18px 60px rgba(30,20,10,.22)}
  #ccGlobalMessageDialog::backdrop{background:rgba(20,18,14,.48)}
  #ccGlobalMessageDialog .dialog-card{padding:28px 30px;border:1px solid var(--line,#ddd6ca);border-radius:18px;background:var(--card,#fffdf9);color:var(--ink,#24231f)}
  #ccGlobalMessageDialog .cc-message-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;margin:0 0 14px;background:var(--paper,#f6f1e8);color:var(--accent,#9b3f2f);font:700 20px Arial}
  #ccGlobalMessageDialog[data-kind="success"] .cc-message-icon{color:#2f6b35;background:#e8f4e9}
  #ccGlobalMessageDialog h2{font:400 27px/1.15 Georgia,"Times New Roman",serif;margin:0 0 12px}
  #ccGlobalMessageDialog .cc-message-copy{font:15px/1.55 Arial,sans-serif;color:var(--muted,#77736a);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
  #ccGlobalMessageDialog .cc-message-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}
  #ccGlobalMessageDialog .cc-message-actions button{min-height:42px}
  #ccGlobalMessageDialog .cc-message-danger{background:var(--accent,#9b3f2f);color:#fff}
  @media(max-width:520px){#ccGlobalMessageDialog .dialog-card{padding:23px 20px}#ccGlobalMessageDialog h2{font-size:24px}}
  `;
  function ensureDialog(){
    let d=document.getElementById('ccGlobalMessageDialog');
    if(d)return d;
    if(!document.getElementById('ccGlobalMessageStyles')){const style=document.createElement('style');style.id='ccGlobalMessageStyles';style.textContent=css;document.head.appendChild(style)}
    d=document.createElement('dialog');d.id='ccGlobalMessageDialog';d.setAttribute('aria-labelledby','ccGlobalMessageTitle');
    d.innerHTML='<div class="dialog-card"><div class="cc-message-icon" aria-hidden="true">✓</div><p class="eyebrow">COOKING CONFIDENTIAL</p><h2 id="ccGlobalMessageTitle"></h2><p class="cc-message-copy"></p><div class="cc-message-actions"></div></div>';
    document.body.appendChild(d);return d;
  }
  function show(message,title='Notice',kind='info',confirmMode=false,options={}){
    const d=ensureDialog();
    if(d.open)d.close('superseded');
    d.dataset.kind=kind;
    d.querySelector('.cc-message-icon').textContent=kind==='success'?'✓':kind==='error'?'!':confirmMode?'?':'i';
    d.querySelector('.eyebrow').textContent=kind==='success'?'COOKING CONFIDENTIAL · SUCCESS':kind==='error'?'COOKING CONFIDENTIAL · ERROR':confirmMode?'COOKING CONFIDENTIAL · CONFIRMATION':'COOKING CONFIDENTIAL';
    d.querySelector('h2').textContent=title;
    d.querySelector('.cc-message-copy').textContent=String(message??'');
    const actions=d.querySelector('.cc-message-actions');actions.replaceChildren();
    let resolvePromise;
    const promise=confirmMode?new Promise(resolve=>{resolvePromise=resolve}):null;
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;try{d.close()}catch{};if(confirmMode)resolvePromise(value)};
    if(confirmMode){
      const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent=options.cancelLabel||'Cancel';cancel.onclick=()=>finish(false);actions.appendChild(cancel);
      const ok=document.createElement('button');ok.type='button';ok.className=options.danger?'primary cc-message-danger':'primary';ok.textContent=options.confirmLabel||'Continue';ok.onclick=()=>finish(true);actions.appendChild(ok);
      d.oncancel=e=>{e.preventDefault();finish(false)};
      d.addEventListener('close',()=>{if(!settled)finish(false)},{once:true});
      d.showModal();ok.focus();return promise;
    }
    const ok=document.createElement('button');ok.type='button';ok.className='primary';ok.textContent=options.okLabel||'OK';ok.onclick=()=>finish(true);actions.appendChild(ok);
    d.oncancel=e=>{e.preventDefault();finish(true)};
    d.addEventListener('close',()=>{if(!settled)finish(true)},{once:true});
    d.showModal();ok.focus();return undefined;
  }
  window.ccShowMessage=(message,title='Notice',kind='info',options={})=>show(message,title,kind,false,options);
  window.ccShowError=(message,title='Something went wrong')=>show(message,title,'error');
  window.ccConfirm=(message,title='Please confirm',options={})=>show(message,title,'info',true,options);
  const nativeAlert=window.alert?.bind(window);
  window.alert=function(message){try{return window.ccShowMessage(String(message??''),'Please note',/\b(sent|success|saved|added|activated|deactivated|complete|created)\b/i.test(String(message??''))?'success':'error')}catch(e){return nativeAlert?.(message)}};
})();
