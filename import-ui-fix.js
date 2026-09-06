// Cooking Confidential import UI polish
// Keeps the upload/extraction state visible and makes long filenames wrap cleanly.
(function(){
  const STYLE_ID='ccImportUiFixStyles';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #importQueue .queue-head{align-items:center;gap:12px;flex-wrap:wrap}
      #importQueue .queue-head strong{flex:1;min-width:110px}
      #importQueue .queue-item,
      #importQueue .review-item{display:flex;align-items:flex-start;gap:14px;width:100%;box-sizing:border-box}
      #importQueue .queue-item > div,
      #importQueue .review-item > div:first-child{min-width:0;flex:1}
      #importQueue .queue-item strong,
      #importQueue .review-item strong{display:block;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}
      #importQueue .queue-item small,
      #importQueue .review-item small{display:block;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}
      #importQueue .queue-item > span{flex:0 0 auto;white-space:nowrap}
      #importQueue .review-item > button{flex:0 0 auto}
      .cc-import-progress{display:flex;align-items:flex-start;gap:10px;margin:14px 0 4px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#f8f5ee;font:14px/1.4 Arial;color:var(--ink)}
      .cc-import-progress[hidden]{display:none}
      .cc-import-spinner{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ccImportSpin .8s linear infinite;flex:none;margin-top:2px}
      @keyframes ccImportSpin{to{transform:rotate(360deg)}}
      @media(max-width:760px){
        #importQueue .queue-item,#importQueue .review-item{gap:10px}
        #importQueue .queue-item > span{white-space:normal;text-align:right}
      }
    `;
    document.head.appendChild(s);
  }

  function progressBox(){
    const q=document.querySelector('#importQueue');
    if(!q) return null;
    let box=q.querySelector('.cc-import-progress');
    if(!box){
      box=document.createElement('div');
      box.className='cc-import-progress';
      box.hidden=true;
      box.innerHTML='<span class="cc-import-spinner" aria-hidden="true"></span><span class="cc-import-progress-text"></span>';
      q.prepend(box);
    }
    return box;
  }

  function updateProgress(){
    const q=document.querySelector('#importQueue');
    if(!q) return;
    const box=progressBox();
    if(!box) return;
    const text=(q.textContent||'').toLowerCase();
    const active=/uploading|queued for extraction|extracting/.test(text);
    box.hidden=!active;
    const target=box.querySelector('.cc-import-progress-text');
    if(target){
      target.textContent=active
        ? 'Upload in progress — your recipe is being extracted. You can continue once the status changes to “Queued for extraction”.'
        : '';
    }
  }

  function observeQueue(){
    const q=document.querySelector('#importQueue');
    if(!q || q.dataset.ccUiObserved==='1') return;
    q.dataset.ccUiObserved='1';
    const observer=new MutationObserver(()=>updateProgress());
    observer.observe(q,{subtree:true,childList:true,characterData:true});
    updateProgress();
  }

  installStyles();
  const bodyObserver=new MutationObserver(()=>{installStyles();observeQueue();updateProgress();});
  bodyObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
  observeQueue();
})();
