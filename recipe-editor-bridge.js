import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
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
  const title=document.querySelector('#detailContent .detail-title')?.textContent?.trim();
  if(!title)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try{
    const q=await sb.from('cc_recipes').select('*').eq('name',title).limit(1).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)throw new Error('Recipe could not be found.');
    const openEditor=await ensureEditor();
    await openEditor(q.data);
  }catch(error){
    console.error('Cooking Confidential recipe editor bridge:',error);
    alert('Could not open the recipe editor. Please refresh the page and try again.');
  }
},true);
