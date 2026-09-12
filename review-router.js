import { reviewMultiRecipeV3 } from './multi-recipe-review-v3.js?v=3.0.0';
import { reviewImportFixed } from './import-review-fix.js?v=1.2.16';

document.addEventListener('click',async event=>{
 const button=event.target.closest('.review-btn');
 if(!button)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const id=Number(button.dataset.id);
 try{
  if(await reviewMultiRecipeV3(id))return;
  await reviewImportFixed(id);
 }catch(e){alert(e.message||'Could not open review.')}
},true);
