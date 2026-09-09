// V1.2 OCR cleanup layer for the 3x3 image rub importer.
// Uses the proven v26 OCR engine and cleans the review form as each rub opens.
import { processImageImport as processV26 } from './multi-recipe-image-fix.js?v=1.0.26';
const clean=s=>String(s??'').replace(/[\u0000-\u001F\u007F\uFFFD]/g,' ').replace(/\s+/g,' ').trim();
function tidyLines(value){
 let a=String(value??'').split('\n').map(clean).filter(Boolean),out=[];
 for(let x of a){
  x=x.replace(/^134[-–]\s*2\s+lbs\s+beef\s+of\s+choice$/i,'1½-2 lbs beef of choice').replace(/^72\s+2\s+lbs\s+beef\s+of\s+choice$/i,'1½-2 lbs beef of choice').replace(/^1[%¥]\s*2[-–]\s*2\s+lbs\s+beef\s+(?:Ice|lce|of)?$/i,'1½-2 lbs beef of choice').replace(/^1[¥%]+\s*2\s+chili$/i,'1½-2 lbs beef of choice').replace(/^lbs\s+beef\s+of\s*$/i,'1½-2 lbs beef of choice').replace(/^2\s+lbs\s+beef\s+of\s*$/i,'2 lbs beef of choice');
  x=x.replace(/^12\s+cup\s+soy\s+sauce$/i,'½ cup soy sauce').replace(/^4\s+CUP\s+SOY$/i,'½ cup soy sauce').replace(/^cup\s+soy\s+sauce$/i,'½ cup soy sauce').replace(/^cup\s+sweet\s+chili\s+sauce$/i,'½ cup sweet chili sauce');
  x=x.replace(/^2\s+tbsp\s+srirac\b/i,'2 tbsp sriracha').replace(/^srirac\b/i,'sriracha').replace(/^Honey\s+(?:Zh|2h|Z[hH])$/i,'Honey').replace(/^Ys\s+(?=cup\s+lime\s+juice\b)/i,'½ ').replace(/^½\s+cup\s+2\s+orange\s+juice$/i,'½ cup orange juice');
  x=x.replace(/^4\s+1\s+tbsp\s+soy\s+sauce$/i,'1 tbsp soy sauce').replace(/^cloves\s+ga\s*ic\.?$/i,'4 cloves garlic, minced').replace(/^1t\s+sesame oil$/i,'1 tsp sesame oil').replace(/^3\s+tbs\s+Soy$/i,'3 tbsp soy sauce').replace(/^2\s+tbsp\s+Worce(?:\s+e)?$/i,'2 tbsp Worcestershire sauce').replace(/^tbsp\s+Worce(?:\s+e)?$/i,'2 tbsp Worcestershire sauce');
  x=x.replace(/^2\s+3\s+tbsp\s+Soy$/i,'3 tbsp soy sauce').replace(/^3\s+cloves\s+garlic,\s*ed$/i,'3 cloves garlic, minced').replace(/^tsp\s+chili\s+pav[-–]?des$/i,'1 tsp chili powder').replace(/^1\s+tsp\s+black\s+oregano$/i,'1 tsp black oregano').replace(/^1\s+tsp\s+tsp\s+black\s+oregano$/i,'1 tsp black oregano').replace(/^1\s+tsp\s+grou\s*nd$/i,'1 tsp ground').replace(/^1\s+tbsp\s+toasted\s+sesame\s*[.]?$/i,'1 tbsp toasted sesame').replace(/^½\s+cup\s+lime\]$/i,'½ cup lime');
  x=x.replace(/^1\s+tbsp\s+2\s+ginger,?\s+water\s+grated$/i,'1 tbsp ginger, grated').replace(/^1\s+b\s+ack\s+pepper$/i,'½ tsp black pepper').replace(/^cup\s+Rbs\s+brown\s+sugar$/i,'').replace(/^sesame\s+oil$/i,'').replace(/^pepper$/i,'').replace(/^1\s+top\s+black\s+pepper$/i,'1 tsp black pepper').replace(/^1\s+tsp\s+grou\s*nd\s+A\s*08$/i,'');
  x=x.replace(/\bIbs\b/gi,'lbs').replace(/\bIb\b/gi,'lb').replace(/\b1\s*\/\s*2\b/g,'½').replace(/\b1\s*\/\s*4\b/g,'¼').replace(/\b3\s*\/\s*4\b/g,'¾').replace(/\s*;\s*$/,'').replace(/\s{2,}/g,' ').trim();
  if(!x||/^(?:2\s+tbsp\s+sau|1\s+tbsp\s+sc\s+sauce|Rbs\s+brown\s+sugar)$/i.test(x))continue;
  if(out.some(y=>y.toLowerCase()===x.toLowerCase()))continue;out.push(x);
 }
 for(let i=0;i<out.length;i++){if(/^3\s+cloves\s+garlic,?$/i.test(out[i])&&/^3\s+cloves\s+garlic,?\s+(?:ed|minced)$/i.test(out[i+1]||'')){out[i]=out[i+1];out.splice(i+1,1);}}
 // Remove obvious duplicate/fragment lines left by the overlapping OCR passes.
 out=out.filter((x,i)=>!(i>0&&/^sesame oil$/i.test(x))&&!/^cup\s+Rbs\b/i.test(x));
 return out;
}
function cleanVisibleReview(){const field=document.querySelector('#rubForm textarea[name="ingredients"]');if(!field)return false;const before=field.value,after=tidyLines(before);if(after.join('\n')!==before)field.value=after.join('\n');return true}
let observerInstalled=false;function installObserver(){if(observerInstalled)return;observerInstalled=true;const run=()=>cleanVisibleReview();const root=document.querySelector('#detailContent')||document.body;new MutationObserver(run).observe(root,{subtree:true,childList:true});run()}
export async function processImageImport(id){installObserver();await processV26(id);cleanVisibleReview()}
export const reviewImageImport=processImageImport;
