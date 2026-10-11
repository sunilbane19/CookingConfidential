// Shared recipe structure rules for client-side extraction and rescue.
export const INGREDIENT_HEADING=/^(?:ingredients?|general ingredients?|what you need|ingredient list)\s*:?[ \t]*$/i;
export const METHOD_HEADING=/^(?:method|directions?|instructions?|preparation|preparations|steps?|cooking steps|recipe steps|cooking instructions|step[- ]by[- ]step(?: [a-z0-9&/ -]+)? instructions?|(?:[a-z0-9&/ -]+ )?(?:cooking|pressure cooker) instructions?|preparation steps|recipe method|cooking method|procedure)\s*:?[ \t]*$/i;
export const NOTES_HEADING=/^(?:notes?|nutrition|special equipment|make[- ]?ahead(?: and storage)?|video|comments|related articles|more ideas|reviews)\b/i;
export const GENERIC_HEADING=/^(?:ingredients?|general ingredients?|what you need|ingredient list|method|directions?|instructions?|preparation|preparations|steps?|cooking steps|recipe steps|cooking instructions|step[- ]by[- ]step(?: [a-z0-9&/ -]+)? instructions?|(?:[a-z0-9&/ -]+ )?(?:cooking|pressure cooker) instructions?|preparation steps|recipe method|cooking method|procedure|notes?|nutrition|special equipment|make[- ]?ahead(?: and storage)?|video|comments|related articles|more ideas|reviews|description|servings?|recipe)\s*:?[ \t]*$/i;
export function parseLabeledRecipeText(raw,{sourceType='generic'}={}){
  const isPdf=sourceType==='pdf';
  const a=String(raw??'').replace(/\r/g,'')
    .split('\n')
    .map(v=>String(v).replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim())
    .filter(Boolean)
    .filter(x=>!isPdf||!/^[-=]{2,}\s*Page\s+\d+$/i.test(x));
  const ii=a.findIndex(x=>INGREDIENT_HEADING.test(x)); if(ii<0)return null;
  const mi=a.findIndex((x,i)=>i>ii&&METHOD_HEADING.test(x));
  const ni=mi>=0?a.findIndex((x,i)=>i>mi&&NOTES_HEADING.test(x)):-1;
  const end=ni>=0?ni:a.length;
  const before=a.slice(0,ii).filter(x=>!GENERIC_HEADING.test(x));
  const pdfMeta=/^(?:prep|cook|total|rest|active)\s*time\s*:/i;
  const name=before.find(x=>x.length>=3&&x.length<=160&&!pdfMeta.test(x))||'Imported recipe';
  const description=before.filter(x=>x!==name&&!pdfMeta.test(x)).join(' ');
  const strip=(s)=>String(s).replace(/^\s*[-*+•·]\s*/,'').replace(/^\s*\d+[.)]\s*/,'').trim();
  let ingredients=a.slice(ii+1,mi>=0?mi:end).map(strip).filter(Boolean);
  let method=a.slice(mi+1,end).map(strip).filter(Boolean);
  if(isPdf){
    const ingredientLike=x=>/\d|[½¼¾⅓⅔⅛⅜⅝⅞]|\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|sticks?|pieces?|eggs?|pinch)\b|^(?:salt|pepper|freshly ground)\b/i.test(x);
    ingredients=ingredients.filter(x=>ingredientLike(x)||/:/.test(x));
    const joined=[];
    let current='';
    for(const line of method){
      if(/^\d+[.)]\s*/.test(line)){if(current)joined.push(current);current=line.replace(/^\d+[.)]\s*/,'').trim();continue;}
      current=current?current+' '+line:line;
    }
    if(current)joined.push(current);
    method=joined;
  }
  return {name,description,ingredients,method,notes:ni>=0?a.slice(ni+1).map(strip):[],unassigned:[]};
}
