import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const PAGE_SIZE=12;
let client=null;
let page=0;
let total=0;
let active=false;

async function getClient(){
  if(client)return client;
  const source=await fetch('/app.js?v=1.3.8',{cache:'no-store'}).then(r=>r.text());
  const key=source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
  if(!key)throw new Error('Could not initialise the recipe library.');
  client=createClient(SUPABASE_URL,key);
  return client;
}
function esc(s=''){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function stars(n){return n?'★'.repeat(n):'';}
function render(data,count){
  const content=document.querySelector('#content');
  if(!content)return;
  total=count||0;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  page=Math.min(page,pages-1);
  const cards=(data||[]).map(r=>`<article class="card" data-recovery-id="${r.id}"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${esc(r.cuisine||'Uncategorised')}</span><h3>${esc(r.name||'Untitled recipe')}</h3><div class="meta">${esc(r.course||'Recipe')} · ${stars(r.rating)}</div></div></article>`).join('');
  const start=total?page*PAGE_SIZE+1:0,end=Math.min((page+1)*PAGE_SIZE,total);
  content.innerHTML=`<div class="section-head"><h2>Your recipes</h2><span class="count">${total} recipes</span></div>${cards?'<div class="grid">'+cards+'</div>':'<div class="empty">No recipes found.</div>'}${total>PAGE_SIZE?`<div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:24px 0 8px"><button class="secondary cc-recovery-page" data-page="0" ${page===0?'disabled':''}>First</button><button class="secondary cc-recovery-page" data-page="${Math.max(0,page-1)}" ${page===0?'disabled':''}>‹ Prev</button><span style="padding:0 8px;color:#746f66;font-size:14px">${start}–${end} of ${total} · Page ${page+1} of ${pages}</span><button class="secondary cc-recovery-page" data-page="${Math.min(pages-1,page+1)}" ${page>=pages-1?'disabled':''}>Next ›</button><button class="secondary cc-recovery-page" data-page="${pages-1}" ${page>=pages-1?'disabled':''}>Last</button></div>`:''}`;
  content.querySelectorAll('.cc-recovery-page').forEach(b=>b.onclick=async()=>{if(b.disabled)return;page=Number(b.dataset.page);await load();});
  content.querySelectorAll('[data-recovery-id]').forEach(c=>c.onclick=()=>{const id=Number(c.dataset.recoveryId);const r=(data||[]).find(x=>x.id===id);if(!r)return;const d=document.querySelector('#detailDialog');if(!d)return;d.querySelector('#detailContent').innerHTML=`<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${esc(r.cuisine||'')} · ${esc(r.course||'Recipe')}</span><h2 class="detail-title">${esc(r.name||'Untitled recipe')}</h2><div class="meta">${stars(r.rating)}</div><div class="detail-section"><h4>Ingredients</h4><ul>${(Array.isArray(r.ingredients)?r.ingredients:(typeof r.ingredients==='string'?r.ingredients.split(/\r?\n/):[])).map(i=>'<li>'+esc(typeof i==='string'?i:[i?.amount,i?.quantity,i?.unit,i?.name,i?.ingredient].filter(Boolean).join(' '))+'</li>').join('')}</ul></div><div class="detail-section"><h4>Method</h4><p>${esc(r.method||'')}</p></div>`;d.showModal();});
}
async function load(){
  const sb=await getClient();
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Please sign in again.');
  let q=sb.from('cc_recipes').select('*',{count:'exact'}).order('updated_at',{ascending:false}).range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE-1);
  const search=document.querySelector('#searchInput')?.value.trim();
  if(search){const like=`*${search.replace(/[(),%]/g,' ')}*`;q=q.or(`(name.ilike.${like},cuisine.ilike.${like},country.ilike.${like},region.ilike.${like},course.ilike.${like},personal_notes.ilike.${like})`);}
  const {data,error,count}=await q;if(error)throw error;render(data,count);
}
async function recover(){
  if(active)return;
  active=true;
  try{await load();}catch(e){console.error('Cooking Confidential library recovery:',e);active=false;return;}
}
setTimeout(()=>{
  const content=document.querySelector('#content');
  if(!content)return;
  if(/Loading your recipes/i.test(content.textContent||''))recover();
},3500);
window.addEventListener('cc:recipes-changed',()=>{if(active)load().catch(()=>{});});
