import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const clean=s=>String(s??'').replace(/\s*\[\s*[\d,;\s-]+\]\s*/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const lines=s=>String(s??'').replace(/\\n/g,'\n').replace(/\\r/g,'\n').replace(/\r/g,'').split(/\n/).map(v=>clean(v)).filter(Boolean);
let observedForm=null;
const observer=new MutationObserver(()=>{const form=document.querySelector('#ccEditForm');if(form&&form!==observedForm){observedForm=form;form.dataset.ccOriginalName=form.querySelector('[name="name"]')?.value?.trim()||'';}});
observer.observe(document.body,{subtree:true,childList:true});

document.addEventListener('click',async event=>{
 const button=event.target?.closest?.('#ccEditForm button[type="submit"]');
 if(!button)return;
 const form=button.closest('#ccEditForm');
 if(!form)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const {data:{user}}=await sb.auth.getUser();
 if(!user){alert('Please sign in again.');return;}
 const fd=new FormData(form);
 const val=n=>{const v=String(fd.get(n)||'');return v==='__custom__'?String(fd.get(`${n}_custom`)||'').trim():v.trim()};
 const name=clean(fd.get('name'));
 const ingredients=lines(fd.get('ingredients')).map(v=>clean(v)).filter(Boolean);
 const method=clean(fd.get('method')||'');
 const notes=clean(fd.get('notes')||'');
 const payload={name,cuisine:clean(fd.get('cuisine'))||null,course:val('course')||null,recipe_type:val('recipe_type')||null,servings:clean(fd.get('servings'))||null,ingredients,method,personal_notes:notes||null};
 const oldName=form.dataset.ccOriginalName||'';
 button.disabled=true;button.textContent='Saving…';
 try{
  let recipeId=window.CCDeleteRecipeId||null;
  if(!recipeId){
   const q=await sb.from('cc_recipes').select('id').eq('created_by',user.id).eq('name',oldName).limit(1).maybeSingle();
   if(q.error)throw q.error;
   recipeId=q.data?.id||null;
  }
  if(!recipeId)throw new Error('Could not identify the recipe to update. Please close and reopen it.');
  const q=await sb.from('cc_recipes').update(payload).eq('id',recipeId).eq('created_by',user.id).select('id,method').single();
  if(q.error)throw q.error;
  if(String(q.data?.method||'')!==method)throw new Error('The recipe was not saved correctly. Please try again.');
  document.querySelector('#detailDialog')?.close();
  window.dispatchEvent(new CustomEvent('cc:recipes-changed'));
 }catch(error){button.disabled=false;button.textContent='Save changes';alert(error.message||'Could not save recipe.');}
},true);
