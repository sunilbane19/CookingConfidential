// Remove common numeric citation references injected by document exports/OCR.
// Only strip bracketed comma/semicolon-separated numeric lists, not quantities like [1/2].
export function stripImportCitations(value){
 const citation=/[ \t]*\[\s*\d+(?:\s*[,;]\s*\d+)+\s*\]/g;
 if(typeof value==='string')return value.replace(citation,'').replace(/[ \t]{2,}/g,' ').replace(/ *\n */g,'\n');
 if(Array.isArray(value))return value.map(stripImportCitations);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,stripImportCitations(v)]));
 return value;
}
