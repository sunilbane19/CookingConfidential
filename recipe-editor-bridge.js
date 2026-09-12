import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const STYLE_ID='cc-editor-bridge-style';
if(!document.getElementById(STYLE_ID)){
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent='#detailContent > .detail-actions{display:flex!important;gap:12px!important;align-items:stretch!important;flex-wrap:nowrap!important}#detailContent > .detail-actions > button{flex:1 1 0!important;min-width:0!important;width:0!important;min-height:50px!important}.cc-confirm{border:0;border-radius:24px;padding:0;max-width:min(520px,calc(100vw - 32px));width:calc(100% - 32px);background:transparent;box-shadow:0 24px 70px rgba(0,0,0,.24)}.cc-confirm::backdrop{background:rgba(20,18,15,.48);backdrop-filter:blur(2px)}.cc-confirm-card{background:#fbf8f2;border:1px solid #ddd5c8;border-radius:24px;padding:28px 24px 22px;color:#25221e;font-family:Arial,sans-serif}.cc-confirm-card .eyebrow{margin:0 0 10px;color:#a94432;font-weight:700;letter-spacing:.16em;font-size:12px}.cc-confirm-card h3{margin:0 0 12px;font-family:Georgia,serif;font-size:27px;line-height:1.1}.cc-confirm-card p{margin:0;color:#746f66;font-size:16px;line-height:1.5}.cc-confirm-actions{display:flex;gap:12px;margin-top:22px}.cc-confirm-actions button{flex:1;min-height:50px}@media(max-width:600px){.cc-confirm{max-width:none}.cc-confirm-card{padding:25px 20px 20px}.cc-confirm-actions{flex-direction:column-reverse}.cc-confirm-actions button{width:100%}}';
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
function confirmDeleteRecipe(recipeId,recipeName){
  return new Promise(resolve=>{
    let d=document.querySelector('#ccDeleteConfirm');
    if(!d){d=document.createElement('dialog');d.id='ccDeleteConfirm';d.className='cc-confirm';document.body.appendChild(d)}
    d.innerHTML=`<div class="cc-confirm-card"><p class="eyebrow">DELETE RECIPE</p><h3>Delete this recipe?</h3><p><strong>${String(recipeName||'This recipe').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}</strong><br><br>This will permanently remove the recipe from your kitchen notebook. The original uploaded file, if any, remains separately stored.</p><div class="cc-confirm-actions"><button class="secondary" type="button" id="ccDeleteCancel">Cancel</button><button class="primary" type="button" id="ccDeleteConfirmBtn">Delete recipe</button></div></div>`;
    const finish=value=>{if(d.open)d.close();resolve(value)};
    d.querySelector('#ccDeleteCancel').onclick=()=>finish(false);
    d.querySelector('#ccDeleteConfirmBtn').onclick=()=>finish(true);
    d.oncancel=()=>finish(false);
    if(!d.open)d.showModal();
  });
}
document.addEventListener('click',async event=>{
  const deleteButton=event.target?.closest?.('#ccDeleteRecipe');
  if(deleteButton){
    event.preventDefault();
    event.stopImmediatePropagation();
    const form=deleteButton.closest('form');
    const name=form?.querySelector('[name="name"]')?.value?.trim()||'This recipe';
    const recipeId=window.CCDeleteRecipeId;
    if(!recipeId)return alert('The recipe could not be identified. Please close and reopen it.');
    const confirmed=await confirmDeleteRecipe(recipeId,name);
    if(!confirmed)return;
    deleteButton.disabled=true;deleteButton.textContent='Deleting…';
    const{error}=await sb.from('cc_recipes').delete().eq('id',recipeId);
    if(error){deleteButton.disabled=false;deleteButton.textContent='Delete recipe';return alert(error.message);}
    document.querySelector('#detailDialog')?.close();
    window.dispatchEvent(new CustomEvent('cc:recipes-changed'));
    return;
  }
  const button=event.target?.closest?.('#editRecipeBtn');
  if(!button)return;
  const detail=document.querySelector('#detailDialog');
  if(!detail?.open)return;
  const title=document.querySelector('#detailContent .detail-title')?.textContent?.trim();
  if(!title)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try{
    const q=await sb.from('cc_recipes').select('*').eq('name',title).limit(1).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)throw new Error('Recipe could not be found.');
    window.CCDeleteRecipeId=q.data.id;
    const openEditor=await ensureEditor();
    window.CCDeleteRecipeId=q.data.id;
    await openEditor(q.data);
  }catch(error){
    console.error('Cooking Confidential recipe editor bridge:',error);
    alert('Could not open the recipe editor. Please refresh the page and try again.');
  }
},true);
