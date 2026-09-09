// Lightweight card thumbnail layer. Uses a free Unsplash steak photo for beef/steak recipes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const BEEF_IMAGE='https://images.unsplash.com/photo-1503220178855-e31ec372b8ad?auto=format&fit=crop&fm=jpg&q=82&w=900';
let recipes=[];
async function load(){try{const{data}=await sb.from('cc_recipes').select('id,name,cuisine,course,ingredients');recipes=data||[];apply()}catch(e){console.warn('Recipe thumbnails:',e)}}
function apply(){document.querySelectorAll('.card').forEach(card=>{const box=card.querySelector('.card-image');if(!box||box.dataset.ccThumb==='1')return;const r=recipes.find(x=>Number(x.id)===Number(card.dataset.id));if(!r)return;const t=[r.name,r.cuisine,r.course,Array.isArray(r.ingredients)?r.ingredients.join(' '):''].join(' ').toLowerCase();if(/\b(beef|steak|sirloin|flank|ribeye|skirt)\b/i.test(t)){box.dataset.ccThumb='1';box.innerHTML=`<img src="${BEEF_IMAGE}" alt="Grilled beef" loading="lazy">`}})}
new MutationObserver(apply).observe(document.body,{subtree:true,childList:true});
load();
