// Network resilience and authentication recovery are installed from this module because it is loaded immediately after the app shell starts.
// It prevents stalled Supabase requests from leaving the recipe library on an infinite loading state.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CC_SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
const CC_SUPABASE_KEY='sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
const ccFetchNative=window.fetch.bind(window);
const ccSupabaseHost='supabase.co';
window.fetch=async(input,init={})=>{
  const url=typeof input==='string' ? input : (input?.url||'');
  if(!url.includes(ccSupabaseHost)) return ccFetchNative(input,init);
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    try{
      const response=await ccFetchNative(input,{...init,signal:controller.signal,cache:'no-store'});
      clearTimeout(timer);
      return response;
    }catch(error){
      clearTimeout(timer);lastError=error;
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,300));
    }
  }
  throw lastError;
};

const ccAuth=createClient(CC_SUPABASE_URL,CC_SUPABASE_KEY);
const ccLoginMessage=document.querySelector('#loginMessage');
const ccLoginForm=document.querySelector('#loginForm');
const ccLoginButton=ccLoginForm?.querySelector('button');

function ccSetLoginMessage(message,isError=false){
  if(!ccLoginMessage)return;
  ccLoginMessage.textContent=message;
  ccLoginMessage.dataset.state=isError?'error':'ok';
}

function ccFriendlyAuthError(error){
  const message=String(error?.message||error||'Unable to complete sign-in.');
  if(/rate limit|too many requests/i.test(message)) return 'Please wait about 60 seconds before requesting another sign-in link.';
  if(/expired|invalid.*token|token.*invalid|otp_expired/i.test(message)) return 'This sign-in link has expired or has already been used. Please request a new link.';
  if(/redirect.*url|not allowed/i.test(message)) return 'The sign-in redirect is not configured correctly. Please try again later.';
  return message;
}

// Replace the app shell's generic login error with the real Supabase Auth error.
if(ccLoginForm){
  ccLoginForm.onsubmit=async event=>{
    event.preventDefault();
    if(!ccLoginButton||ccLoginButton.disabled)return;
    const email=document.querySelector('#emailInput')?.value.trim();
    if(!email){ccSetLoginMessage('Please enter your email address.',true);return;}
    ccLoginButton.disabled=true;
    ccLoginButton.textContent='Sending…';
    ccSetLoginMessage('Sending sign-in link…');
    try{
      const {error}=await ccAuth.auth.signInWithOtp({email,options:{emailRedirectTo:'https://cookingconfidential.in/'}});
      if(error)throw error;
      ccSetLoginMessage('Check your email for the new sign-in link.');
    }catch(error){
      console.error('Cooking Confidential sign-in:',error);
      ccSetLoginMessage(ccFriendlyAuthError(error),true);
    }finally{
      ccLoginButton.disabled=false;
      ccLoginButton.textContent='Send me a sign-in link';
    }
  };
}

// Explicitly handle token_hash callbacks. This makes the magic-link flow deterministic
// and gives an actionable error instead of allowing an invalid callback to render blank.
(async()=>{
  const params=new URLSearchParams(window.location.search);
  const tokenHash=params.get('token_hash');
  const type=params.get('type');
  if(!tokenHash)return;

  try{
    ccSetLoginMessage('Completing sign-in…');
    try{await ccAuth.auth.signOut({scope:'local'});}catch(_){ }
    const {error}=await ccAuth.auth.verifyOtp({token_hash:tokenHash,type:type||'email'});
    if(error)throw error;
    window.history.replaceState({},document.title,window.location.pathname||'/');
  }catch(error){
    console.error('Cooking Confidential magic-link verification:',error);
    try{await ccAuth.auth.signOut({scope:'local'});}catch(_){ }
    window.history.replaceState({},document.title,window.location.pathname||'/');
    ccSetLoginMessage(ccFriendlyAuthError(error),true);
    const loginPanel=document.querySelector('#loginPanel');
    const appPanel=document.querySelector('#appPanel');
    if(loginPanel)loginPanel.hidden=false;
    if(appPanel)appPanel.hidden=true;
  }
})();
