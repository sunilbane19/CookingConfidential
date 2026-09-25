// Explicit import mode selector for Cooking Confidential.
// Single-recipe mode remains the default. Multi-recipe mode is opt-in for the current upload.
(function(){
  const panel=document.querySelector('#importModePanel');
  const countWrap=document.querySelector('#multiCountWrap');
  const countInput=document.querySelector('#multiRecipeCount');
  if(!panel)return;
  function sync(){
    const mode=panel.querySelector('input[name="importMode"]:checked')?.value||'single';
    const multi=mode==='multi';
    if(countWrap)countWrap.hidden=!multi;
    window.ccImportMode=mode;
    window.ccExpectedRecipeCount=multi&&countInput?.value?Math.max(2,Math.min(50,Number(countInput.value))):null;
  }
  panel.addEventListener('change',sync);
  countInput?.addEventListener('input',sync);
  sync();
  window.ccResetImportMode=()=>{
    const single=panel.querySelector('input[name="importMode"][value="single"]');
    if(single)single.checked=true;
    if(countInput)countInput.value='';
    sync();
  };
})();
