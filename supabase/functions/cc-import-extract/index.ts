import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";
import { Buffer } from "node:buffer";
const C={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,"Content-Type":"application/json"}});
const clean=(s:any)=>String(s??"").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
const cleanMarkdown=(s:any)=>String(s??"")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
  .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)(]*\))*\)/g,"$1")
  .replace(/\[([^\]]+)\]\s*\[[^\]]*\]/g,"$1")
  .trim();
const cleanRecipeLine=(s:any)=>clean(cleanMarkdown(s))
  .replace(/^\s*#{1,6}\s*/,"")
  .replace(/^\s*(?:[-*+•·])\s*/,"")
  .replace(/^\s*\d+[.)]\s*/,"")
  .trim();
const isPageNoise=(s:string)=>{
  const x=String(s??"").replace(/\s+/g," ").trim();
  if(!x)return true;
  return /^(?:\d+\s+(?:ratings?|reviews?)\s*\|\s*rate now|rate now|print|share|save|masterclass certificates?|certificates?)$/i.test(x)
    || /^(?:\d+\s*(?:min|mins|minutes|hr|hrs|hours))$/i.test(x)
    || /^(?:(?:prep|cook|total)\s*time\s*[:\-]?\s*\d+\s*(?:min|mins|minutes|hr|hrs|hours))$/i.test(x)
    || /^(?:ratings?|reviews?)\s*[:\-]?\s*\d+$/i.test(x);
};
const cleanDescription=(s:any)=>{
  const v=String(s??"").split(/\n+/).map(x=>clean(x)).filter(Boolean).filter(x=>!isPageNoise(x))
    .filter(x=>!/<\/?(?:script|style|noscript|iframe)\b/i.test(x))
    .filter(x=>/(?:window\.|document\.|google_(?:tags|analytics)|gtag\s*\(|dataLayer|__NEXT_DATA__|googletagmanager|pagead|doubleclick|ojra\.net|bat\.bing\.com)/i.test(x)===false)
    .join(" ").trim();
  return v&&v.length<500?v:null;
};
const lines=(s:string)=>clean(s).split("\n").map(x=>cleanRecipeLine(x).replace(/^\s*>\s*/,"").replace(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/,"$1").trim()).filter(Boolean);
const isNutritionNoise=(s:string)=>{
  const x=String(s??"").replace(/\s+/g," ").trim();
  return /^(?:nutrition(?:\s*:\s*(?:per serving)?)?|units?|metric us|keep the screen awake.*|good food app.*|ad|low|high)\s*:?/i.test(x)
    || /^(?:kcal|calories?|fat|saturates?|carbs?|carbohydrates?|sugars?|fibre|fiber|protein|salt)\s*[:]?\s*\d+(?:\.\d+)?\s*[a-z%]*$/i.test(x)
    || /^(?:kcal|calories?|fat|saturates?|carbs?|carbohydrates?|sugars?|fibre|fiber|protein|salt)\b/i.test(x);
};
const cleanUrlMethodLine=(s:string)=>{
  return cleanRecipeLine(s)
    .replace(/(?:^|\s)#{1,6}\s*step\s+(\d+)\s*[:.)-]?\s*/gi,(_m,n)=>' Step '+n+': ')
    .replace(/^step\s+(\d+)\s*[:.)-]?\s*/i,(_m,n)=>'Step '+n+': ')
    .trim();
};
const ih=/^(ingredients?|ingredient list|what you need|ingredients required|साहित्य)\s*[:\-–—,]?\s*$/i;
const mh=/^(method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure|प्रक्रिया)\s*[:\-–—,]?\s*$/i;
function language(t:string){if(/[ऀ-ॿ]/.test(t))return /ळ|ऱ|ऍ|ऑ|ॲ/.test(t)?"Marathi":"Hindi";if(/[\u0980-\u09FF]/.test(t))return"Bengali";if(/[\u0A80-\u0AFF]/.test(t))return"Gujarati";if(/[\u0A00-\u0A7F]/.test(t))return"Punjabi";if(/[\u0B80-\u0BFF]/.test(t))return"Tamil";if(/[\u0C00-\u0C7F]/.test(t))return"Telugu";if(/[\u0C80-\u0CFF]/.test(t))return"Kannada";if(/[\u0D00-\u0D7F]/.test(t))return"Malayalam";if(/[\u0600-\u06FF]/.test(t))return"Arabic";if(/[\u0400-\u04FF]/.test(t))return"Russian";if(/[\u0370-\u03FF]/.test(t))return"Greek";return"English";}
function cleanFilenameTitle(file:string,fallback="Imported recipe"){
  const v=String(file||fallback)
    .replace(/\\.[^.]+$/i,"")
    .replace(/[_-]+/g," ")
    .replace(/\\s*\\(\\d+\\)\\s*$/,"")
    .replace(/\\s*\\[\\d+\\]\\s*$/,"")
    .replace(/\\s+/g," ")
    .replace(/\\brecipe\\b$/i,"")
    .trim();
  return v||fallback;
}
function recipeTitleFromSource(text:string,file:string,sectionStart?:number){
  const raw=String(text||"");
  const beforeRaw=sectionStart==null?raw:raw.slice(0,sectionStart);
  const before=/<(?:html|body|head|script|div|section|article|h[1-6])\\b/i.test(beforeRaw)?htmlTextForParsing(beforeRaw):beforeRaw;
  const fileTitle=cleanFilenameTitle(file);
  const blocked=/^(?:skip to (?:main )?content|home|recipes?|save recipe|print|share|ad|advertisement|good food team|easy|alternatives?|complete the dish|nutrition(?:\\s*:\\s*per serving)?|loading|rate(?: now)?|comments?|questions?|tips?|image(?:\\s+\\d+)?(?::.*)?|good food logo.*|subscribe(?: now)?|get .*all access|showing items .* of .*|learn how to .*|freezable|keep the screen awake.*|recipe from .*|units?|metric us|updated:?|published:?|follow|like|\\d+[dmy]$)$/i;
  const urlNoise=/^(?:search|food52(?:\\.com)?|https?:\\/\\/(?:www\\.)?food52\\.com)\\b/i;
  const metadata=/^(?:by\\s+|updated\\s*:|published\\s*:|prep(?:aration)?\\s*time|cook(?:ing)?\\s*time|total\\s*time|serves?\\b|servings?\\b|yield\\b|\\d+\\s*(?:ratings?|reviews?)) /i;
  const titleish=(x:string)=>{
    const v=String(x||"").replace(/\\s+/g," ").trim();
    if(!v||v.length<3||v.length>100||blocked.test(v)||urlNoise.test(v)||metadata.test(v))return false;
    if(/^[-_=|¦\\[\\]]+$/.test(v)||/^---?\\s*page\\s+\\d+\\s*---?$/i.test(v))return false;
    if(/[.!?]$/.test(v))return false;
    if(/^(?:ingredients?|directions?|instructions?|method|preparation|steps?)\\b/i.test(v))return false;
    return v.split(/\\s+/).length<=14;
  };
  const score=(x:string,distance:number)=>{
    const v=String(x||"").trim(), w=v.split(/\\s+/).filter(Boolean);
    if(!titleish(v))return -999;
    const caps=w.filter(q=>/^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’&-]*$/.test(q)).length;
    let s=10-Math.min(distance,12)*.35;
    if(w.length>=2&&w.length<=9)s+=3;
    if(caps>=Math.max(2,Math.ceil(w.length*.5)))s+=5;
    if(/[,:;]/.test(v))s-=1;
    if(/\\b(?:recipe|sauce|cake|curry|salad|chutney|kibbeh|tzatziki|keema|matar|fritters?|dip|bread|chicken|fish|mutton|beef|pasta|rice|dal|soup|stew|cookies?|biscuits?)\\b/i.test(v))s+=1;
    return s;
  };
  const ls=before.split("\\n").map(x=>cleanRecipeLine(x)).filter(Boolean);
  const start=Math.max(0,ls.length-28);
  const local=ls.slice(start);
  const candidates:any[]=[];
  for(let k=0;k<local.length;k++){
    const v=local[k];
    const d=local.length-1-k;
    const sc=score(v,d);
    if(sc>-100)candidates.push({x:v,score:sc});
    if(k+1<local.length){
      const pair=(v+" "+local[k+1]).replace(/\\s+/g," ").trim();
      const psc=score(pair,d)+1.5;
      if(psc>-100)candidates.push({x:pair,score:psc});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return cleanRecipeLine(candidates[0]?.x||fileTitle)||fileTitle;
}
function isBadUrlTitle(s:string){
  const x=cleanRecipeLine(s);
  return /^(?:skip to main content|home|recipes?|save recipe|print|share|ad|advertisement|good food team|easy|alternatives?|complete the dish|nutrition|loading)$/i.test(x)
    || isUrlTitleNoise(x);
}
function structuredRecipe(text:string,isUrl=false){
  const re=/<script[^>]*>([\s\S]*?)<\/script>/gi;
  const candidates:any[]=[];
  const walk=(v:any)=>{if(!v)return;if(Array.isArray(v)){for(const x of v)walk(x);return}if(typeof v==="object"){if(v.recipeIngredient||v.recipeInstructions)candidates.push(v);for(const k of Object.keys(v))walk(v[k]);}};
  for(const m of String(text||"").matchAll(re)){const body=String(m[1]||"");if(!/recipeIngredient|recipeInstructions/i.test(body))continue;try{walk(JSON.parse(body.replace(/&quot;/g,'"')))}catch{}}
  const r=candidates.find(x=>Array.isArray(x.recipeIngredient)&&x.recipeIngredient.length&&x.recipeInstructions);
  if(!r)return null;
  const method=Array.isArray(r.recipeInstructions)?r.recipeInstructions.map((x:any)=>typeof x==="string"?x:x?.text||x?.name||"").filter(Boolean).join("\n"):String(r.recipeInstructions||"");
  const structuredName=isUrl?cleanRecipeLine(r.name||""):clean(r.name||"");
  const name=isUrl?(structuredName&&!isBadUrlTitle(structuredName)?structuredName:recipeTitleFromSource(text,"Imported recipe")):structuredName;
  const ingredients=r.recipeIngredient.map((x:any)=>isUrl?cleanRecipeLine(x):clean(x))
    .filter(Boolean)
    .filter((x:string)=>!isUrl||!isNutritionNoise(x));
  const methodValue=isUrl?clean(method.split("\n").map(cleanUrlMethodLine).join("\n")):clean(method);
  return {name,description:cleanDescription(r.description),ingredients,method:methodValue,cuisine:r.recipeCuisine||null,course:r.recipeCategory||null,servings:isUrl?(cleanRecipeLine(String(r.recipeYield||"").replace(/\*+/g,""))||null):(r.recipeYield||null)};
}
function parseLabeledSections(text:string,file:string,isUrl=false){
  const raw=String(text||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  const src=raw.split("\n").map(x=>x.trim()).filter(Boolean);
  if(src.length<5)return null;
  const isSection=(x:string,re:RegExp)=>re.test(x.replace(/^#{1,6}\s*/,"").replace(/^\*\*|\*\*$/g,"").trim());
  const descRe=/^description\s*[:\-–—]?\s*$/i;
  const ingRe=/^(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\s*[:\-–—]?\s*$/i;
  const methRe=/^(?:method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\s*[:\-–—]?\s*$/i;
  const di=src.findIndex(x=>isSection(x,descRe));
  const ii=src.findIndex(x=>isSection(x,ingRe));
  const mi=src.findIndex(x=>isSection(x,methRe));
  if(ii<0||mi<=ii)return null;

  let name="";
  let description="";
  if(di>=0&&di<ii){
    if(di===0){
      // Our normal text export: Description / Recipe name / description / Ingredients / Method.
      name=clean(src[1]||"");
      description=cleanDescription(src.slice(2,ii).join(" "));
    }else{
      // Title before the Description heading.
      name=clean(src[di-1]||"");
      description=cleanDescription(src.slice(di+1,ii).join(" "));
    }
  }else{
    // No explicit Description section: use the first useful line as title.
    name=isUrl?recipeTitleFromSource(raw,file,raw.indexOf(src[ii])):clean(src[0]||file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  }
  const strip=(s:string)=>s
    .replace(/^\s*#{1,6}\s*/,"")
    .replace(/^\s*[-*+•·]\s*/,"")
    .replace(/^\s*\d+[.)]\s*/,"")
    .replace(/^\s*(?:\*\*|__)/,"")
    .replace(/(?:\*\*|__)\s*$/,"")
    .trim();
  const ingredients=src.slice(ii+1,mi).map(strip)
    .filter(x=>x&&!ingRe.test(x)&&!descRe.test(x)&&!isPageNoise(x))
    .filter(x=>!isUrl||!isNutritionNoise(x));
  const method=src.slice(mi+1)
    .map(x=>isUrl?cleanUrlMethodLine(strip(x)):strip(x))
    .filter(x=>x&&!methRe.test(x)&&!descRe.test(x)&&!isPageNoise(x))
    .join("\n");
  if(!name||ingredients.length<2||!method.trim())return null;
  const sm=raw.match(/(?:serves?|servings?|yield)\s*[:\-–—]?\s*([^\n]+)/i);
  return {name,description:description||null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:sm?cleanRecipeLine(sm[0]):null};
}

function parseMarkdownSections(text:string,file:string,isUrl=false){
  const raw=String(text||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  const im=raw.search(/(?:^|\n)\s*#{1,6}\s*Ingredients?\b[^\n]*/im);
  if(im<0)return null;
  const after=raw.slice(im);
  const dm=after.search(/(?:^|\n)\s*#{1,6}\s*(?:Directions?|Method|Instructions?|Preparation|Steps?)\b[^\n]*/im);
  if(dm<0)return null;
  const firstNl=after.indexOf("\n");
  const ingBlock=after.slice(firstNl>=0?firstNl+1:0,dm);
  const markerLine=after.slice(dm).match(/^[^\n]*/);
  const methodBlock=markerLine?after.slice(dm+markerLine[0].length):"";
  const strip=(s:string)=>cleanRecipeLine(s)
    .replace(/^step\s+(\d+)\s*[:.)-]?\s*/i,(_m,n)=>'Step '+n+': ')
    .trim();
  const cleanLines=(s:string)=>s.split("\n").map(strip).filter(x=>x&&!isPageNoise(x)&&!/^(?:featured video|see all food52 videos)$/i.test(x));
  const ingredients=cleanLines(ingBlock)
    .filter(x=>!/^(?:shell|filling|ingredients?|nutrition|nutrition\s*:|units?|metric\s+us|good food app|keep the screen awake|ad)$/i.test(x))
    .filter(x=>!/^\s*(?:kcal|calories?|fat|saturates?|carbs?|carbohydrates?|sugars?|fibre|fiber|protein|salt)\b/i.test(x))
    .filter(x=>!/^\s*(?:low|high)\s*$/i.test(x));
  const method=cleanLines(methodBlock)
    .filter(x=>!/^(?:shell|filling|directions?|method|instructions?|preparation|steps?|recipe tips)$/i.test(x))
    .join("\n");
  if(ingredients.length<2||!method)return null;
  const title=isUrl?recipeTitleFromSource(raw,file,im):clean((raw.match(/(?:^|\n)\s*#\s+([^\n]+)/)||[])[1]||file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  const sm=raw.match(/(?:serves?|servings?|yield)\s*[:\-–—]?\s*([^\n]+)/i);
  return {name:title,description:null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:sm?cleanRecipeLine(sm[0]):null};
}

function parsePdfRecipe(text:string,file:string){
  const raw=String(text||"")
    .replace(/\\r/g,"")
    .replace(/\\u00a0/g," ")
    .replace(/[\\uFB00-\\uFB06]/g,m=>({"ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"ft","ﬆ":"st"}[m]||m));
  const src=raw.split("\\n")
    .map(x=>x.replace(/\\s+/g," ").trim())
    .filter(Boolean)
    .filter(x=>!/^[-=]{2,}\\s*Page\\s+\\d+/i.test(x))
    .filter(x=>!/^Page\\s+\\d+$/i.test(x));
  if(src.length<5)return null;

  const heading=(x:string)=>cleanRecipeLine(x).replace(/^#{1,6}\\s*/,"").trim();
  const isIng=(x:string)=>/^(?:ingredients?|what you need|ingredients required|shopping list)\\s*:?\\s*$/i.test(heading(x));
  const isMethod=(x:string)=>/^(?:directions?|instructions?|method|preparation|preparations|steps?|recipe method|cooking method|procedure)\\s*:?\\s*$/i.test(heading(x));
  const isStop=(x:string)=>/^(?:special equipment|notes?|make-ahead and storage|nutrition(?: facts)?|reviews?|related articles|related recipes?|comments?|video|recipe tips?|top tips?)\\b/i.test(heading(x));
  const noise=/^(?:get|the app|app|save|rate|print|share|jump to|keep (?:the )?screen awake|credit:|advertisement|advert|reviews?\\s*\\(|featured tweaks|most helpful|related articles|editorial guidelines|privacy|contact|peopleinc\\.|follow us|newsletters?)\\b/i;
  const stripItem=(x:string)=>cleanRecipeLine(x).replace(/^\\s*[|¦\\]\\[=_-]+\\s*/,"").trim().replace(/^step\\s+\\d+\\s*[:.)-]?\\s*/i,"");
  const ingredientLike=(x:string)=>{
    const v=stripItem(x);
    if(!v||noise.test(v)||isStop(v))return false;
    if(/^(?:for\\s+.+:|shell|filling|ingredients?)$/i.test(v))return false;
    return /\\d/.test(v)||/[½¼¾⅓⅔⅛⅜⅝⅞]/.test(v)
      || /\\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|sticks?|pieces?|eggs?)\\b/i.test(v)
      || /^(?:freshly ground|salt and pepper|black pepper|salt)\\b/i.test(v);
  };
  const cleanIngredient=(x:string)=>{
    let v=stripItem(x);
    v=v.replace(/^(\\d+)\\s*([½¼¾⅓⅔⅛⅜⅝⅞])\\s*/,"$1 $2 ");
    v=v.replace(/^(\\d+)\\s*\\/\\s*(\\d+)/,"$1/$2");
    v=v.replace(/^(\\d+)\\s*([A-Za-z])(?=\\s)/,"$1$2");
    return v;
  };
  const ingIndexes:number[]=[];
  for(let i=0;i<src.length;i++)if(isIng(src[i]))ingIndexes.push(i);
  let best:any=null;

  for(const ii of ingIndexes){
    let mi=-1;
    let end=src.length;
    for(let j=ii+1;j<src.length;j++){
      if(isMethod(src[j])){mi=j;break;}
      if(isStop(src[j])){end=j;break;}
    }
    if(mi>=0){
      for(let j=mi+1;j<src.length;j++){if(isStop(src[j])){end=j;break;}}
    }
    const ingredientEnd=mi>=0?mi:end;
    const ingredients=src.slice(ii+1,ingredientEnd)
      .map(cleanIngredient)
      .filter(x=>x.length>1&&!noise.test(x)&&!isPageNoise(x)&&!isNutritionNoise(x))
      .filter(x=>!/^(?:for\\s+[^:]+:|fritters?|ingredients?)$/i.test(x))
      .filter(ingredientLike);

    const methodLines:string[]=[];
    if(mi>=0){
      let current="";
      const flush=()=>{if(current.trim()){methodLines.push(current.trim());current=""}};
      for(const rawLine of src.slice(mi+1,end)){
        const v=stripItem(rawLine);
        if(!v||noise.test(v)||isNutritionNoise(v))continue;
        if(/^step\\s+\\d+/i.test(rawLine)){flush();continue;}
        if(/^(?:shell|filling|for\\s+[^:]+:)\\s*$/i.test(v)){flush();continue;}
        current=current?current+" "+v:v;
      }
      flush();
    }
    const method=clean(methodLines.join("\\n"));
    if(ingredients.length<3)continue;
    if(mi>=0 && method.length<40)continue;

    const quantityScore=ingredients.reduce((n,x)=>n+(ingredientLike(x)?1:0),0);
    const methodScore=methodLines.length;
    const score=ingredients.length*5+quantityScore*2+Math.min(methodScore,8);
    if(!best||score>best.score){
      const name=recipeTitleFromSource(raw,file,src.slice(0,ii).join("\\n").length);
      best={score,name,description:null,ingredients:ingredients.slice(0,200),method,cuisine:null,course:null,servings:null};
      const serveLine=src.slice(0,ii).find(x=>/^(?:serves?|servings?|yield)\\b/i.test(x));
      if(serveLine)best.servings=cleanRecipeLine(serveLine);
      const descCandidates=src.slice(Math.max(0,ii-18),ii)
        .map(cleanRecipeLine)
        .filter(x=>x.length>=30&&x.length<500&&!noise.test(x)&&!isPageNoise(x)&&!isNutritionNoise(x))
        .filter(x=>!/^by\\s+/i.test(x)&&!/(?:published|first published|prep time|cook time|resting time|total time|jump to nutrition)/i.test(x))
        .filter(x=>x!==name);
      if(descCandidates.length)best.description=cleanDescription(descCandidates[0]);
    }
  }
  return best;
}
function htmlTextForParsing(input:string){
  return String(input||"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi," ")
    .replace(/<!--[\s\S]*?-->/g," ")
    // Preserve the boundaries that matter to recipe parsing before removing HTML.
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:li|p|div|section|article|header|footer|h[1-6])\s*>/gi,"\n")
    .replace(/<li\b[^>]*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
    .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)(]*\))*\)/g,"$1")
    .replace(/\[([^\]]+)\]\s*\[[^\]]*\]/g,"$1")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/[ \t]+/g," ")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n\s*\n\s*\n+/g,"\n\n")
    .trim();
}

function wprmFieldAll(html:string,className:string){
  const re=new RegExp("<(?:h[1-6]|div|span|p|li)[^>]*class=[\"']([^\"']*"+className+"[^\"']*)[\"'][^>]*>([\\s\\S]*?)</(?:h[1-6]|div|span|p|li)>","gi");
  const out:string[]=[];
  for(const m of html.matchAll(re)){
    const v=cleanRecipeLine(htmlTextForParsing(m[2]||""));
    if(v)out.push(v);
  }
  return out;
}
function parseWprmRecipe(text:string,file:string){
  const html=String(text||"");
  if(!/wprm-recipe-(?:container|name|ingredient|instruction)\b/i.test(html))return null;
  const names=wprmFieldAll(html,"wprm-recipe-name");
  const summaries=wprmFieldAll(html,"wprm-recipe-summary");
  const ingredients=wprmFieldAll(html,"wprm-recipe-ingredient").filter(x=>!isNutritionNoise(x)&&x.length>1);
  const methods=wprmFieldAll(html,"wprm-recipe-instruction").filter(x=>!isPageNoise(x)&&x.length>1).map(cleanUrlMethodLine);
  if(ingredients.length<2||!methods.length)return null;
  const badName=(x:string)=>!x||/^#?wprm[-\s]recipe[-\s]container\b/i.test(x)||/^recipe container\b/i.test(x);
  const name=names.find(x=>!badName(x))||recipeTitleFromSource(html,file);
  if(!name||badName(name))return null;
  const notes=wprmFieldAll(html,"wprm-recipe-notes");
  const servings=wprmFieldAll(html,"wprm-recipe-servings").find(x=>/\d/.test(x))||null;
  return {name:cleanRecipeLine(name),description:summaries.length?cleanDescription(summaries.join("\n")):null,ingredients:ingredients.slice(0,200),method:clean(methods.join("\n")),cuisine:null,course:null,servings,personal_notes:notes.length?notes.join("\n"):null};
}

function parseHtmlRecipeSections(text:string,file:string){
  const html=String(text||"");
  const headings=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m=>({level:Number(m[1]),raw:String(m[2]||""),text:cleanRecipeLine(htmlTextForParsing(m[2]||"")),start:m.index??0,end:(m.index??0)+m[0].length}));
  if(!headings.length)return null;
  const isIng=(s:string)=>/^(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\b/i.test(cleanRecipeLine(s));
  const isMethod=(s:string)=>/^(?:directions?|method|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\b/i.test(cleanRecipeLine(s));
  const ingIndex=headings.findIndex(h=>isIng(h.text));
  if(ingIndex<0)return null;
  const methodIndex=headings.findIndex((h,i)=>i>ingIndex&&isMethod(h.text));
  if(methodIndex<0)return null;
  const section=(i:number)=>{
    const start=headings[i].end;
    const end=i+1<headings.length?headings[i+1].start:html.length;
    return html.slice(start,end);
  };
  const itemLines=(fragment:string)=>{
    const items=[...fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(m=>cleanRecipeLine(htmlTextForParsing(m[1]||"")))
      .filter(Boolean);
    if(items.length)return items;
    return lines(htmlTextForParsing(fragment));
  };
  const ingredients=itemLines(section(ingIndex))
    .filter(x=>!isNutritionNoise(x)&&!isPageNoise(x)&&x.length>1)
    .slice(0,200);
  const method=itemLines(section(methodIndex))
    .map(cleanUrlMethodLine)
    .filter(x=>!isPageNoise(x)&&x.length>1)
    .join("\n");
  if(ingredients.length<2||!method.trim())return null;
  const h1=headings.find(h=>h.level===1&&h.text&&!isPageNoise(h.text));
  const name=cleanRecipeLine(h1?.text||recipeTitleFromSource(html,file));
  const beforeIngredients=html.slice(h1?.end??0,headings[ingIndex].start);
  const description=cleanDescription(htmlTextForParsing(beforeIngredients));
  return {name,description:description||null,ingredients,method:clean(method),cuisine:null,course:null,servings:null};
}
function parseTextRecipeHeadings(text:string,file:string,isUrl=false){
  if(!isUrl)return null;
  const raw=String(text||"");
  const normalized=/<(?:html|body|div|section|article|script|style)\b/i.test(raw)?htmlTextForParsing(raw):raw;
  const src=normalized.split("\n").map(x=>clean(x)).filter(Boolean);
  if(src.length<8)return null;

  const cleanHeading=(x:string)=>cleanRecipeLine(x).replace(/^#{1,6}\s*/,"").replace(/\s*[:\-–—]\s*$/,"").trim();
  const isIng=(x:string)=>/^(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\s*$/i.test(cleanHeading(x));
  const isMeth=(x:string)=>/^(?:directions?|instructions?|method|preparation|preparations|steps?)\s*$/i.test(cleanHeading(x));
  const isStop=(x:string)=>/^(?:notes?|nutrition(?: facts)?|special equipment|make-ahead and storage|video|comments?|related articles|related recipes?|more ideas|reviews?)\b/i.test(cleanHeading(x));
  const stripItem=(x:string)=>cleanUrlMethodLine(x).replace(/^▢\s*/,"").trim();
  const ingredientLike=(x:string)=>{
    const v=stripItem(x);
    if(!v||isPageNoise(v)||isNutritionNoise(v))return false;
    return /\d/.test(v)
      || /[½¼¾⅓⅔⅛⅜⅝⅞]/.test(v)
      || /\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|sticks?|pieces?|eggs?)\b/i.test(v)
      || /^(?:salt|pepper|freshly ground)\b/i.test(v);
  };
  const methodLike=(x:string)=>/\b(?:preheat|heat|cook|bake|roast|grill|fry|sauté|saute|boil|simmer|mix|combine|stir|add|place|put|pour|toss|season|rub|cover|remove|transfer|serve|sprinkle|brush|whisk|drain|squeeze|shape|form)\b/i.test(x);
  const h1=src.find(x=>/^#{1}\s+/.test(x));
  const title=h1?cleanRecipeLine(h1):"";
  let best:any=null;

  for(let i=0;i<src.length;i++){
    if(!isIng(src[i]))continue;
    let mi=-1;
    for(let j=i+1;j<src.length;j++){
      if(isMeth(src[j])){mi=j;break;}
      if(isStop(src[j]))break;
    }
    if(mi<0)continue;
    let end=src.length;
    for(let j=mi+1;j<src.length;j++){if(isStop(src[j])){end=j;break;}}
    const ingredients=src.slice(i+1,mi)
      .map(stripItem)
      .filter(x=>x.length>1)
      .filter(x=>!isPageNoise(x)&&!isNutritionNoise(x))
      .filter(x=>!/^(?:1x|2x|3x|for .*:|button|input)$/i.test(x))
      .filter(x=>x.toLowerCase().indexOf("image")!==0);
    const method=src.slice(mi+1,end)
      .map(stripItem)
      .filter(x=>x.length>1)
      .filter(x=>!isPageNoise(x)&&!isNutritionNoise(x))
      .filter(x=>!/^(?:featured video|see all food52 videos|button|input)$/i.test(x))
      .filter(x=>x.toLowerCase().indexOf("image")!==0)
      .join("\n");
    if(ingredients.length<3||!method.trim())continue;

    const quantityCount=ingredients.reduce((n,x)=>n+(ingredientLike(x)?1:0),0);
    const methodVerbCount=method.split("\n").reduce((n,x)=>n+(methodLike(x)?1:0),0);
    const prosePenalty=ingredients.reduce((n,x)=>n+(x.length>140&&!ingredientLike(x)?3:0),0);
    const score=ingredients.length*5+quantityCount*4+Math.min(methodVerbCount,8)*2-prosePenalty;

    if(!best||score>best.score){
      best={score,name:title||recipeTitleFromSource(raw,file),description:null,ingredients,method:clean(method),cuisine:null,course:null,servings:null,personal_notes:null};
    }
  }

  if(!best)return null;
  const titleIndex=h1?src.indexOf(h1):-1;
  if(titleIndex>=0){
    const nextHeading=src.findIndex((x,j)=>j>titleIndex&&/^#{1,6}\s+/.test(x));
    const descLines=src.slice(titleIndex+1,nextHeading>titleIndex?nextHeading:Math.min(src.length,titleIndex+12))
      .map(cleanRecipeLine)
      .filter(x=>x.length>=30&&x.length<500)
      .filter(x=>!isPageNoise(x)&&!isNutritionNoise(x))
      .filter(x=>!/^\[?(?:input|button|image)\b/i.test(x))
      .filter(x=>!/^(?:by|updated|published|jump to recipe|jump to video|save|rate|print)\b/i.test(x));
    if(descLines.length)best.description=cleanDescription(descLines[0]);
  }
  return best;
}
function parseRaw(text:string,file:string,isUrl=false){
  if(/\.pdf$/i.test(file)){const pdfRecipe=parsePdfRecipe(text,file);if(pdfRecipe)return pdfRecipe;}
  // URL readers may return raw publisher HTML. Try JSON-LD first, then strip
  // executable/page markup before any text parser sees the content.
  if(isUrl){
    const structured=structuredRecipe(text,true);
    if(structured?.ingredients?.length && structured.method)return structured;
    const wprmRecipe=parseWprmRecipe(text,file);
    if(wprmRecipe?.ingredients?.length && wprmRecipe.method)return wprmRecipe;
    const textHeadingRecipe=parseTextRecipeHeadings(text,file,true);
    if(textHeadingRecipe?.ingredients?.length && textHeadingRecipe.method)return textHeadingRecipe;
    const htmlRecipe=parseHtmlRecipeSections(text,file);
    if(htmlRecipe?.ingredients?.length && htmlRecipe.method)return htmlRecipe;
    text=htmlTextForParsing(text);
  }
  const labeled=parseLabeledSections(text,file,isUrl); if(labeled)return labeled;
  const markdown=parseMarkdownSections(text,file,isUrl); if(markdown)return markdown;
  const structured=structuredRecipe(text);
  if(structured?.ingredients?.length && structured.method)return structured;
  const raw=String(text||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  const fileTitle=clean(file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  const strip=(s:string)=>s.replace(/^\s*#{1,6}\s*/,"").replace(/^\s*[-*+•·]\s*/,"").replace(/^\s*\d+[.)]\s*/,"").replace(/^\s*(?:\*\*|__)/,"").replace(/(?:\*\*|__)\s*$/,"").trim();
  const sourceLines=raw.split("\n").map(x=>x.trim()).filter(Boolean).filter(x=>!isUrl||!isPageNoise(x));
  // Some publishers place a literal "Description" label before the recipe title.
  // Treat that label as metadata, not as the recipe name.
  if(/^description\s*:?$/i.test(sourceLines[0]||"")){
    const ingIdx=sourceLines.findIndex((x,idx)=>idx>1&&/^(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\b/i.test(x));
    if(ingIdx>2){
      const name=clean(sourceLines[1]);
      const description=clean(sourceLines.slice(2,ingIdx).join(" "));
      const methodIdx=sourceLines.findIndex((x,idx)=>idx>ingIdx&&/^(?:method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\b/i.test(x));
      if(methodIdx>ingIdx){
        const ingredients=sourceLines.slice(ingIdx+1,methodIdx).map(x=>strip(x)).filter(x=>x.length>1);
        const method=sourceLines.slice(methodIdx+1).map(x=>strip(x)).filter(x=>x.length>1).join("\n");
        const servingsMatch=raw.match(/(?:serves?|serving|servings|yield)\s*[:\-–—]?\s*(?:about\s+)?\d[^\n]*/i);
        if(name&&ingredients.length&&method.trim()){
          return {name,description:description||null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:servingsMatch?clean(servingsMatch[0]):null};
        }
      }
    }
  }
  const heading=(s:string)=>strip(s).replace(/[:\-–—]+\s*$/,"").trim();
  const isIngredients=(s:string)=>/^(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\b/i.test(heading(s));
  const isMethod=(s:string)=>/^(?:method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\b/i.test(heading(s));
  let i=sourceLines.findIndex(isIngredients);
  let m=sourceLines.findIndex((x,idx)=>idx>i&&isMethod(x));
  if(i>=0&&m>i){
    const ingredients=sourceLines.slice(i+1,m).map(strip)
      .filter(x=>x.length>1)
      .filter(x=>!/^(?:featured video|see all food52 videos)$/i.test(x))
      .filter(x=>!isNutritionNoise(x));
    const method=sourceLines.slice(m+1).map(cleanUrlMethodLine)
      .filter(x=>!/^(?:featured video|see all food52 videos|recipe tips)$/i.test(x))
      .join("\n");
    // Flattened-reader fallback: some URL readers return the whole page as one line.
  // In that case, locate section labels anywhere in the raw text.
  const ingPos=raw.search(/(?:^|\s)(?:#{1,6}\s*)?Ingredients?\b\s*[:\-–—]?/i);
  if(ingPos>=0){
    const afterIng=raw.slice(ingPos);
    const methMatch=afterIng.match(/(?:^|\s)(?:#{1,6}\s*)?(?:Directions?|Method|Instructions?|Preparation|Steps?)\b\s*[:\-–—]?/i);
    if(methMatch && methMatch.index!=null){
      const ingPart=afterIng.slice(0,methMatch.index);
      const methodPart=afterIng.slice(methMatch.index+methMatch[0].length);
      const ingredients=lines(ingPart)
        .filter(x=>!/^(?:ingredients?|directions?|method|instructions?|preparation|steps?|featured video|see all food52 videos)$/i.test(x))
        .filter(x=>!isNutritionNoise(x))
        .filter(x=>x.length>1);
      const method=lines(methodPart)
        .map(cleanUrlMethodLine)
        .filter(x=>!/^(?:directions?|method|instructions?|preparation|steps?|featured video|see all food52 videos|recipe tips)$/i.test(x))
        .join("\n");
      if(ingredients.length && method){
        const titleLine=sourceLines[0]||fileTitle;
        const servingsMatch=raw.match(/(?:serves?|serving|servings|yield)\s*[:\-–—]?\s*(?:about\s+)?\d[^\n]*/i);
        return {name:clean(titleLine),description:null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:servingsMatch?clean(servingsMatch[0]):null};
      }
    }
  }

  const name=clean(sourceLines[0]||fileTitle);
    const description=sourceLines.slice(1,i).filter(x=>!/(?:serves?|serving|servings|yield)\b/i.test(x)).join(" ");
    const servingsMatch=raw.match(/(?:serves?|serving|servings|yield)\s*[:\-–—]?\s*(?:about\s+)?\d[^\n]*/i);
    if(ingredients.length&&method.trim())return {name,description:clean(description)||null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:servingsMatch?clean(servingsMatch[0]):null};
  }
  const im=raw.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:ingredients?|ingredient list|what you need|ingredients required|shopping list)\s*[:\-–—]?\s*/im);
  if(im>=0){
    const after=raw.slice(im);
    const mm=after.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\s*[:\-–—]?\s*/im);
    if(mm>=0){
      const marker=after.slice(mm).match(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure)\s*[:\-–—]?\s*/im);
      const ingredients=lines(after.slice(0,mm))
        .filter(x=>!/^(?:ingredients?|directions?|instructions?|featured video|see all food52 videos)$/i.test(x))
        .filter(x=>!isNutritionNoise(x))
        .filter(x=>x.length>1);
      const method=lines(marker?after.slice(mm+marker[0].length):"")
        .map(cleanUrlMethodLine)
        .filter(x=>!/^(?:directions?|instructions?|featured video|see all food52 videos|recipe tips)$/i.test(x))
        .join("\n");
      if(ingredients.length&&method){
        const servingsMatch=raw.match(/(?:serves?|serving|servings|yield)\s*[:\-–—]?\s*(?:about\s+)?\d[^\n]*/i);
        return {name:clean(sourceLines[0]||fileTitle),description:null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:servingsMatch?clean(servingsMatch[0]):null};
      }
    }
  }
  const name=clean(sourceLines[0]||fileTitle);
  const description=sourceLines.slice(1).filter(x=>!/(?:serves?|serving|servings|yield)\b/i.test(x)).slice(0,3).join(" ");
  const servingsMatch=raw.match(/(?:^|\n)\s*(?:serves?|serving|servings|yield)\s*[:\-–—]?\s*(?:about\s+)?\d[^\n]*/i);
  const servings=servingsMatch?clean(servingsMatch[0]):null;
  const body=sourceLines.slice(1);const hi:string[]=[];const hm:string[]=[];let mode="ingredients";
  const ingredientLike=(x:string)=>/^(?:[\d½¼¾⅓⅔⅛⅜⅝⅞]|one\b|a\b|an\b|some\b)/i.test(x)||/\b(?:tbsp|tsp|tablespoons?|teaspoons?|cups?|lb|lbs|oz|ounces?|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|sticks?|pieces?)\b/i.test(x);
  const methodLike=(x:string)=>/\b(?:preheat|heat|cook|bake|roast|grill|smoke|cut|cube|slice|chop|mix|combine|stir|add|place|put|pour|toss|season|rub|cover|remove|transfer|serve|sprinkle|brush|whisk|simmer|boil|fry|saute|sauté|marinate)\b/i.test(x)&&x.length>20;
  for(const x of body){if(mode==="ingredients"&&methodLike(x)&&hi.length>=2){mode="method";hm.push(x);continue;}if(mode==="ingredients"&&ingredientLike(x)){hi.push(x);continue;}if(mode==="ingredients"&&hi.length>=2&&x.length>35){mode="method";hm.push(x);continue;}if(mode==="method")hm.push(x);}
  if(hi.length>=2&&hm.length)return {name,description:clean(description)||null,ingredients:hi.slice(0,200),method:clean(hm.join("\n")),cuisine:null,course:null,servings};
  return {name,description:clean(description)||null,ingredients:[],method:"",cuisine:null,course:null,servings};
}
function extractRecipeTips(text:string){
  const raw=String(text||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  const src=raw.split("\n").map(x=>x.trim()).filter(Boolean);
  const start=src.findIndex(x=>/^(?:#{1,6}\s*)?(?:recipe\s+tips?|top\s+tips?|tips?)\s*[:\-–—]?\s*$/i.test(x));
  if(start<0)return null;
  const stop=/^(?:#{1,6}\s*)?(?:nutrition(?:\s*:\s*per serving)?|ingredients?|method|directions?|instructions?|preparation|steps?|notes?|comments?,?\s*questions?\s+and\s+tips?|recipe from)\b/i;
  const out:string[]=[];
  for(let i=start+1;i<src.length;i++){
    const line=src[i];
    if(stop.test(line))break;
    if(isPageNoise(line)||isNutritionNoise(line))continue;
    if(/^(?:ad|advertisement|subscribe(?: now)?|keep the screen awake.*)$/i.test(line))break;
    const v=cleanRecipeLine(line);
    if(v)out.push(v);
  }
  return out.length?out.join("\n"):null;
}
function extractDescriptionAndNotes(sourceText:string){
  let raw=String(sourceText||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  if(/<html\b|<body\b|<div\b|<script\b/i.test(raw)) raw=htmlTextForParsing(raw);
  const src=raw.split("\n").map(x=>clean(x)).filter(Boolean);
  const heading=/^#{0,6}\s*(description|notes?)\s*[:\-–—]?\s*(.*)$/i;
  const boundary=/^#{0,6}\s*(?:ingredients?|method|directions?|instructions?|preparation|preparations|steps?|nutrition(?:\s*[:\-–—]?\s*per serving)?|recipe tips?|top tips?|tips?|comments?|questions?\s+and\s+tips?|recipe from)\b/i;
  let description:string|null=null;
  let notes:string|null=null;
  for(let i=0;i<src.length;i++){
    const m=src[i].match(heading);
    if(!m)continue;
    const kind=String(m[1]).toLowerCase();
    const first=cleanRecipeLine(m[2]||"");
    const out:string[]=[]; if(first)out.push(first);
    for(let j=i+1;j<src.length;j++){
      if(boundary.test(src[j])||heading.test(src[j]))break;
      if(isPageNoise(src[j])||isNutritionNoise(src[j]))continue;
      const v=cleanRecipeLine(src[j]); if(v)out.push(v);
    }
    const value=clean(out.join("\n"));
    if(/^description$/i.test(kind)&&value) description=description||value;
    if(/^notes?$/i.test(kind)&&value) notes=notes||value;
  }
  return {description,notes};
}
function cleanExtractedMethod(method:any){
  return String(method||"").split(/\n+/)
    .map(x=>cleanRecipeLine(x))
    .filter(Boolean)
    .filter(x=>!isPageNoise(x))
    .filter(x=>!isNutritionNoise(x))
    .filter(x=>!/^(?:advertisement|advert|sponsored|subscribe(?: now)?|sign\s*up|log\s*in|register|print|share|save(?: recipe)?|rate(?: this recipe)?|jump to recipe|skip to recipe|read more|you may also like|related recipes?)\b/i.test(x))
    .map(cleanUrlMethodLine)
    .filter(Boolean)
    .join("\n")
    .trim();
}
function finalizeParsedRecipe(recipe:any,sourceText:string){
  if(!recipe)return recipe;
  const meta=extractDescriptionAndNotes(sourceText);
  const tips=extractRecipeTips(sourceText);
  const noteParts=[meta.notes,tips].filter(Boolean).map(String);
  const personalNotes=noteParts.length?noteParts.join("\n"):String(recipe.personal_notes||"").trim();
  const noteSet=new Set(personalNotes.split(/\n+/).map(x=>cleanRecipeLine(x).toLowerCase()).filter(Boolean));
  const method=cleanExtractedMethod(String(recipe.method||"").split(/\n+/).filter(x=>!noteSet.has(cleanRecipeLine(x).toLowerCase())).join("\n"));
  return {...recipe,description:recipe.description||meta.description||null,method,personal_notes:recipe.personal_notes||personalNotes||null};
}
function parse(text:string,file:string,isUrl=false){
  const recipe=parseRaw(text,file,isUrl);
  return finalizeParsedRecipe(recipe,text);
}
function titleFor(recipe:any,file:string,text:string){const lang=language(text);if(lang==="English")return recipe.name||file.replace(/\.[^.]+$/i,"");const base=file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," ").trim();return `${base} (${lang})`;}
async function fetchWithTimeout(input:string|URL,init:RequestInit={},ms=20000){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),ms);
  try{return await fetch(input,{...init,signal:ac.signal})}finally{clearTimeout(timer)}
}
function looksLikeBlockedPage(text:string){
  const t=String(text||"").replace(/\s+/g," ").trim();
  if(!t)return true;
  return /(?:something went wrong|security checkpoint|access denied|request unsuccessful|unusual traffic|verify you are human|are you a robot|captcha|enable javascript|please try refreshing the page|oops!)/i.test(t)
    && !/(?:ingredients?|directions?|instructions?|method|recipeIngredient|recipeInstructions)/i.test(t);
}
function hasRecipeSignals(text:string){
  const t=String(text||"");
  if(looksLikeBlockedPage(t))return false;
  const headings=/(?:ingredients?|directions?|instructions?|method|preparation|steps?)\b/i.test(t);
  const structured=/(?:recipeIngredient|recipeInstructions|\\"@type\\"\s*:\s*\\"Recipe)/i.test(t);
  return structured || (headings && t.length>=250);
}
function readerUrls(sourceUrl:string){
  const urls=[sourceUrl];
  try{const u=new URL(sourceUrl);if(u.protocol==="https:"){const v=new URL(u.toString());v.protocol="http:";urls.push(v.toString());}}catch{}
  return urls;
}
async function browserlessFetch(sourceUrl:string){
  const token=Deno.env.get("BROWSERLESS_API_TOKEN");
  if(!token)return null;
  try{
    const endpoint="https://production-sfo.browserless.io/content?token="+encodeURIComponent(token);
    const rr=await fetchWithTimeout(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json","Cache-Control":"no-cache"},
      body:JSON.stringify({
        url:sourceUrl,
        bestAttempt:true,
        gotoOptions:{waitUntil:"networkidle2",timeout:30000}
      })
    },45000);
    if(!rr.ok)return null;
    const html=await rr.text();
    if(!html.trim()||!hasRecipeSignals(html)||looksLikeBlockedPage(html))return null;
    return {text:html,title:null};
  }catch{return null}
}
async function readerFetch(sourceUrl:string){
  const attempts=[
    {headers:{"Accept":"application/json","X-Engine":"browser","X-Timeout":"20"}},
    {headers:{"Accept":"text/markdown","X-Engine":"browser","X-Timeout":"20"}},
    {headers:{"Accept":"application/json","X-Engine":"direct","X-Timeout":"15"}}
  ];
  for(const url of readerUrls(sourceUrl))for(const opt of attempts){
    try{
      const rr=await fetchWithTimeout("https://r.jina.ai/"+url,{headers:opt.headers},25000);
      if(!rr.ok)continue;
      const raw=await rr.text(); if(!raw.trim()||looksLikeBlockedPage(raw))continue;
      let text="",title:null|string=null;
      try{const j=JSON.parse(raw);text=clean(j?.content||j?.data?.content||"");title=j?.title||j?.data?.title||null;}catch{text=clean(raw);}
      if(text&&hasRecipeSignals(text))return {text,title};
    }catch{}
  }
  return null;
}
async function docText(blob:Blob,n:string){if(/\.docx$/i.test(n)){const r=await mammoth.extractRawText({buffer:Buffer.from(await blob.arrayBuffer())});return String(r.value||"")}return"";}
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:C});if(req.method!=="POST")return out({error:"Method not allowed"},405);const a=req.headers.get("Authorization");if(!a)return out({error:"Unauthorized"},401);const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:a}}});const{data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Unauthorized"},401);let b:any;try{b=await req.json()}catch{return out({error:"Invalid JSON"},400)}const id=b?.import_item_id;if(!id)return out({error:"import_item_id is required"},400);const{data:item,error:ie}=await sb.from("cc_import_items").select("*").eq("id",id).single();if(ie||!item)return out({error:"Import item not found"},404);if(item.created_by!==user.id)return out({error:"Forbidden"},403);await sb.from("cc_import_items").update({extraction_status:"processing",error_message:null}).eq("id",id);try{let text="",recipe:any=null,title=item.source_title||null;if(item.source_url){
  const sourceUrl=String(item.source_url).trim();
  const readerPromise=readerFetch(sourceUrl);
  const directPromise=(async()=>{
    try{
      const r=await fetchWithTimeout(sourceUrl,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"}},10000);
      if(!r.ok)return null;
      const html=await r.text();
      if(!html.trim()||looksLikeBlockedPage(html)||!hasRecipeSignals(html))return null;
      return {text:html,title:null};
    }catch{return null}
  })();
  const [reader,direct]=await Promise.all([readerPromise,directPromise]);

  // A URL fetch is only accepted when it actually produces a recipe.
  // Some publishers return a large HTML shell containing words such as
  // "Ingredients" and "Method"; that is not a successful extraction.
  const tryUrlCandidate=(candidate:any)=>{
    if(!candidate?.text)return null;
    try{
      const parsed=parse(candidate.text,item.file_name||"Imported recipe",true);
      if(parsed?.ingredients?.length && parsed?.method?.trim()){
        return {text:candidate.text,title:candidate.title||null,recipe:parsed};
      }
    }catch{}
    return null;
  };

  let accepted=tryUrlCandidate(reader);
  if(accepted){
    text=accepted.text;
    title=accepted.title||title;
    recipe=accepted.recipe;
  }else{
    accepted=tryUrlCandidate(direct);
    if(accepted){
      text=accepted.text;
      title=accepted.title||title;
      recipe=accepted.recipe;
    }else{
      // Browserless is the rendered-browser fallback. It must be reached
      // whenever a normal fetch returns HTML but the parser cannot extract
      // a complete recipe from it.
      const browser=await browserlessFetch(sourceUrl);
      accepted=tryUrlCandidate(browser);
      if(accepted){
        text=accepted.text;
        title=accepted.title||title;
        recipe=accepted.recipe;
      }else{
        throw Error("The page was fetched, but no complete recipe could be extracted. Browserless fallback was also unable to produce Ingredients and Method.");
      }
    }
  }
}else if(item.file_path){const{data:blob,error:e}=await sb.storage.from("cooking-confidential").download(item.file_path);if(e||!blob)throw Error("Could not read uploaded file");const n=item.file_name||"",m=item.mime_type||"";if(/\.docx$/i.test(n)||/officedocument\.wordprocessingml/i.test(m)){text=await docText(blob,n);recipe=parse(text,n);}else if(m.startsWith("text/")||/\.(txt|md|csv)$/i.test(n)){text=await blob.text();recipe=parse(text,n);}else if(m==="application/pdf"||/\.pdf$/i.test(n)){const { extractText,getDocumentProxy }=await import("npm:unpdf@0.12.1");const pdf=await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));const p=await extractText(pdf,{mergePages:true});text=String(p.text||"");recipe=parse(text,n);}else throw Error("This file type needs OCR processing before recipe extraction.")}else throw Error("Import item has no source URL or file");if(!text.trim())throw Error("No readable recipe content found");if(!recipe?.ingredients?.length&&!recipe?.method?.trim()){const preview=clean(text).slice(0,1200).replace(/\s+/g," ");throw Error("The source was read, but no readable Ingredients or Method were found. [diag len="+text.length+" preview="+preview+"]");}const lang=language(text);title=titleFor(recipe,item.file_name||"Imported recipe",text);recipe={...recipe,name:title,language:lang};const{error:ue}=await sb.from("cc_import_items").update({extracted_text:JSON.stringify(recipe),source_title:title,extraction_status:"ready",review_status:"pending",inferred_cuisine:recipe.cuisine||null,inferred_course:recipe.course||null,error_message:null}).eq("id",id);if(ue)throw ue;return out({ok:true,status:"ready",import_item_id:id,recipe});}catch(e){const msg=e instanceof Error?e.message:String(e);await sb.from("cc_import_items").update({extraction_status:"failed",error_message:msg}).eq("id",id);return out({ok:false,status:"failed",import_item_id:id,error:msg},500)}});