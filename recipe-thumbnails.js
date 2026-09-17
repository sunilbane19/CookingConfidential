// Recipe card thumbnail layer.
// Uses a small, verified Unsplash image pool and selects a relevant image when possible.
import './library-ui-fix-v2.js?v=1.0.3';
import { supabase } from './supabase-client.js?v=1.0.1';
const img=(id,alt)=>({url:`https://images.unsplash.com/${id}?auto=format&fit=crop&fm=jpg&q=82&w=900`,alt});
const IMAGES={
 pasta:img('photo-1473093295043-cdd812d0e601','Pasta dish'),
 salad:img('photo-1512621776951-a57141f2eefd','Fresh salad'),
 food:img('photo-1504674900247-0877df9cc836','Prepared food'),
 soup:img('photo-1547592166-23ac45744acd','Bowl of soup'),
 breakfast:img('photo-1482049016688-2d3e1b311543','Breakfast dish'),
 pancakes:img('photo-1484723091739-30a097e8f929','Pancakes with fruit'),
 vegetables:img('photo-1540189549336-e6e99c3679fe','Fresh vegetables'),
 cake:img('photo-1611293388250-580b08c4a145','Cake'),
 greens:img('photo-1467003909585-2f8a72700288','Cooked greens'),
 curry:img('photo-1574484284002-952d92456975','Curry dish')
};
const pool=Object.values(IMAGES),used=new Set();
let recipes=[];
function plainIngredients(r){const a=r?.ingredients;if(Array.isArray(a))return a.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join(' ');if(a&&typeof a==='object'&&typeof a.html==='string')return a.html.replace(/<[^>]*>/g,' ');return String(a||'')}
function textOf(r){return[r?.name,r?.cuisine,r?.course,r?.recipe_type,plainIngredients(r)].join(' ').toLowerCase()}
function candidates(r){const t=textOf(r),out=[];const add=k=>{if(IMAGES[k]&&!out.includes(IMAGES[k]))out.push(IMAGES[k]);};
 if(/pasta|spaghetti|noodle|ravioli|lasagna/.test(t))add('pasta');
 if(/salad|lettuce|greens|spinach/.test(t))add('salad');
 if(/soup|broth|stock/.test(t))add('soup');
 if(/breakfast|egg|omelette|omelet/.test(t))add('breakfast');
 if(/pancake|waffle|crepe/.test(t))add('pancakes');
 if(/cake|dessert|bake|sweet/.test(t))add('cake');
 if(/curry|masala|indian|thai/.test(t))add('curry');
 if(/vegetable|tomato|pepper|carrot|potato/.test(t))add('vegetables');
 if(/beef|chicken|lamb|pork|fish|seafood|steak|meat|main/.test(t))add('food');
 add('greens');add('food');add('vegetables');
 return out.concat(pool.filter(x=>!out.includes(x)));}
function choose(r){for(const c of candidates(r))if(!used.has(c.url)){used.add(c.url);return c}return candidates(r)[0]}
function setImage(box,list,index=0){const chosen=list[index];if(!chosen)return;const image=document.createElement('img');image.alt=chosen.alt;image.loading='lazy';image.decoding='async';image.src=chosen.url;image.onload=()=>{box.innerHTML='';box.appendChild(image)};image.onerror=()=>setImage(box,list,index+1)}
function apply(){used.clear();const cards=[...document.querySelectorAll('.card')];cards.forEach(card=>{const box=card.querySelector('.card-image');if(!box)return;const r=recipes.find(x=>Number(x.id)===Number(card.dataset.id));if(!r)return;const list=candidates(r);const current=box.querySelector('img')?.getAttribute('src')||'';if(current&&list.some(x=>x.url===current))return;const start=choose(r);const ordered=[start,...list.filter(x=>x.url!==start?.url)];setImage(box,ordered)})}
async function load(){try{const q=await supabase.from('cc_recipes').select('id,name,cuisine,course,recipe_type,ingredients');if(q.error)throw q.error;recipes=q.data||[];apply()}catch(e){console.warn('Recipe thumbnails:',e)}}
window.addEventListener('cc:recipes-loaded',()=>{recipes=Array.isArray(window.ccRecipes)?window.ccRecipes:recipes;apply()});
new MutationObserver(()=>apply()).observe(document.body,{subtree:true,childList:true});
load();
