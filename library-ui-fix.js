import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const content=document.querySelector('#content');
const formatStamp=value=>{if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `Added ${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}, ${d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true})}`};
let recipeMeta=new Map(),lastSignature='';
function injectCompactLibraryStyles(){if(document.querySelector('#ccCompactLibraryStyles'))return;const s=document.createElement('style');s.id='ccCompactLibraryStyles';s.textContent=`
/* Compact library header/footer: keep the recipe grid as the visual focus. */
.hero{padding-top:42px;padding-bottom:24px;max-width:980px}
.hero h1{font-size:clamp(34px,5vw,54px);line-height:1;white-space:nowrap;margin-bottom:14px}
.hero h1 br{display:none}
.hero-copy{font-size:17px;max-width:none;margin:0}
.search-wrap{margin-top:20px;padding:10px 14px;min-height:48px}
.search-wrap span{font-size:23px}
.tabs .tab{padding-top:12px;padding-bottom:12px}
.content{padding-top:18px}
.section-head{margin-bottom:12px}
.section-head h2{font-size:25px;line-height:1.1}
.cc-sort-wrap{gap:5px}
.cc-sort-wrap select{padding:6px 24px 6px 8px;font-size:11px;border-radius:8px;height:34px}
.site-footer{padding:18px 5vw 22px;min-height:48px}
.site-footer div{display:flex;flex-direction:row;align-items:center;gap:0}
.site-footer div span{display:none}
.site-footer div strong::after{content:' · ';font-family:Arial,sans-serif;font-weight:400;color:var(--muted)}
@media(max-width:760px){
 .hero{padding:28px 18px 18px}
 .hero h1{font-size:28px;letter-spacing:-.02em;white-space:nowrap;margin-bottom:8px}
 .hero-copy{font-size:14px;line-height:1.35}
 .search-wrap{margin-top:14px;min-height:46px;padding:8px 12px}
 .tabs .tab{padding:11px 0}
 .content{padding:16px 18px 24px}
 .section-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:10px}
 .section-head h2{font-size:23px}
 .section-head .count{justify-self:end;font-size:11px}
 .cc-sort-wrap{grid-column:1/-1;width:auto;justify-self:end;margin:0;gap:5px}
 .cc-sort-wrap select{width:132px;max-width:none;height:32px;padding:5px 22px 5px 8px;font-size:11px}
 .site-footer{padding:14px 18px 18px;display:flex;flex-direction:row;justify-content:center;align-items:center;gap:0;white-space:nowrap;font-size:10px}
 .site-footer div{font-size:10px}
 .site-footer strong{font-size:11px}
 .site-footer #footerMeta{font-size:10px}
}
@media(max-width:390px){.hero h1{font-size:26px}.hero-copy{font-size:13px}.cc-sort-wrap select{width:124px}}
`;document.head.appendChild(s)}
async function loadRecipeMeta(){const {data,error}=await sb.from('cc_recipes').select('id,created_at,updated_at,name,cuisine,course');if(error)return;recipeMeta=new Map((data||[]).map(r=>[Number(r.id),r]));enhance();}
function sortCards(cards,mode){return [...cards].sort((a,b)=>{const A=recipeMeta.get(Number(a.dataset.id))||{},B=recipeMeta.get(Number(b.dataset.id))||{};if(mode==='name')return String(A.name||a.querySelector('h3')?.textContent||'').localeCompare(String(B.name||b.querySelector('h3')?.textContent||''));if(mode==='cuisine')return String(A.cuisine||'').localeCompare(String(B.cuisine||''))||String(A.name||'').localeCompare(String(B.name||''));if(mode==='course')return String(A.course||'').localeCompare(String(B.course||''))||String(A.name||'').localeCompare(String(B.name||''));const field=mode==='updated'?'updated_at':'created_at';return new Date(B[field]||0)-new Date(A[field]||0)});}
function enhance(){if(!content)return;const cards=[...content.querySelectorAll('.card')];let head=content.querySelector('.section-head');if(!head)return;let select=head.querySelector('#ccRecipeSort');if(!select){const wrap=document.createElement('label');wrap.className='cc-sort-wrap';wrap.innerHTML='<span>Sort</span><select id="ccRecipeSort" aria-label="Sort recipes"><option value="created">Latest added</option><option value="updated">Recently updated</option><option value="name">A–Z</option><option value="cuisine">Cuisine</option><option value="course">Course</option></select>';head.appendChild(wrap);select=wrap.querySelector('select');select.addEventListener('change',()=>applySort(select.value));}
 cards.forEach(card=>{const id=Number(card.dataset.id),meta=recipeMeta.get(id);if(!meta)return;const stamp=formatStamp(meta.created_at);if(!stamp)return;let el=card.querySelector('.creation-stamp');if(!el){el=document.createElement('span');el.className='creation-stamp';card.querySelector('.meta')?.appendChild(el)}el.textContent=stamp});
 if(cards.length)applySort(select.value||'created');updateFooter();}
function applySort(mode){const grid=content?.querySelector('.grid');if(!grid)return;sortCards([...grid.querySelectorAll('.card')],mode).forEach(c=>grid.appendChild(c))}
function updateFooter(){const footer=document.querySelector('#footerMeta');if(!footer)return;const count=content?.querySelectorAll('.card').length||0;footer.textContent=`Private · ${count} recipe${count===1?'':'s'} shown`}
const observer=new MutationObserver(()=>{const sig=content?.innerHTML?.slice(0,5000)||'';if(sig===lastSignature)return;lastSignature=sig;setTimeout(enhance,0)});if(content)observer.observe(content,{subtree:true,childList:true});injectCompactLibraryStyles();loadRecipeMeta();window.addEventListener('cc:recipes-changed',()=>loadRecipeMeta());