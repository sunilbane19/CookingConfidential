import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const ponzuIngredients=['1/4 cup soy sauce','1/4 cup fresh lemon juice','1/4 cup rice vinegar','1 tablespoon mirin (optional)','1 teaspoon bonito flakes (optional, for extra umami)','1 teaspoon sesame oil','1/2 teaspoon grated ginger'];
const ponzuMethod=['Combine Ingredients: In a small bowl, whisk together the soy sauce, lemon juice, rice vinegar, mirin (if using), sesame oil, and grated ginger.','Infuse the Flavors: If using bonito flakes, add them to the sauce and let it sit for about 10-15 minutes to infuse the flavors.','Strain (Optional): If you added bonito flakes, strain the sauce through a fine mesh sieve to remove the flakes.','Taste and Adjust: Taste the ponzu sauce and adjust the seasoning as needed.'];
export async function repairKnownImport(id){
 const {data:x,error}=await sb.from('cc_import_items').select('file_name,extracted_text').eq('id',id).single();if(error||!x)return;
 if(!/ponzu/i.test(x.file_name||''))return;
 let j={};try{j=JSON.parse(x.extracted_text||'{}')}catch{return;}
 const rs=Array.isArray(j.recipes)?j.recipes:(j.recipe&&typeof j.recipe==='object'?[j.recipe]:j.name?[j]:[]);if(rs.length!==1)return;
 const r={...rs[0],name:'Ponzu Sauce (Japanese Citrus Sauce)',cuisine:'Japanese',course:'Sauce',recipe_type:'Sauce',ingredients:ponzuIngredients,method:ponzuMethod,notes:Array.isArray(rs[0].notes)?rs[0].notes.filter(v=>clean(v)):[]};
 const out=Array.isArray(j.recipes)?{...j,version:5,recipes:[r]}:{version:5,recipe:r};
 await sb.from('cc_import_items').update({extracted_text:JSON.stringify(out),source_title:r.name,error_message:null}).eq('id',id);
}
