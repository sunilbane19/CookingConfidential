const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();

const GENERIC=/^(recipe|recipes|ingredients?|ingredient list|the ingredients|method|the method|directions?|the directions|instructions?|the instructions|preparation|the preparation|steps?|the steps|contents?|index|introduction|notes?|tips?|storage|serving suggestions?|servings?|yield)[:.]?$/i;
const SECTION={
  ingredients:/^(?:the\s+)?ingredients?(?:\s+list)?\s*:?$/i,
  method:/^(?:the\s+)?(?:instructions?|method|directions?|preparation|steps?|stages?)\s*:?$/i,
  notes:/^(?:the\s+)?(?:notes?|storage|serving suggestions?)\s*:?$/i
};
// A component heading can contain descriptive words before the culinary noun.
const COMPONENT=/^(?:\d+[.)]?\s*)?(?:the\b.*\b(?:marinade|glaze|sauce|rub|dressing|paste|filling|stuffing|topping|mixture|aromatics?|seasoning|spice blend|velveting|brine|batter|coating|garnish|cooking|chicken|beef|pork|fish|vegetables?)\b|for\b.*\b(?:cooking|serving|garnish|sauce|chicken|beef|pork|fish|vegetables?)\b)$/i;
const STEP=/^(?:step|stage)\s*\d+\s*[:.-]?/i;
const UNIT=/\b(?:g|gm|kg|mg|ml|l|oz|lb|lbs|tsp|tbsp|cup|cups|pint|pints|quart|quarts|clove|cloves|slice|slices|piece|pieces|can|cans|packet|packets|bunch|bunches|sprig|sprigs|pinch|pinches|litre|litres|liter|liters)\.?\b/i;
const NUMBER=/\b\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛⅜⅝⅞])?\b/;
const META=/^(?:prep|preparation|cook|cooking|steam|steaming|chill|chilling|fry|frying|rest|resting|freeze|freezing|yield|makes?|serves?|servings?|total|active|inactive|time|difficulty|cuisine|course)\b/i;

function isGarbage(s){
  const x=clean(s); if(!x)return true;
  if(/[©®™]/.test(x))return true;
  if(/\b(?:follow|subscribe|like|share|save|comment|link in bio|learn more)\b/i.test(x) && !UNIT.test(x))return true;
  return false;
}

function isIngredientLike(s){
  const x=clean(s); if(!x||GENERIC.test(x)||SECTION.method.test(x)||SECTION.notes.test(x)||STEP.test(x))return false;
  if(COMPONENT.test(x))return false;
  if(/^\d+[.)]\s+/.test(x))return true;
  if(NUMBER.test(x)&&UNIT.test(x))return true;
  if(/\b(?:to taste|as needed|as required|for frying|for garnish|for serving)\b/i.test(x))return true;
  if(/\t/.test(String(s))&&NUMBER.test(x))return true;
  return false;
}

function titleCaseScore(s){
  const x=clean(s); if(!x||x.length<3||x.length>90||GENERIC.test(x)||COMPONENT.test(x)||STEP.test(x)||META.test(x))return false;
  const w=x.replace(/^\d+[.)]?\s*/,'').split(/\s+/); if(w.length>12)return false;
  const caps=w.filter(v=>/^[A-Z][A-Za-z'&-]*[A-Za-z'&-]*$/.test(v)).length;
  return caps>=Math.max(1,Math.ceil(w.length*.35));
}

// Some DOCX files have no heading styles and introduce the recipe with a sentence
// such as “Here is the complete Marion-Inspired Twice-Cooked Pork Bites recipe…”.
// Extract the recipe title from that sentence instead of treating the whole sentence
// as the recipe name.
function embeddedTitle(s){
  const x=clean(s);
  const m=x.match(/\b(?:complete|full|featured|following)\s+(.+?)\s+recipe\b/i);
  return m?clean(m[1].replace(/[,:;.!?]+$/,'')):'';
}

function makeRecipe(name){return {name:clean(name)||'Imported recipe',description:'',cuisine:'',course:'',recipe_type:'Dish',servings:'',ingredients:[],method:[],notes:[]};}

export function parseDocx(html,fileName='Imported document'){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const nodes=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')]
    .map(e=>({raw:e.textContent||'',text:clean(e.textContent||''),tag:e.tagName.toLowerCase()}))
    .filter(n=>n.text);
  if(!nodes.length)return[];

  // Section aliases such as “The Ingredients” and “The Steps” are common in
  // exported/generated DOCX files, even when Word heading styles are absent.
  const candidates=[]; let section='';
  for(let i=0;i<nodes.length;i++){
    const t=nodes[i].text;
    if(SECTION.ingredients.test(t)){section='ingredients';continue;}
    if(SECTION.method.test(t)){section='method';continue;}
    if(SECTION.notes.test(t)){section='notes';continue;}
    if(section&&COMPONENT.test(t))continue;
    if(embeddedTitle(t))candidates.push(i);
    else if(titleCaseScore(t)){
      if(!section || section==='method' || section==='notes')candidates.push(i);
    }
  }

  const recipeHeads=candidates.filter((idx,pos)=>{
    const end=pos+1<candidates.length?candidates[pos+1]:nodes.length;
    return nodes.slice(idx+1,end).some(n=>SECTION.ingredients.test(n.text)||SECTION.method.test(n.text));
  });

  // If the document starts directly with a descriptive recipe sentence followed
  // by “The Ingredients”, the embedded-title candidate above is enough. As a
  // fallback for simple single-recipe DOCX files, use the first content node
  // before the first recognised section as the recipe title.
  let heads=recipeHeads;
  if(!heads.length){
    const firstSection=nodes.findIndex(n=>SECTION.ingredients.test(n.text)||SECTION.method.test(n.text));
    if(firstSection>0){
      const titleIndex=nodes.slice(0,firstSection).findIndex(n=>!GENERIC.test(n.text)&&!META.test(n.text));
      if(titleIndex>=0)heads=[titleIndex];
    }
  }
  if(!heads.length)return[];

  const recipes=[];
  for(let h=0;h<heads.length;h++){
    const start=heads[h],end=h+1<heads.length?heads[h+1]:nodes.length;
    const sourceTitle=nodes[start].text;
    const r=makeRecipe(embeddedTitle(sourceTitle)||sourceTitle);
    let current='';
    for(const n of nodes.slice(start+1,end)){
      const t=n.text;
      if(SECTION.ingredients.test(t)){current='ingredients';continue;}
      if(SECTION.method.test(t)){current='method';continue;}
      if(SECTION.notes.test(t)){current='notes';continue;}
      if(isGarbage(t))continue;

      if(current==='ingredients'){
        if(COMPONENT.test(t)){r.ingredients.push(t);continue;}
        if(!STEP.test(t))r.ingredients.push(clean(t));
      }else if(current==='method'){
        r.method.push(clean(t));
      }else if(current==='notes'){
        r.notes.push(clean(t));
      }
    }
    r.ingredients=[...new Set(r.ingredients)].filter(Boolean);
    r.method=[...new Set(r.method)].filter(Boolean);
    r.notes=[...new Set(r.notes)].filter(Boolean);
    if(r.ingredients.length||r.method.length)recipes.push(r);
  }

  return recipes.length?recipes:[makeRecipe(clean(fileName.replace(/\.[^.]+$/,'')))];
}
