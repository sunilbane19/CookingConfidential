import { reviewMultiRecipeV3 } from './multi-recipe-review-v3.js?v=3.0.2';
import { reviewImportFixed } from './import-review-fix.js?v=1.2.18';

document.addEventListener('click',async event=>{
 const button=event.target.closest('.cc-inbox-review');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const id=Number(button.dataset.id);
 try{
  if(await reviewMultiRecipeV3(id))return;
  await reviewImportFixed(id);
 }catch(e){alert(e.message||'Could not open review.')}
},true);
