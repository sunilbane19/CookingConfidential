// Recipe card thumbnail layer.
// Chooses food/ingredient photography that fits the recipe and avoids reusing the same
// image across visible cards whenever the image pool has an unused match.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const img=(id,alt)=>({url:`https://images.unsplash.com/${id}?auto=format&fit=crop&fm=jpg&q=82&w=900`,alt});
const IMAGES={
 teriyaki:img('photo-1732187582879-3ca83139c1b8','Beef teriyaki bowl'),
 fajita:img('photo-1689774187968-0e6c29a1d82e','Grilled fajita meat'),
 bulgogi:img('photo-1559863658-57587f49d0c4','Bulgogi dish'),
 garlicHerb:img('photo-1674294997896-4d0db9f8a285','Garlic and herb steak'),
 soyGarlic:img('photo-1690983330548-e34b52aa8cb2','Beef with garlic'),
 steakhouse:img('photo-1503220178855-e31ec372b8ad','Grilled steak'),
 carneAsada:img('photo-1707603571504-86c1ea50903e','Carne asada tacos'),
 sweetChili:img('photo-1781332147287-191fcfbd52be','Glazed chicken with chili'),
 honeySriracha:img('photo-1779265312208-ea9eb64ee359','Cooked beef'),
 steakHerbs:img('photo-1448907503123-67254d59ca4f','Steak and herbs'),
 rawGarlic:img('photo-1690983330536-3b0089d07cf9','Steak with garlic and herbs'),
 marinatedBeef:img('photo-1785636883701-bd4f9e3173c4','Marinated beef on a grill'),
 streetTacos:img('photo-1648437595587-e6a8b0cdf1f9','Street tacos with lime'),
 carneTacos:img('photo-1579633711380-ad5922a56153','Carne asada tacos with salsa')
};
const pool=Object.values(IMAGES),used=new Set();
let recipes=[];
async function load(){try{const{data}=await sb.from('cc_recipes').select('id,name,cuisine,course,ingredients');recipes=data||[];apply()}catch(e){console.warn('Recipe thumbnails:',e)}}
function textOf(r){return[r.name,r.cuisine,r.course,Array.isArray(r.ingredients)?r.ingredients.join(' '):''].join(' ').toLowerCase()}
function candidates(r){const t=textOf(r),out=[];const add=k=>{if(IMAGES[k]&&!out.includes(IMAGES[k]))out.push(IMAGES[k])};
 if(/teriyaki/.test(t))add('teriyaki');
 if(/fajita/.test(t))add('fajita');
 if(/bulgogi|korean/.test(t))add('bulgogi');
 if(/carne\s*asada/.test(t))add('carneAsada');
 if(/garlic\s*herb|rosemary|thyme|herb/.test(t))add('garlicHerb');
 if(/soy\s*garlic/.test(t))add('soyGarlic');
 if(/steakhouse|steak/.test(t))add('steakhouse');
 if(/sweet\s*chili|chili/.test(t))add('sweetChili');
 if(/honey|sriracha/.test(t))add('honeySriracha');
 if(/lime|tortilla|taco|mexican/.test(t))add('streetTacos');
 if(/garlic/.test(t))add('rawGarlic');
 if(/beef|sirloin|flank|ribeye|skirt/.test(t))add('marinatedBeef');
 add('steakHerbs');add('carneTacos');
 return out.concat(pool.filter(x=>!out.includes(x)));}
function choose(r){for(const c of candidates(r))if(!used.has(c.url)){used.add(c.url);return c}const fallback=candidates(r)[0];if(fallback)used.add(fallback.url);return fallback}
function apply(){used.clear();const cards=[...document.querySelectorAll('.card')];cards.forEach(card=>{const box=card.querySelector('.card-image');if(!box)return;const r=recipes.find(x=>Number(x.id)===Number(card.dataset.id));if(!r)return;const chosen=choose(r);if(!chosen)return;box.dataset.ccThumb='1';box.innerHTML=`<img src="${chosen.url}" alt="${chosen.alt}" loading="lazy">`})}
new MutationObserver(()=>apply()).observe(document.body,{subtree:true,childList:true});
load();
