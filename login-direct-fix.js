// Guaranteed login submit handler. This is intentionally a classic script (not a module)
// so the sign-in button still works even if another module is slow or fails to load.
(function(){
  const SUPABASE_URL='https://yiwmtfbqbynimqvwxosu.supabase.co';
  const SUPABASE_KEY='sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
  const TIMEOUT_MS=15000;

  document.addEventListener('submit',function(event){
    const form=event.target;
    if(!form || form.id!=='loginForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const input=form.querySelector('#emailInput');
    const button=form.querySelector('button');
    const message=form.querySelector('#loginMessage');
    const email=String(input?.value||'').trim();
    if(!email || !button) return;

    button.disabled=true;
    button.textContent='Sending…';
    if(message) message.textContent='Sending sign-in link…';

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);

    fetch(SUPABASE_URL+'/auth/v1/otp',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
      body:JSON.stringify({email:email,create_user:false,gotrue_meta_security:{} ,redirect_to:new URL('./',location.href).href}),
      signal:controller.signal
    }).then(async response=>{
      let body={};
      try{body=await response.json()}catch{}
      if(!response.ok){
        const err=body?.msg||body?.message||body?.error_description||('Sign-in request failed ('+response.status+').');
        throw new Error(err);
      }
      if(message) message.textContent='Check your email for the sign-in link.';
    }).catch(error=>{
      console.error('Cooking Confidential direct sign-in:',error);
      const text=error?.name==='AbortError'?'The sign-in request timed out. Please check your connection and try again.':String(error?.message||error||'Could not send the sign-in link.');
      if(message) message.textContent=text;
      button.disabled=false;
      button.textContent='Send me a sign-in link';
    }).finally(()=>clearTimeout(timer));
  },true);
})();
