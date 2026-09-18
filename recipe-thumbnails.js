// Event-driven recipe thumbnail layer. Local asset only; no MutationObserver.
const IMAGE_POOL=[
  {keys:/pasta|noodle|spaghetti|macaroni/i,url:'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80',alt:'Pasta dish'},
  {keys:/salad|slaw|lettuce|greens|vegetable/i,url:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',alt:'Fresh salad'},
  {keys:/pork|beef|lamb|steak|meat|ham|chicken/i,url:'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',alt:'Prepared meat dish'},
  {keys:/soup|broth|stew/i,url:'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',alt:'Bowl of soup'},
  {keys:/curry|masala|spicy|sriracha/i,url:'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',alt:'Spiced dish'},
  {keys:/cake|dessert|sweet|chocolate/i,url:'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',alt:'Dessert'},
  {keys:/pancake|waffle|breakfast/i,url:'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=900&q=80',alt:'Breakfast dish'},
  {keys:/rice|risotto/i,url:'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80',alt:'Rice dish'}
];
const DEFAULT_IMAGES=[
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80'
];
let recipes=[];
function plainIngredients(r){const a=r?.ingredients;if(Array.isArray(a))return a.map(x=>typeof x==='string'?x:[x?.quantity,x?.unit,x?.name].filter(Boolean).join(' ')).join(' ');if(a&&typeof a==='object'&&typeof a.html==='string')return a.html.replace(/<[^>]*>/g,' ');return String(a||'')}
function textOf(r){return[r?.name,r?.cuisine,r?.course,r?.recipe_type,plainIngredients(r)].join(' ').toLowerCase()}
function candidates(r){const t=textOf(r);const match=IMAGE_POOL.find(x=>x.keys.test(t));if(match)return[match];const id=Number(r?.id)||0;return[{url:DEFAULT_IMAGES[Math.abs(id)%DEFAULT_IMAGES.length],alt:'Food photograph'}]}
function svgFallback(r){const t=textOf(r);let accent='#9b3f2f',secondary='#d7b56d';if(/salad|green|vegetable|spinach/.test(t)){accent='#6d8b4d';secondary='#b8c98c'}else if(/pasta|noodle|rice/.test(t)){accent='#c76b3f';secondary='#e2c06e'}else if(/soup|curry|sauce|masala/.test(t)){accent='#c65b35';secondary='#e6b34f'}else if(/cake|dessert|sweet/.test(t)){accent='#9b5b65';secondary='#e2b6bd'}const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 500"><rect width="900" height="500" fill="#ddd2bd"/><ellipse cx="450" cy="275" rx="285" ry="145" fill="#f9f6ef"/><ellipse cx="450" cy="275" rx="220" ry="105" fill="#eee7d8"/><ellipse cx="450" cy="270" rx="170" ry="78" fill="${secondary}" opacity=".85"/><circle cx="385" cy="255" r="34" fill="${accent}"/><circle cx="470" cy="285" r="42" fill="${accent}"/><circle cx="535" cy="245" r="28" fill="${accent}"/><path d="M330 340 Q450 385 570 340" fill="none" stroke="#b7a88f" stroke-width="12" stroke-linecap="round"/><text x="450" y="95" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#5e584f">Cooking Confidential</text></svg>`;return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg)}
function setImage(box,r,list,index=0){const chosen=list[index];if(!chosen){const fallback=document.createElement('img');fallback.src=svgFallback(r);fallback.alt='Recipe illustration';fallback.className='cc-recipe-image';box.replaceChildren(fallback);return}const image=document.createElement('img');image.alt=chosen.alt;image.loading='eager';image.decoding='async';image.className='cc-recipe-image';image.onload=()=>box.replaceChildren(image);image.onerror=()=>setImage(box,r,list,index+1);image.src=chosen.url;box.replaceChildren(image)}
function apply(){document.querySelectorAll('#content .card').forEach(card=>{const box=card.querySelector('.card-image');if(!box)return;const r=recipes.find(x=>Number(x.id)===Number(card.dataset.id));if(!r||box.querySelector('img.cc-recipe-image'))return;setImage(box,r,candidates(r))})}
function refresh(){recipes=Array.isArray(window.ccRecipes)?window.ccRecipes:[];if(document.querySelector('#content .card'))apply()}
window.addEventListener('cc:recipes-rendered',refresh);
window.addEventListener('load',refresh);
[0,250,750,1500,3000,5000].forEach(ms=>setTimeout(refresh,ms));
refresh();