import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Targeted recovery for Supabase JWT future errors. Do not sign the user out.
const STORAGE='sb-yiwmtfbqbynimqvwxosu-auth-token';
const FLAG='cc-jwt-future-recovery';
let recovering=false;

async function getClient(){
  const script=document.querySelector('script[src*="app.js"]');
  const url=script ? new URL(script.getAttribute('src'),location.href).href : new URL('app.js',location.href).href;
  const text=await (await fetch(url,{cache:'no-store'})).text();
  const m=text.match(/SUPABASE_URL\s*=\s*['\"]([^'\"]+)['\"][\s\S]*?SUPABASE_PUBLISHABLE_KEY\s*=\s*['\"]([^'\"]+)['\"]/);
  if(!m)throw new Error('Could not initialise authentication recovery.');
  return createClient(m[1],m[2]);
}

function storedSession(){
  try{
    const raw=localStorage.getItem(STORAGE);if(!raw)return null;
    const v=JSON.parse(raw);return v?.currentSession||v?.session||v||null;
  }catch{return null}
}

async function forceRefresh(){
  if(recovering)return false;
  const now=Date.now();
  if(now-Number(localStorage.getItem(FLAG)||0)<60000)return false;
  const session=storedSession();
  if(!session?.refresh_token)return false;
  recovering=true;localStorage.setItem(FLAG,String(now));
  try{
    const sb=await getClient();
    const {data,error}=await sb.auth.refreshSession({refresh_token:session.refresh_token});
    if(error||!data?.session){console.warn('JWT recovery refresh failed',error||'No session returned');recovering=false;return false}
    localStorage.removeItem(FLAG);
    location.reload();
    return true;
  }catch(e){console.warn('JWT recovery failed',e);recovering=false;return false}
}

const observer=new MutationObserver(()=>{
  if(/JWT issued at future/i.test(document.body?.innerText||''))forceRefresh();
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
