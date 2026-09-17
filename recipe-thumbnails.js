// Recipe card thumbnail layer.
// Uses a small stable pool of food photography and avoids repeating an image
// across visible cards where possible. Recipe data and schema are unchanged.
const img=(id,alt)=>({url:`https://images.unsplash.com/${id}?auto=format&fit=crop&fm=jpg&q=82&w=900`,alt});
const IMAGES={
 food:img('photo-1504674900247-0877df9cc836','Prepared food on a table'),
 pasta:img('photo-1473093295043-cdd812d0e601','Pasta dish'),
 salad:img('photo-1512621776951-a57141f2eefd','Fresh salad'),
 pizza:img('photo-1565299624946-b28f40a0ae38','Pizza'),
 dumplings:img('photo-1601050690597-df0568f70950','Dumplings'),
 friedChicken:img('photo-1562967914-608f82629710','Fried chicken'),
 prepared:img('photo-1547592180-85f173990554','Prepared dish'),
 ingredients:img('photo-1498837167922-ddd27525d352','Fresh ingredients'),
 freshSalad:img('photo-1540189549336-e6e99c3679fe','Fresh salad bowl'),
 tableFood:img('photo-1515003197210-e0cd71810b5f','Food served on a table')
};
const pool=Object.values(IMAGES),used=new Set();
let recipes=[];
function textOf(r){const ingredients=Array.isArray(r?.ingredients)?r.ingredients.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join(' '):'';return[r?.name,r?.cuisine,r?.course,ingredients].join(' ').toLowerCase()}
function candidates(r){const t=textOf(r),out=[];const add=k=>{if(IMAGES[k]&&!out.includes(IMAGES[k]))out.push(IMAGES[k]);};
 if(/salad|slaw|cabbage|apple/.test(t))add('salad');
 if(/pasta|mac ?(&|and)? ?cheese|noodle/.test(t))add('pasta');
 if(/dumpling|gyoza/.test(t))add('dumplings');
 if(/chicken|fried/.test(t))add('friedChicken');
 if(/pizza/.test(t))add('pizza');
 if(/ingredient|vegetable|root vegetable/.test(t))add('ingredients');
 if(/soup|broth|stew/.test(t))add('prepared');
 if(/korean|chinese|malay|ham|pork|beef|steak|pulled|roast|meat/.test(t))add('food');
 add('tableFood');add('freshSalad');add('prepared');add('ingredients');add('pasta');add('food');
 return out.concat(pool.filter(x=>!out.includes(x)));}
function choose(r){for(const c of candidates(r))if(!used.has(c.url)){used.add(c.url);return c}const fallback=candidates(r)[0];if(fallback)used.add(fallback.url);return fallback}
function setImage(box,candidatesList,index=0){const chosen=candidatesList[index];if(!chosen)return;const image=document.createElement('img');image.alt=chosen.alt;image.loading='lazy';image.decoding='async';image.src=chosen.url;image.onload=()=>{box.innerHTML='';box.appendChild(image)};image.onerror=()=>setImage(box,candidatesList,index+1)}
function apply(){used.clear();const source=Array.isArray(window.ccRecipes)?window.ccRecipes:[];recipes=source;const cards=[...document.querySelectorAll('.card')];cards.forEach(card=>{const box=card.querySelector('.card-image');if(!box)return;const r=recipes.find(x=>Number(x.id)===Number(card.dataset.id));if(!r)return;const list=candidates(r);const current=box.querySelector('img')?.getAttribute('src')||'';if(current&&list.some(x=>x.url===current))return;const start=choose(r);const ordered=[start,...list.filter(x=>x.url!==start?.url)];setImage(box,ordered);})}
window.addEventListener('cc:recipes-loaded',apply);
new MutationObserver(()=>apply()).observe(document.body,{subtree:true,childList:true});
apply();
