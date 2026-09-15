import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Authentication recovery plus a single, reliable magic-link handler.
const URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const KEY='sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
const STORAGE='sb-yiwmtfbqbynimqvwxosu-auth-token';
const FLAG='cc-jwt-future-recovery';
let recovering=false;
const sb=createClient(URL,KEY);

function storedSession(){try{const raw=localStorage.getItem(STORAGE);if(!raw)return null;const v=JSON.parse(raw);return v?.currentSession||v?.session||v||null}catch{return null}}
async function forceRefresh(){if(recovering)return false;const now=Date.now();if(now-Number(localStorage.getItem(FLAG)||0)<60000)return false;const session=storedSession();if(!session?.refresh_token)return false;recovering=true;localStorage.setItem(FLAG,String(now));try{const {data,error}=await sb.auth.refreshSession({refresh_token:session.refresh_token});if(error||!data?.session){console.warn('JWT recovery refresh failed',error||'No session returned');recovering=false;return false}localStorage.removeItem(FLAG);location.reload();return true}catch(e){console.warn('JWT recovery failed',e);recovering=false;return false}}

// Capture the submit before app.js's legacy handler so the old generic message
// cannot hide the real Supabase error. Use the exact current site as redirect.
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement)||form.id!=='loginForm')return;
  event.preventDefault();event.stopImmediatePropagation();
  const input=form.querySelector('#emailInput'),button=form.querySelector('button'),message=form.querySelector('#loginMessage');
  const email=String(input?.value||'').trim();if(!email||!button||button.disabled)return;
  button.disabled=true;button.textContent='Sending…';if(message)message.textContent='Sending sign-in link…';
  try{
    const redirectTo=new URL('./',location.href).href;
    const result=await Promise.race([
      sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:false}}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('The sign-in request timed out. Please check your connection and try again.')),15000))
    ]);
    if(result.error)throw result.error;
    if(message)message.textContent='Check your email for the sign-in link.';
  }catch(error){
    console.error('Cooking Confidential sign-in:',error);
    const raw=String(error?.message||error||'Could not send the sign-in link.');
    const lower=raw.toLowerCase();
    if(message)message.textContent=(lower.includes('rate limit')||lower.includes('too many requests'))?'Please wait about 60 seconds before requesting another sign-in link.':raw;
    button.disabled=false;button.textContent='Send me a sign-in link';
  }
},true);

const observer=new MutationObserver(()=>{if(/JWT issued at future/i.test(document.body?.innerText||''))forceRefresh()});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});