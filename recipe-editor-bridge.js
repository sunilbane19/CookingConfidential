// Reliable recipe-editor bridge.
// Captures the detail-view Edit button before app.js can fall back to its loading alert.
const STYLE_ID='cc-editor-bridge-style';
if(!document.getElementById(STYLE_ID)){
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent='#detailContent > .detail-actions{display:flex!important;gap:12px!important;align-items:stretch!important;flex-wrap:nowrap!important}#detailContent > .detail-actions > button{flex:1 1 0!important;min-width:0!important;width:0!important;min-height:50px!important}';
  document.head.appendChild(style);
}
let editorPromise;
async function ensureEditor(){
  if(typeof window.CCOpenEditor==='function')return window.CCOpenEditor;
  editorPromise ||= import('./recipe-management-fix.js?v=1.3.3');
  await editorPromise;
  if(typeof window.CCOpenEditor!=='function')throw new Error('Recipe editor did not initialise.');
  return window.CCOpenEditor;
}
document.addEventListener('click',async event=>{
  const button=event.target?.closest?.('#editRecipeBtn');
  if(!button)return;
  const detail=document.querySelector('#detailDialog');
  if(!detail?.open)return;
  const cards=document.querySelectorAll('.card');
  const title=document.querySelector('#detailContent .detail-title')?.textContent?.trim();
  const recipe=[...cards].map(c=>({card:c,id:Number(c.dataset.id)})).find(x=>{
    const name=x.card.querySelector('h3')?.textContent?.trim();
    return name===title;
  });
  if(!recipe)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try{
    const openEditor=await ensureEditor();
    const r=window.__CCRecipes?.find?.(x=>Number(x.id)===recipe.id);
    if(r)await openEditor(r);
    else{
      const {data,error}=await window.__CCSupabase.from('cc_recipes').select('*').eq('id',recipe.id).single();
      if(error)throw error;
      await openEditor(data);
    }
  }catch(error){
    console.error('Cooking Confidential recipe editor bridge:',error);
    alert('Could not open the recipe editor. Please refresh the page and try again.');
  }
},true);
