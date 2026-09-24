import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.6.0";
import * as WordExtractor from "npm:word-extractor@1.0.4";
import { Buffer } from "node:buffer";
const C={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,"Content-Type":"application/json"}});
const clean=(s:any)=>String(s??"").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
const lines=(s:string)=>clean(s).split("\n").map(x=>x.replace(/^\s*>\s*/,"").replace(/^\s*#{1,6}\s*/,"").replace(/^\s*[-*+•·]\s*/,"").replace(/^\s*\d+[.)]\s*/,"").replace(/^\s*(?:\\*\\*|__)(.+?)(?:\\*\\*|__)\s*$/,"$1").trim()).filter(Boolean);
const ih=/^(ingredients?|ingredient list|what you need|ingredients required|साहित्य)\s*[:\-–—,]?\s*$/i;
const mh=/^(method|directions?|instructions?|preparation|preparations|steps?|recipe method|cooking method|procedure|प्रक्रिया)\s*[:\-–—,]?\s*$/i;
function language(t:string){if(/[ऀ-ॿ]/.test(t))return /ळ|ऱ|ऍ|ऑ|ॲ/.test(t)?"Marathi":"Hindi";if(/[\u0980-\u09FF]/.test(t))return"Bengali";if(/[\u0A80-\u0AFF]/.test(t))return"Gujarati";if(/[\u0A00-\u0A7F]/.test(t))return"Punjabi";if(/[\u0B80-\u0BFF]/.test(t))return"Tamil";if(/[\u0C00-\u0C7F]/.test(t))return"Telugu";if(/[\u0C80-\u0CFF]/.test(t))return"Kannada";if(/[\u0D00-\u0D7F]/.test(t))return"Malayalam";if(/[\u0600-\u06FF]/.test(t))return"Arabic";if(/[\u0400-\u04FF]/.test(t))return"Russian";if(/[\u0370-\u03FF]/.test(t))return"Greek";return"English";}
function structuredRecipe(text:string){
  const re=/<script[^>]*>([\s\S]*?)<\/script>/gi;
  const candidates:any[]=[];
  const walk=(v:any)=>{if(!v)return;if(Array.isArray(v)){for(const x of v)walk(x);return}if(typeof v==="object"){if(v.recipeIngredient||v.recipeInstructions)candidates.push(v);for(const k of Object.keys(v))walk(v[k]);}};
  for(const m of String(text||"").matchAll(re)){const body=String(m[1]||"");if(!/recipeIngredient|recipeInstructions/i.test(body))continue;try{walk(JSON.parse(body.replace(/&quot;/g,'"')))}catch{}}
  const r=candidates.find(x=>Array.isArray(x.recipeIngredient)&&x.recipeIngredient.length&&x.recipeInstructions);
  if(!r)return null;
  const method=Array.isArray(r.recipeInstructions)?r.recipeInstructions.map((x:any)=>typeof x==="string"?x:x?.text||x?.name||"").filter(Boolean).join("\n"):String(r.recipeInstructions||"");
  return {name:clean(r.name||""),description:clean(r.description||"")||null,ingredients:r.recipeIngredient.map((x:any)=>clean(x)).filter(Boolean),method:clean(method),cuisine:r.recipeCuisine||null,course:r.recipeCategory||null,servings:r.recipeYield||null};
}
function parseLabeledSections(text:string,file:string){
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
      description=clean(src.slice(2,ii).join(" "));
    }else{
      // Title before the Description heading.
      name=clean(src[di-1]||"");
      description=clean(src.slice(di+1,ii).join(" "));
    }
  }else{
    // No explicit Description section: use the first useful line as title.
    name=clean(src[0]||file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  }
  const strip=(s:string)=>s
    .replace(/^\s*#{1,6}\s*/,"")
    .replace(/^\s*[-*+•·]\s*/,"")
    .replace(/^\s*\d+[.)]\s*/,"")
    .replace(/^\s*(?:\*\*|__)/,"")
    .replace(/(?:\*\*|__)\s*$/,"")
    .trim();
  const ingredients=src.slice(ii+1,mi).map(strip)
    .filter(x=>x&&!ingRe.test(x)&&!descRe.test(x));
  const method=src.slice(mi+1).map(strip)
    .filter(x=>x&&!methRe.test(x)&&!descRe.test(x))
    .join("\n");
  if(!name||ingredients.length<2||!method.trim())return null;
  const sm=raw.match(/(?:serves?|servings?|yield)\s*[:\-–—]?\s*([^\n]+)/i);
  return {name,description:description||null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:sm?clean(sm[0]):null};
}

function parseMarkdownSections(text:string,file:string){
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
  const strip=(s:string)=>s.replace(/^\s*#{1,6}\s*/,"").replace(/^\s*[-*+•·]\s*/,"").replace(/^\s*\d+[.)]\s*/,"").replace(/^\s*(?:\*\*|__)/,"").replace(/(?:\*\*|__)\s*$/,"").trim();
  const cleanLines=(s:string)=>s.split("\n").map(strip).filter(x=>x&&!/^(?:featured video|see all food52 videos)$/i.test(x));
  const ingredients=cleanLines(ingBlock).filter(x=>!/^(?:shell|filling|ingredients?)$/i.test(x));
  const method=cleanLines(methodBlock).filter(x=>!/^(?:shell|filling|directions?|method|instructions?|preparation|steps?)$/i.test(x)).join("\n");
  if(ingredients.length<2||!method)return null;
  const title=clean((raw.match(/(?:^|\n)\s*#\s+([^\n]+)/)||[])[1]||file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  const sm=raw.match(/(?:serves?|servings?|yield)\s*[:\-–—]?\s*([^\n]+)/i);
  return {name:title,description:null,ingredients:ingredients.slice(0,200),method:clean(method),cuisine:null,course:null,servings:sm?clean(sm[0]):null};
}

function parsePdfRecipe(text:string,file:string){
  const raw=String(text||"")
    .replace(/\r/g,"")
    .replace(/\u00a0/g," ")
    .replace(/[\uFB00-\uFB06]/g,m=>({"ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"ft","ﬆ":"st"}[m]||m));
  const pageClean=raw
    .replace(/^\s*[-=]{2,}\s*Page\s+\d+\s*[-=]{2,}\s*$/gim,"")
    .replace(/^\s*Page\s+\d+\s*$/gim,"");
  const src=pageClean.split("\n").map(x=>x.trim()).filter(Boolean);
  if(src.length<8)return null;
  const normalizeIngredient=(x:string)=>{
    let v=x.replace(/\s+/g," ").trim();
    v=v.replace(/^(\d+(?:\/\d+)?(?:\s+\d+\/\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞]+)\s*(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l|litre|litres|liter|liters)\s*(?=[A-Za-z])/i,"$1 $2 ");
    v=v.replace(/^(\d+(?:\/\d+)?)\s*(medium|small|large)\s*(?=[A-Za-z])/i,"$1 $2 ");
    return v.replace(/\s{2,}/g," ");
  };
  const shell=src.findIndex(x=>/^shell$/i.test(x));
  const filling=shell>=0?src.findIndex((x,i)=>i>shell&&/^filling$/i.test(x)):-1;
  if(shell<0||filling<0)return null;
  const title=clean(src[0]||file.replace(/\.pdf$/i,"").replace(/[_-]+/g," "));
  if(!title || /^by\s+/i.test(title) || /^serves?\b/i.test(title))return null;
  const authorIndex=src.findIndex((x,i)=>i>0&&/^by\s+/i.test(x));
  const servesIndex=src.findIndex((x,i)=>i>0&&/^(?:serves?|servings?|yield)\b/i.test(x));
  const descriptionStart=Math.max(authorIndex,servesIndex)+1;
  const descriptionLines=src.slice(Math.max(1,descriptionStart),shell)
    .filter(x=>!/^by\s+/i.test(x))
    .filter(x=>!/^(?:serves?|servings?|yield)\b/i.test(x));
  const description=clean(descriptionLines.join(" "));
  const methodStart=src.findIndex((x,i)=>i>filling&&/^shell$/i.test(x));
  const ingredientLines=src.slice(shell+1,filling).filter(x=>x.length>1);
  const fillingIngredients=methodStart>filling
    ? src.slice(filling+1,methodStart).filter(x=>x.length>1)
    : [];
  const ingredients=[...ingredientLines,...fillingIngredients].map(normalizeIngredient).filter(Boolean);
  if(ingredients.length<4)return null;
  const methodParts:string[]=[];
  let current="";
  const flush=()=>{if(current){methodParts.push(current);current="";}};
  for(const x of src.slice(methodStart>=0?methodStart:filling+1)){
    if(/^shell$/i.test(x)||/^filling$/i.test(x)){flush();methodParts.push(x);continue;}
    if(/^step\s*\d+$/i.test(x)){flush();methodParts.push(x);continue;}
    current=current?current+" "+x:x;
  }
  flush();
  const method=clean(methodParts.join("\n\n"));
  if(!method)return null;
  return {
    name:title,
    description:description||null,
    ingredients,
    method,
    cuisine:null,
    course:null,
    servings:servesIndex>=0?clean((src[servesIndex].match(/^(?:serves?|servings?|yield)\b.*?(?=\s+prep\s+time\b|\s+cook\s+time\b|$)/i)||[])[0]||src[servesIndex]):null
  };
}

function parse(text:string,file:string){
  if(/\.pdf$/i.test(file)){const pdfRecipe=parsePdfRecipe(text,file);if(pdfRecipe)return pdfRecipe;}
  const labeled=parseLabeledSections(text,file); if(labeled)return labeled;
  const markdown=parseMarkdownSections(text,file); if(markdown)return markdown;
  const structured=structuredRecipe(text);
  if(structured?.ingredients?.length && structured.method)return structured;
  const raw=String(text||"").replace(/\r/g,"").replace(/\u00a0/g," ");
  const fileTitle=clean(file.replace(/\.[^.]+$/i,"").replace(/[_-]+/g," "));
  const strip=(s:string)=>s.replace(/^\s*#{1,6}\s*/,"").replace(/^\s*[-*+•·]\s*/,"").replace(/^\s*\d+[.)]\s*/,"").replace(/^\s*(?:\*\*|__)/,"").replace(/(?:\*\*|__)\s*$/,"").trim();
  const sourceLines=raw.split("\n").map(x=>x.trim()).filter(Boolean);
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
    const ingredients=sourceLines.slice(i+1,m).map(strip).filter(x=>x.length>1).filter(x=>!/^(?:featured video|see all food52 videos)$/i.test(x));
    const method=sourceLines.slice(m+1).map(strip).filter(x=>!/^(?:featured video|see all food52 videos)$/i.test(x)).join("\n");
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
        .filter(x=>x.length>1);
      const method=lines(methodPart)
        .filter(x=>!/^(?:directions?|method|instructions?|preparation|steps?|featured video|see all food52 videos)$/i.test(x))
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
      const ingredients=lines(after.slice(0,mm)).filter(x=>!/^(?:ingredients?|directions?|instructions?|featured video|see all food52 videos)$/i.test(x)).filter(x=>x.length>1);
      const method=lines(marker?after.slice(mm+marker[0].length):"").filter(x=>!/^(?:directions?|instructions?|featured video|see all food52 videos)$/i.test(x)).join("\n");
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
async function translatedFetch(sourceUrl:string){
  // Some recipe publishers block server-side requests but remain readable through
  // a browser translation proxy. Use this only as a fallback after direct/Jina reads.
  try{
    const u=new URL(sourceUrl);
    const host=u.hostname.replace(/\./g,"-");
    const proxy="https://"+host+".translate.goog"+u.pathname+u.search+(u.search?"&":"?")+"_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en";
    const rr=await fetchWithTimeout(proxy,{headers:{"User-Agent":"Mozilla/5.0","Accept":"text/html,application/xhtml+xml"}},15000);
    if(!rr.ok)return null;
    const html=await rr.text();
    if(!html.trim()||!hasRecipeSignals(html))return null;
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
async function docText(blob:Blob,n:string){if(/\.docx$/i.test(n)){const r=await mammoth.extractRawText({buffer:Buffer.from(await blob.arrayBuffer())});return String(r.value||"")}if(/\.doc$/i.test(n)||/application\/msword/i.test(n)){const ex:any=WordExtractor as any;const x=ex.default||ex;const d=await (x.extract?x.extract(Buffer.from(await blob.arrayBuffer())):x.fromBuffer(Buffer.from(await blob.arrayBuffer())));return String(d.getBody?d.getBody():"")}return"";}
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
  let translated:any=null;
  if(reader?.text){text=reader.text;title=reader.title||title;recipe=parse(text,item.file_name||"Imported recipe");}
  else if(direct?.text){const html=direct.text;const ld=jsonLdRecipe(html);if(ld){recipe=fromLd(ld);text=JSON.stringify(recipe);title=recipe.name||title;}else{text=strip(html).slice(0,120000);recipe=parse(text,item.file_name||"Imported recipe");}}
  else {
    translated=await translatedFetch(sourceUrl);
    if(translated?.text){
      text=translated.text;
      const ld=jsonLdRecipe(text);
      if(ld){recipe=fromLd(ld);title=recipe.name||title;}
      else {text=strip(text).slice(0,120000);recipe=parse(text,item.file_name||"Imported recipe");}
    }else throw Error("This website is blocking automated recipe extraction. The page is reachable in a browser, but its recipe content was not returned to the importer.");
  }
}else if(item.file_path){const{data:blob,error:e}=await sb.storage.from("cooking-confidential").download(item.file_path);if(e||!blob)throw Error("Could not read uploaded file");const n=item.file_name||"",m=item.mime_type||"";if(/\.docx$|\.doc$/i.test(n)||/application\/msword|officedocument\.wordprocessingml/i.test(m)){text=await docText(blob,n);recipe=parse(text,n);}else if(m.startsWith("text/")||/\.(txt|md|csv)$/i.test(n)){text=await blob.text();recipe=parse(text,n);}else if(m==="application/pdf"||/\.pdf$/i.test(n)){const { extractText,getDocumentProxy }=await import("npm:unpdf@0.12.1");const pdf=await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));const p=await extractText(pdf,{mergePages:true});text=String(p.text||"");recipe=parse(text,n);}else throw Error("This file type needs OCR processing before recipe extraction.")}else throw Error("Import item has no source URL or file");if(!text.trim())throw Error("No readable recipe content found");if(!recipe?.ingredients?.length&&!recipe?.method?.trim()){const preview=clean(text).slice(0,1200).replace(/\s+/g," ");throw Error("The source was read, but no readable Ingredients or Method were found. [diag len="+text.length+" preview="+preview+"]");}const lang=language(text);title=titleFor(recipe,item.file_name||"Imported recipe",text);recipe={...recipe,name:title,language:lang};const{error:ue}=await sb.from("cc_import_items").update({extracted_text:JSON.stringify(recipe),source_title:title,extraction_status:"ready",review_status:"pending",inferred_cuisine:recipe.cuisine||null,inferred_course:recipe.course||null,error_message:null}).eq("id",id);if(ue)throw ue;return out({ok:true,status:"ready",import_item_id:id,recipe});}catch(e){const msg=e instanceof Error?e.message:String(e);await sb.from("cc_import_items").update({extraction_status:"failed",error_message:msg}).eq("id",id);return out({ok:false,status:"failed",import_item_id:id,error:msg},500)}});