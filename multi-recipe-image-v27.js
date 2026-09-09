// V1.2 OCR cleanup layer for the 3x3 image rub importer.
// It deliberately sits on top of the proven v26 OCR engine: no OCR/loading/save
// behaviour is changed here. It only cleans recurring OCR artefacts before review.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processImageImport as processV26 } from './multi-recipe-image-fix.js?v=1.0.26';

const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();

function tidy(x){
  x=clean(x);
  if(!x)return '';
  x=x.replace(/^134[-–]\s*2\s+lbs\s+beef\s+of\s+choice$/i,'1½-2 lbs beef of choice');
  x=x.replace(/^72\s+2\s+lbs\s+beef\s+of\s+choice$/i,'1½-2 lbs beef of choice');
  x=x.replace(/^1[%¥]\s*2[-–]\s*2\s+lbs\s+beef\s+(?:Ice|lce|of)?$/i,'1½-2 lbs beef of choice');
  x=x.replace(/^1[¥%]+\s*2\s+chili$/i,'1½-2 chili');
  x=x.replace(/^lbs\s+beef\s+of\s*$/i,'1½-2 lbs beef of choice');
  x=x.replace(/^lbs\s+beef\s*$/i,'2 lbs beef');
  x=x.replace(/^2\s+lbs\s+beef\s+of\s*$/i,'2 lbs beef of choice');
  x=x.replace(/^\s*cup\s+sweet\s+chili\s+sauce$/i,'½ cup sweet chili sauce');
  x=x.replace(/^\s*cup\s+soy\s+sauce$/i,'½ cup soy sauce');
  x=x.replace(/^4\s+CUP\s+SOY$/i,'½ cup soy sauce');
  x=x.replace(/^2\s+tbsp\s+srirac\b/i,'2 tbsp sriracha');
  x=x.replace(/^srirac\b/i,'sriracha');
  x=x.replace(/^Honey\s+(?:Zh|2h|Z[hH])$/i,'Honey');
  x=x.replace(/^Ys\s+(?=cup\s+lime\s+juice\b)/i,'½ ');
  x=x.replace(/^½\s+cup\s+2\s+orange\s+juice$/i,'½ cup orange juice');
  x=x.replace(/^4\s+1\s+tbsp\s+soy\s+sauce$/i,'1 tbsp soy sauce');
  x=x.replace(/^cloves\s+ga\s*ic\.?$/i,'4 cloves garlic, minced');
  x=x.replace(/^1t\s+sesame oil$/i,'1 tsp sesame oil');
  x=x.replace(/^3\s+tbs\s+Soy$/i,'3 tbsp soy sauce');
  x=x.replace(/^2\s+tbsp\s+Worce$/i,'2 tbsp Worcestershire sauce');
  x=x.replace(/^1\s+tsp\s+tsp\s+black\s+oregano$/i,'1 tsp black oregano');
  x=x.replace(/^1\s+tsp\s+grou\s*nd$/i,'1 tsp ground');
  x=x.replace(/^1\s+tbsp\s+toasted\s+sesame\s*[.]?$/i,'1 tbsp toasted sesame');
  x=x.replace(/^½\s+cup\s+lime\]$/i,'½ cup lime');
  x=x.replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/gi,'lb');
  x=x.replace(/\b1\s*\/\s*2\b/g,'½').replace(/\b1\s*\/\s*4\b/g,'¼').replace(/\b3\s*\/\s*4\b/g,'¾');
  x=x.replace(/\s*;\s*$/,'').replace(/\s{2,}/g,' ').trim();
  if(/^(?:2\s+tbsp\s+sau|1\s+tbsp\s+sc\s+sauce)$/i.test(x))return '';
  return x;
}

function key(x){
  return tidy(x).toLowerCase()
    .replace(/\b\d+(?:[.]\d+)?\b/g,' ')
    .replace(/[¼½¾]/g,' ')
    .replace(/\b(?:tbsp|tsp|cups?|cup|lbs?|oz|cloves?|pieces?|small|large|fresh|finely|freshly|minced|grated|ground|thinly|sliced|of|choice)\b/g,' ')
    .replace(/[^a-z]+/g,' ').trim();
}

function cleanRecipe(r){
  let arr=(Array.isArray(r.ingredients)?r.ingredients:[]).map(tidy).filter(Boolean);

  // Remove OCR fragments only when the complete ingredient is already present.
  const hasWorc=arr.some(x=>/\bWorcestershire\s+sauce\b/i.test(x));
  const hasSoy=arr.some(x=>/\bsoy\s+sauce\b/i.test(x));
  const hasOil=arr.some(x=>/\b(?:olive|sesame)\s+oil\b/i.test(x));
  arr=arr.filter(x=>{
    if(hasWorc&&/^2\s+tbsp\s+sau$/i.test(x))return false;
    if(hasSoy&&/^1\s+tbsp\s+sc\s+sauce$/i.test(x))return false;
    if(hasOil&&/^Worcestershire\s+½\s+cup\s+olive\s+oil$/i.test(x))return false;
    return true;
  });

  const out=[];
  for(const x of arr){
    const k=key(x);
    if(!k)continue;
    const ix=out.findIndex(y=>key(y)===k);
    if(ix<0)out.push(x);
    else if(x.length>out[ix].length)out[ix]=x;
  }
  return {...r,ingredients:out};
}

async function postProcess(id){
  const {data,error}=await sb.from('cc_import_items').select('extracted_text').eq('id',id).single();
  if(error||!data?.extracted_text)return null;
  let payload;
  try{payload=JSON.parse(data.extracted_text)}catch{return null}
  if(!Array.isArray(payload.recipes))return null;
  const recipes=payload.recipes.map(cleanRecipe);
  payload.version=27;
  payload.recipes=recipes;
  const {error:updateError}=await sb.from('cc_import_items').update({extracted_text:JSON.stringify(payload)}).eq('id',id);
  if(updateError)throw Error(updateError.message);
  return recipes;
}

function installReviewCleanup(recipes){
  if(window.__ccV27ReviewCleanup)return;
  window.__ccV27ReviewCleanup=true;
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.rub-review');
    if(!button)return;
    const index=Number(button.dataset.i);
    const recipe=recipes[index];
    if(!recipe)return;
    setTimeout(()=>{
      const field=document.querySelector('#rubForm textarea[name="ingredients"]');
      if(field)field.value=(recipe.ingredients||[]).join('\n');
    },0);
  },true);
}

export async function processImageImport(id){
  await processV26(id);
  const recipes=await postProcess(id);
  if(recipes)installReviewCleanup(recipes);
}
export const reviewImageImport=processImageImport;
