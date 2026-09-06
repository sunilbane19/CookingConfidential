// Cooking Confidential import UI polish
// Keeps upload/extraction state visible and provides an iOS/Gmail-safe upload action.
(function(){
  const STYLE_ID='ccImportUiFixStyles';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #importQueue .queue-head{align-items:center;gap:12px;flex-wrap:wrap}
      #importQueue .queue-head strong{flex:1;min-width:110px}
      #importQueue .queue-item,#importQueue .review-item{display:flex;align-items:flex-start;gap:14px;width:100%;box-sizing:border-box}
      #importQueue .queue-item > div,#importQueue .review-item > div:first-child{min-width:0;flex:1}
      #importQueue .queue-item strong,#importQueue .review-item strong{display:block;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}
      #importQueue .queue-item small,#importQueue .review-item small{display:block;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}
      #importQueue .queue-item > span{flex:0 0 auto;white-space:nowrap}
      #importQueue .review-item > button{flex:0 0 auto}
      #importQueue #uploadAll{touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:relative;z-index:20}
      .cc-import-progress{display:flex;align-items:flex-start;gap:10px;margin:14px 0 4px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#f8f5ee;font:14px/1.4 Arial;color:var(--ink)}
      .cc-import-progress[hidden]{display:none}
      .cc-import-spinner{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ccImportSpin .8s linear infinite;flex:none;margin-top:2px}
      @keyframes ccImportSpin{to{transform:rotate(360deg)}}
      @media(max-width:760px){#importQueue .queue-item,#importQueue .review-item{gap:10px}#importQueue .queue-item > span{white-space:normal;text-align:right}}
    `;
    document.head.appendChild(s);
  }

  function progressBox(){
    const q=document.querySelector('#importQueue');
    if(!q)return null;
    let box=q.querySelector('.cc-import-progress');
    if(!box){
      box=document.createElement('div');box.className='cc-import-progress';box.hidden=true;
      box.innerHTML='<span class="cc-import-spinner" aria-hidden="true"></span><span class="cc-import-progress-text"></span>';
      q.prepend(box);
    }
    return box;
  }

  function updateProgress(){
    const q=document.querySelector('#importQueue');
    if(!q)return;
    const box=progressBox();if(!box)return;
    const text=(q.textContent||'').toLowerCase();
    const active=/uploading|queued for extraction|extracting/.test(text);
    box.hidden=!active;
    const target=box.querySelector('.cc-import-progress-text');
    if(target)target.textContent=active?'Upload in progress — your recipe is being extracted. You can continue once the status changes to “Queued for extraction”.':'';
  }

  function bindUploadButton(){
    const b=document.querySelector('#uploadAll');
    if(!b || b.dataset.ccUploadFix==='1')return;
    b.dataset.ccUploadFix='1';b.type='button';

    // iOS/Gmail in-app browsers may not reliably synthesize a click from a
    // touch on a dynamically-created dialog button. Use touchend as a narrow,
    // button-specific fallback. The existing onclick remains the single upload
    // implementation, so this cannot create a second upload path.
    b.addEventListener('touchend',event=>{
      if(event.defaultPrevented)return;
      if(typeof b.onclick!=='function')return;
      if(b.dataset.ccTouchHandled==='1')return;
      b.dataset.ccTouchHandled='1';
      event.preventDefault();
      event.stopPropagation();
      b.onclick.call(b,event);
      setTimeout(()=>delete b.dataset.ccTouchHandled,1000);
    },{passive:false});

    document.addEventListener('click',event=>{
      const target=event.target.closest?.('#uploadAll');
      if(target?.dataset.ccTouchHandled==='1'){
        event.preventDefault();
        event.stopImmediatePropagation();
        delete target.dataset.ccTouchHandled;
      }
    },true);
  }

  function observeQueue(){
    const q=document.querySelector('#importQueue');
    if(!q || q.dataset.ccUiObserved==='1')return;
    q.dataset.ccUiObserved='1';
    const observer=new MutationObserver(()=>{bindUploadButton();updateProgress();});
    observer.observe(q,{subtree:true,childList:true,characterData:true});
    bindUploadButton();updateProgress();
  }

  installStyles();
  const bodyObserver=new MutationObserver(()=>{installStyles();observeQueue();bindUploadButton();updateProgress();});
  bodyObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
  observeQueue();
})();