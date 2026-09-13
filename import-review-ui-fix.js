// Import review UI normalization: use the uploaded file name as the recipe name and keep the original-file button compact.
(function(){
  function apply(root){
    const form=root?.querySelector?.('#ccImportReviewForm');
    if(!form||form.dataset.ccReviewUiFixed==='1')return;
    const original=form.querySelector('#ccViewOriginal');
    const nameInput=form.querySelector('[name="name"]');
    if(original&&nameInput){
      const label=String(original.textContent||'').replace(/^\s*View original:\s*/i,'').trim();
      if(label){
        nameInput.value=label.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
      }
      original.textContent='View original';
    }
    form.dataset.ccReviewUiFixed='1';
  }
  const observer=new MutationObserver(()=>apply(document));
  observer.observe(document.body,{subtree:true,childList:true});
  apply(document);
})();
