import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Narrow recovery for the Supabase "JWT issued at future" condition.
// Do not sign the user out. Refresh the existing refresh-token session, then reload once.
const URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const KEY='sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu';
const STORAGE='sb-yiwmtfbqbynimqvwxosu-auth-token';
const FLAG='cc-jwt-future-recovery';
const sb=createClient(URL,KEY);

function storedSession(){
  try{
    const raw=localStorage.getItem(STORAGE); if(!raw)return null;
    const v=JSON.parse(raw); return v?.currentSession||v||null;
  }catch{return null}
}
function jwtIat(token){
  try{
    const p=String(token||'').split('.')[1];
    if(!p)return null;
    const json=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')+'=='.slice((p.length+3)%4)));
    return Number(json.iat)||null;
  }catch{return null}
}
async function recover(){
  const now=Date.now();
  try{
    const session=storedSession();
    if(!session?.refresh_token)return false;
    const iat=jwtIat(session.access_token);
    const future=iat && iat*1000>now+5000;
    const flagged=Number(localStorage.getItem(FLAG)||0);
    if(!future && now-flagged<60000)return false;
    if(!future)return false;
    localStorage.setItem(FLAG,String(now));
    const {data,error}=await sb.auth.refreshSession({refresh_token:session.refresh_token});
    if(error||!data?.session)return false;
    localStorage.removeItem(FLAG);
    window.location.reload();
    return true;
  }catch(e){console.warn('Cooking Confidential JWT recovery failed',e);return false}
}

// Catch the specific error even when the main app has already reached the library query.
const observer=new MutationObserver(()=>{
  const text=document.body?.innerText||'';
  if(/JWT issued at future/i.test(text)) recover();
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
recover();
