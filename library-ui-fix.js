// Cooking Confidential: independent paginated recipe library loader.
const CC_SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const CC_SUPABASE_KEY='sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
const PAGE_SIZE=12;
let ccPage=0,ccSearch='',ccView='recipes',ccFallbackActive=false,ccLoading=false;
function esc(v=''){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function stars(n){return n?'★'.repeat(n):''}
function getStoredAccessToken(){
  try{
    const project=new URL(CC_SUPABASE_URL).hostname.split('.')[0];
    const exact=`sb-${project}-auth-token`,raw=localStorage.getItem(exact);
    if(raw){const parsed=JSON.parse(raw);if(parsed?.access_token)return parsed.access_token}
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i)||'';
      if(k.startsWith('sb-')&&k.endsWith('-auth-token')){const parsed=JSON.parse(localStorage.getItem(k)||'{}');if(parsed?.access_token)return parsed.access_token}
    }
  }catch(error){console.warn('Cooking Confidential session read:',error)}
  return null;
}
function searchClause(q){const safe=String(q).replace(/[(),]/g,' ').replace(/[%*]/g,' ').trim();if(!safe)return'';return`(name.ilike.*${safe}*,cuisine.ilike.*${safe}*,country.ilike.*${safe}*,region.ilike.*${safe}*,course.ilike.*${safe}*,personal_notes.ilike.*${safe}*)`}
async function fetchRecipePage(page){
  const token=getStoredAccessToken();if(!token)throw new Error('Your sign-in session is missing. Please sign in again.');
  const params=new URLSearchParams({select:'*',order:'updated_at.desc',limit:String(PAGE_SIZE),offset:String(page*PAGE_SIZE)});const clause=searchClause(ccSearch);if(clause)params.set('or',clause);if(ccView==='favourites')params.set('is_favourite','eq.true');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{const response=await fetch(`${CC_SUPABASE_URL}/rest/v1/cc_recipes?${params}`,{headers:{apikey:CC_SUPABASE_KEY,Authorization:`Bearer ${token}`,Prefer:'count=exact'},signal:controller.signal,cache:'no-store'});const text=await response.text();if(!response.ok)throw new Error(text||`Recipe request failed (${response.status}).`);const data=JSON.parse(text||'[]');const range=response.headers.get('content-range')||'';const match=range.match(/\/([0-9]+|\*)$/);const total=match&&match[1]!=='*'?Number(match[1]):page*PAGE_SIZE+data.length;return{data,total}}finally{clearTimeout(timer)}}
function pagination(total){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));ccPage=Math.min(ccPage,pages-1);const start=total?ccPage*PAGE_SIZE+1:0,end=Math.min((ccPage+1)*PAGE_SIZE,total);return`<div class="cc-pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:24px 0 8px"><button class="secondary cc-page" data-page="0" ${ccPage===0?'disabled':''}>First</button><button class="secondary cc-page" data-page="${Math.max(0,ccPage-1)}" ${ccPage===0?'disabled':''}>‹ Prev</button><span style="padding:0 8px;color:#746f66;font-size:14px">${start}–${end} of ${total} · Page ${ccPage+1} of ${pages}</span><button class="secondary cc-page" data-page="${Math.min(pages-1,ccPage+1)}" ${ccPage>=pages-1?'disabled':''}>Next ›</button><button class="secondary cc-page" data-page="${pages-1}" ${ccPage>=pages-1?'disabled':''}>Last</button></div>`}
function renderPage(data,total){const content=document.querySelector('#content');if(!content)return;content.innerHTML=`<div class="section-head"><h2>${ccView==='favourites'?'Favourites':'Your recipes'}</h2><span class="count">${total} recipes</span></div>${data.length?'<div class="grid">'+data.map(r=>`<article class="card" data-id="${esc(r.id)}"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name||'Untitled recipe')}</h3><div class="meta">${esc(r.course||'Recipe')} · ${stars(r.rating)}</div></div></article>`).join('')+'</div>':`<div class="empty">No recipes found. Try another search.</div>`}${pagination(total)}`;content.querySelectorAll('.card[data-id]').forEach(card=>card.onclick=()=>window.dispatchEvent(new CustomEvent('cc:open-recipe',{detail:{id:Number(card.dataset.id)}})));content.querySelectorAll('.cc-page').forEach(button=>button.onclick=async()=>{if(!button.disabled){ccPage=Number(button.dataset.page);await loadPage()}})}
async function loadPage(){if(ccLoading)return;ccLoading=true;const content=document.querySelector('#content');if(!content){ccLoading=false;return}content.innerHTML='<div class="empty">Loading your recipes…</div>';try{const result=await fetchRecipePage(ccPage);ccFallbackActive=true;renderPage(result.data,result.total)}catch(error){console.error('Cooking Confidential paginated recipe load:',error);content.innerHTML=`<div class="empty"><strong>We could not load the recipe library.</strong><br><small>${esc(error?.message||error)}</small></div>`}finally{ccLoading=false}}
function maybeLoad(){const content=document.querySelector('#content'),app=document.querySelector('#appPanel');if(content&&!app?.hidden&&/Loading your recipes/i.test(content.textContent||''))loadPage()}
setTimeout(maybeLoad,500);setTimeout(maybeLoad,1500);setTimeout(maybeLoad,3000);
document.addEventListener('input',event=>{if(event.target?.id==='searchInput'&&ccFallbackActive){clearTimeout(window.__ccSearchTimer);window.__ccSearchTimer=setTimeout(()=>{ccSearch=event.target.value.trim();ccPage=0;loadPage()},250)}},true);
document.addEventListener('click',event=>{const tab=event.target.closest('.tab');if(!tab)return;const nextView=tab.dataset.view;if(nextView==='recipes'||nextView==='favourites')setTimeout(()=>{if(ccFallbackActive){ccView=nextView;ccPage=0;loadPage()}else maybeLoad()},80)},true);
window.addEventListener('cc:recipes-changed',()=>{if(ccFallbackActive){ccPage=0;loadPage()}else maybeLoad()});
