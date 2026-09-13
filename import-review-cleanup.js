import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu');
const UNIT=/^(?:\d+(?:\.\d+)?|\d+\/\d+|½|⅓|⅔|¼|¾|one|two|three|four|five|six|seven|eight|nine|ten|a)\b/i;
const SOCIAL=/^(?:like|comment|share|send|follow|save|subscribe|see more|original audio|recipe by|stay tuned|thanks for watching|sponsored|marketplace|notifications|menu)$/i;
function baseName(name='Imported recipe'){
  return String(name).replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()||'Imported recipe';
}
function cleanLine(v){
  let s=String(v??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/[®©™]/g,' ').replace(/\s+/g,' ').trim();
  s=s.replace(/^[-•·*]+\s*/,'');
  s=s.replace(/\b1\s*\/\s*[»»]\b/g,'1/2');
  s=s.replace(/\b1s(?=\s+(?:teaspoon|tablespoon|cup|tbsp|tsp)\b)/gi,'1');
  s=s.replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/gi,'lb');
  return s.trim();
}
function looksNoise(s){
  const t=cleanLine(s);
  if(!t||SOCIAL.test(t)||/^#\w+/.test(t))return true;
  const letters=(t.match(/[A-Za-z]/g)||[]).length;
  const odd=(t.match(/[^A-Za-z0-9\s.,'’%/()&+\-½⅓⅔¼¾]/g)||[]).length;
  return letters<2 || (odd>2 && letters<4);
}
function cleanIngredients(value){
  const raw=String(value??'').replace(/\r/g,'').split('\n').map(cleanLine).filter(Boolean);
  const out=[];
  for(const line of raw){
    if(looksNoise(line))continue;
    if(out.length && !UNIT.test(line) && /^[a-z]/.test(line)) out[out.length-1]=`${out[out.length-1]} ${line}`;
    else out.push(line);
  }
  return out.join('\n');
}
export async function cleanupImportReview(id){
  const form=await new Promise(resolve=>{
    const find=()=>document.querySelector('#ccImportReviewForm');
    if(find())return resolve(find());
    const observer=new MutationObserver(()=>{const f=find();if(f){observer.disconnect();resolve(f)}});
    observer.observe(document.body,{subtree:true,childList:true});
    setTimeout(()=>{observer.disconnect();resolve(find())},3000);
  });
  if(!form)return false;
  const {data:item}=await sb.from('cc_import_items').select('file_name').eq('id',id).single();
  const name=form.querySelector('[name="name"]');
  if(name&&item?.file_name)name.value=baseName(item.file_name);
  const ingredients=form.querySelector('[name="ingredients"]');
  if(ingredients)ingredients.value=cleanIngredients(ingredients.value);
  return true;
}
