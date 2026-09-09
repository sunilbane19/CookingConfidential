// Keep the main recipe library in sync after leaving the multi-rub review list.
// The rub importer saves directly to cc_recipes, while app.js keeps an in-memory
// recipe list. Refresh only when the user closes the rub review list so saved
// rubs immediately appear in the main Recipes view without interrupting review.
document.addEventListener('click',event=>{
  const target=event.target?.closest?.('#rubDone, #detailContent > .close');
  if(!target)return;
  const detail=document.querySelector('#detailContent');
  if(!detail?.querySelector('.rub-list-actions'))return;
  setTimeout(()=>window.location.reload(),150);
},true);
