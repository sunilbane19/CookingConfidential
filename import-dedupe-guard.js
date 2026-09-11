import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ingredientKey=a=>Array.isArray(a)?a.map(norm).filter(Boolean).join('|'):norm(a);

async function currentUser(){const{data:{user}}=await sb.auth.getUser();if(!user)throw Error('Please sign in again before saving.');return user}
async function existingRecipe(user,name,ingredients){
  const{data,error}=await sb.from('cc_recipes').select('id,name,ingredients').eq('created_by',user.id).ilike('name',name.trim());
  if(error)throw Error(error.message);
  const wanted=ingredientKey(ingredients);
  return (data||[]).find(r=>norm(r.name)===norm(name)&&ingredientKey(r.ingredients)===wanted)||null;
}
async function saveRecipe(user,name,ingredients,itemTitle){
  const existing=await existingRecipe(user,name,ingredients);
  if(existing)return {saved:false,duplicate:true,id:existing.id};
  const{data,error}=await sb.from('cc_recipes').insert({name,description:null,ingredients,method:null,cuisine:null,course:'Ingredient',source_type:'file',source_url:null,source_title:itemTitle||'Imported image',created_by:user.id,visibility:'private'}).select('id').single();
  if(error)throw Error(`Could not save ${name}: ${error.message}`);
  return {saved:true,duplicate:false,id:data?.id};
}
async function latestImport(user){
  const{data}=await sb.from('cc_import_items').select('id,file_name,source_title,created_at').eq('created_by',user.id).eq('review_status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();
  return data||null;
}
function values(form,i){
  const name=String(form.elements[`name-${i}`]?.value||'').trim();
  const ingredients=String(form.elements[`ingredients-${i}`]?.value||'').split(/\r?\n|\\n/).map(x=>String(x).trim()).filter(Boolean);
  return{name,ingredients};
}
function mark(card,text){const b=card?.querySelector('.cc-save-one'),c=card?.querySelector('.cc-save-choice');if(b){b.disabled=true;b.textContent=text}if(c)c.checked=false}
async function handleOne(form,i,itemTitle){
  const{ name,ingredients }=values(form,i);if(!name||!ingredients.length)return {saved:false,duplicate:false,invalid:true};
  const user=await currentUser();const result=await saveRecipe(user,name,ingredients,itemTitle);
  const card=form.querySelector(`[data-recipe-index="${i}"]`);mark(card,result.duplicate?'Already saved':'Saved');return result;
}
async function handleBulk(form){
  const choices=[...form.querySelectorAll('.cc-save-choice:checked')].map(x=>Number(x.dataset.index));
  if(!choices.length){alert('Select at least one recipe to save.');return}
  try{
    const user=await currentUser();const item=await latestImport(user);const itemTitle=item?.file_name||'Imported image';let saved=0,duplicates=0,invalid=0;
    for(const i of choices){const{ name,ingredients }=values(form,i);if(!name||!ingredients.length){invalid++;continue}const result=await saveRecipe(user,name,ingredients,itemTitle);const card=form.querySelector(`[data-recipe-index="${i}"]`);mark(card,result.duplicate?'Already saved':'Saved');if(result.duplicate)duplicates++;else saved++}
    if(item)await sb.from('cc_import_items').update({recipe_id:null,review_status:'approved',extraction_status:'ready'}).eq('id',item.id);
    const parts=[];if(saved)parts.push(`${saved} saved`);if(duplicates)parts.push(`${duplicates} already saved`);if(invalid)parts.push(`${invalid} skipped`);
    alert(parts.join(' • ')||'Nothing was saved.');
    if(item||saved)window.location.reload();
  }catch(e){alert(e.message||'Could not save the selected recipes.')}
}

// This is a capture-phase guard. It runs before the older Pesto review handlers,
// so a duplicate can never reach their direct INSERT call.
document.addEventListener('click',async event=>{
  const one=event.target?.closest?.('.cc-save-one');
  const bulk=event.target?.closest?.('#ccSaveSelected');
  if(!one&&!bulk)return;
  const form=event.target?.closest?.('#ccPosterForm');if(!form)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{
    if(one){await handleOne(form,Number(one.dataset.index),'Imported image');return}
    await handleBulk(form);
  }catch(e){alert(e.message||'Could not save the recipe.')}
},true);
