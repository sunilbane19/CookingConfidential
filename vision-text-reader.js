import { supabase } from './supabase-client-legacy.js?v=1.0.0';
const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
export async function readSourceTextWithVision(itemId){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw Error('Your sign-in session has expired. Please sign in again.');
  const res=await fetch(SUPABASE_URL+'/functions/v1/cc-import-vision-read-staging-v1',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':session.access_token},
    body:JSON.stringify({import_item_id:Number(itemId)})
  });
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body?.error||'Vision text reader failed.');
  if(!String(body?.text||'').trim())throw Error('Vision text reader returned no text.');
  return body.text;
}
