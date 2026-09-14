import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const KEY='sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
const sb=createClient(URL,KEY);
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
async function run(){
  const content=document.querySelector('#content');
  if(!content||!content.textContent.includes('Loading your recipes'))return;
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session)return;
    const {data,error}=await sb.from('cc_recipes').select('*').order('updated_at',{ascending:false}).abortSignal(AbortSignal.timeout(8000));
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Recipe library returned an invalid response.');
    content.innerHTML=`<div class="section-head"><h2>Your recipes</h2><span class="count">${data.length} recipes</span></div><div class="grid">${data.map(r=>`<article class="card"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name||'Untitled recipe')}</h3><div class="meta">${esc(r.course||'Recipe')}</div></div></article>`).join('')}</div>`;
  }catch(e){
    console.error('Cooking Confidential recipe fallback:',e);
    content.innerHTML=`<div class="empty">Recipe library could not be loaded.<br><small>${esc(e?.message||String(e))}</small></div>`;
  }
}
setTimeout(run,10000);
