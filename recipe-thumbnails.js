// Lightweight card thumbnail layer. Uses a free Unsplash steak photo for beef/steak recipes.
const BEEF_IMAGE='https://images.unsplash.com/photo-1503220178855-e31ec372b8ad?auto=format&fit=crop&fm=jpg&q=82&w=900';
function textForCard(card){const id=Number(card.dataset.id);const recipes=window.ccRecipesForThumbnails||[];const r=recipes.find(x=>Number(x.id)===id);return r?[r.name,r.cuisine,r.course,Array.isArray(r.ingredients)?r.ingredients.join(' '):''].join(' ').toLowerCase():''}
function apply(){document.querySelectorAll('.card').forEach(card=>{const box=card.querySelector('.card-image');if(!box||box.dataset.ccThumb==='1')return;const t=textForCard(card);if(/\b(beef|steak|sirloin|flank|ribeye|skirt)\b/i.test(t)){box.dataset.ccThumb='1';box.innerHTML=`<img src="${BEEF_IMAGE}" alt="Grilled beef" loading="lazy">`}})}
window.ccApplyRecipeThumbnails=apply;
new MutationObserver(apply).observe(document.body,{subtree:true,childList:true});
apply();
