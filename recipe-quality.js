// Cooking Confidential — common recipe quality gate.
// This runs AFTER a reader has produced clean text and the structure parser
// has produced recipe fields. It does not rewrite content.
const words = s => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const letters = s => (String(s ?? '').match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
const junkChars = s => (String(s ?? '').match(/[\uFFFD©®™|¦]{1,}/g) || []).length;

// Check repeated lines within each recipe section, not across sections.
// A title repeated as the first line of a method is common source material
// and must not make an otherwise good recipe fail the quality gate.
const repeatedFragments = (...sections) => {
  let repeats = 0;
  for (const section of sections) {
    const ls = String(section ?? '').split(/\n+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    const seen = new Set();
    for (const x of ls) {
      if (seen.has(x)) repeats++;
      seen.add(x);
    }
  }
  return repeats;
};
const looksLikeIngredient = s => {
  const x=String(s??'').trim();
  return /\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|lit(?:re|er)s?|cloves?|slices?|pieces?|pinch|salt|pepper|oil|garlic|onion|ginger|sauce|flour|sugar|vinegar|cumin|chili|herb|juice|yogurt|cheese)\b/i.test(x)
    || /^\s*[\d½¼¾⅓⅔⅛⅜⅝⅞]/.test(x);
};
const looksLikeInstruction = s => /\b(?:add|mix|combine|stir|heat|cook|bake|roast|grill|fry|boil|simmer|whisk|blend|chop|slice|dice|season|marinate|drain|pour|place|transfer|cover|remove|serve|preheat|refrigerate|rest|let)\b/i.test(String(s??''));
export function checkRecipeQuality(recipe, {mode='single'}={}) {
  const r=recipe||{};
  const name=String(r.name||'').trim();
  const description=String(r.description||'').replace(/<[^>]+>/g,' ').trim();
  const ingredients=Array.isArray(r.ingredients)?r.ingredients.map(v=>typeof v==='string'?v:String(v?.name||v?.text||'')).filter(Boolean):[];
  const method=Array.isArray(r.method)?r.method.join('\n'):String(r.method||r.recipeInstructions||'');
  const notes=String(r.personal_notes||r.notes||'').trim();
  const all=[name,description,...ingredients,method,notes].join('\n');
  const reasons=[];
  let score=0;
  if(name && words(name).length>=1 && name.length>=3 && name.length<=160) score+=20; else reasons.push('missing_or_implausible_title');
  const plausibleIngredients=ingredients.filter(looksLikeIngredient).length;
  if(ingredients.length>=3) score+=20; else reasons.push('too_few_ingredients');
  if(plausibleIngredients>=Math.min(3,ingredients.length)) score+=15; else reasons.push('ingredients_do_not_look_like_recipe_ingredients');
  const methodWords=words(method).length;
  let instructionLines=0;
  const hasMethod=methodWords>0 || method.trim().length>0;
  if(hasMethod){
    if(methodWords>=8 || method.length>=60) score+=15; else reasons.push('method_too_short');
    instructionLines=String(method).split(/\n+/).filter(Boolean).filter(looksLikeInstruction).length;
    if(instructionLines>=1) score+=10; else reasons.push('method_does_not_look_like_instructions');
  }else{
    // A recipe can legitimately be ingredients-only (for example a chutney,
    // sauce base, spice mix, or a photographed recipe page with no method).
    // Keep a positive contribution without making Method mandatory.
    score+=15;
  }
  const letterRatio=letters(all)/Math.max(1,all.length);
  if(letterRatio>=0.45) score+=10; else reasons.push('low_readable_text_ratio');
  if(junkChars(all)===0) score+=5; else reasons.push('ocr_garbage_characters');
  if(repeatedFragments(description,ingredients.join('\n'),method,notes)===0) score+=5; else reasons.push('repeated_lines');
  const titleLooksContaminated = name.length>70 || /\b(?:ingredients?|method|directions?|instructions?)\b/i.test(name);
  if(titleLooksContaminated) reasons.push('title_contains_recipe_content');
  // Only flag a duplicated ingredient when it looks like a complete ingredient
  // entry. Short ingredient names such as "Ginger-Garlic", "salt" or "onion"
  // naturally appear in cooking instructions and are not section contamination.
  const meaningfulIngredient = ingredients.filter(i => {
    const s=String(i).trim();
    return s.length>=20
      || /[:\\d½¼¾⅓⅔⅛⅜⅝⅞]/.test(s)
      || /\\b(?:cup|cups|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|grams?|kg|ml|cloves?|slices?|pieces?)\\b/i.test(s);
  });
  const methodLower=method.toLowerCase();
  const ingredientInMethod = meaningfulIngredient.some(i => methodLower.includes(String(i).trim().toLowerCase()));
  if(ingredientInMethod) reasons.push('possible_section_contamination');
  const good = reasons.length===0 && score>=85;
  return {good, score, reasons, metrics:{ingredientCount:ingredients.length,plausibleIngredientCount:plausibleIngredients,methodWords,letterRatio,instructionLines}};
}
export default checkRecipeQuality;
