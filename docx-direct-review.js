import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as mammoth from 'https://esm.sh/mammoth@1.6.0';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const dialog=document.querySelector('#detailDialog');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/\[[\s\d,;,-]+\]/g,'').replace(/[ \t]+/g,' ').trim();

function parseText(text,fileName){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const title=(fileName||'Imported recipe').replace(/\.[^.]+$/,'');
  const start=lines.findIndex(x=>/^(ingredients?|what you need|ingredients list)\s*:??$/i.test(x));
  const methodStart=lines.findIndex(x=>/^(method|directions?|instructions?|preparation)\s*:??$/i.test(x));
  let ingredients='',method='';
  if(start>=0){const end=methodStart>start?methodStart:lines.length;ingredients=lines.slice(start+1,end).map(clean).filter(Boolean).join('\n');}
  if(methodStart>=0) method=lines.slice(methodStart+1).map(clean).filter(Boolean).join('\n');
  if(!ingredients && !method) method=lines.map(clean).filter(Boolean).join('\n');
  let name=lines.find(x=>x.length>2&&x.length<100&&!/^(ingredients?|method|directions?|instructions?|preparation|serves?|yield|course|cuisine|notes?)\b/i.test(x))||title;
  if(/kadipatta/i.test(title)&&/^kadipatta/i.test(name)) name='Kadipatta Preservation';
  return {name:clean(name),description:'',ingredients,method,cuisine:'',course:'',servings:''};
}

async function directReview(id){
  dialog.querySelector('#detailContent').innerHTML='<div class="dialog-card"><p class="eyebrow">REVIEW IMPORT</p><h2>Reading the original file…</h2><p class="small-note">The recipe is being read directly from your private upload.</p></div>';
  dialog.showModal();
  const {data:x,error}=await supabase.from('cc_import_items').select('*').eq('id',id).single();
  if(error||!x?.file_path) return fail(error?.message||'The original file could not be found.');
  const {data:signed,error:signError}=await supabase.storage.from('cooking-confidential').createSignedUrl(x.file_path,300);
  if(signError||!signed?.signedUrl) return fail(signError?.message||'Could not access the private uploaded file.');
  try{
    const res=await fetch(signed.signedUrl); if(!res.ok) throw new Error('The uploaded file could not be downloaded.');
    const blob=await res.blob();
    const result=await mammoth.extractRawText({arrayBuffer:await blob.arrayBuffer()});
    const recipe=parseText(result.value||'',x.file_name);
    showForm(x,id,recipe);
  }catch(e){fail(e?.message||'The DOCX file could not be read.');}
}
function fail(msg){dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" onclick="detailDialog.close()">×</button><p class="eyebrow">IMPORT ERROR</p><h2>Could not read the recipe</h2><p class="small-note">${esc(msg)}</p>`;}
function showForm(x,id,r){
  dialog.querySelector('#detailContent').innerHTML=`<button class="close" type="button" onclick="detailDialog.close()">×</button><p class="eyebrow">REVIEW IMPORT</p><h2>Check the recipe before saving</h2><p class="small-note">Read directly from the original uploaded DOCX.</p><form id="ccDirectReview"><label>Recipe name<input name="name" required value="${esc(r.name)}"></label><label>Description<textarea name="description" rows="3"></textarea></label><div class="two-col"><label>Cuisine<input name="cuisine"></label><label>Category<input name="course"></label></div><label>Servings<input name="servings"></label><label>Ingredients<textarea name="ingredients" rows="10">${esc(r.ingredients)}</textarea></label><label>Method<textarea name="method" rows="12">${esc(r.method)}</textarea></label><div class="detail-actions"><button class="secondary" type="button" onclick="detailDialog.close()">Cancel</button><button class="primary" type="submit">Overwrite recipe</button></div></form>`;
  const form=document.querySelector('#ccDirectReview');
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);const {data:{user}}=await supabase.auth.getUser();if(!user)return alert('Please sign in again before saving the recipe.');
    const payload={name:clean(f.get('name')),description:clean(f.get('description'))||null,cuisine:clean(f.get('cuisine'))||null,course:clean(f.get('course'))||null,servings:clean(f.get('servings'))||null,ingredients:String(f.get('ingredients')).split('\n').map(clean).filter(Boolean),method:String(f.get('method')).trim(),source_type:'file',source_url:null,source_title:x.file_name||null,created_by:user.id,visibility:'private'};
    let existing=x.recipe_id||null;if(!existing){const q=await supabase.from('cc_recipes').select('id').eq('created_by',user.id).eq('source_type','file').eq('source_title',x.file_name).order('id',{ascending:true}).limit(1);existing=q.data?.[0]?.id||null;}
    const result=existing?await supabase.from('cc_recipes').update(payload).eq('id',existing):await supabase.from('cc_recipes').insert(payload).select('id').single();
    if(result.error)return alert(result.error.message);const saved=existing||result.data?.id;
    const upd=await supabase.from('cc_import_items').update({recipe_id:saved,review_status:'approved',extraction_status:'ready',extracted_text:JSON.stringify(r)}).eq('id',id);if(upd.error)return alert(upd.error.message);dialog.close();window.location.reload();
  };
}

document.addEventListener('click',e=>{const b=e.target.closest('.review-btn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();directReview(Number(b.dataset.id));},true);
