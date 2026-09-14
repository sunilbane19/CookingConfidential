// Keep Supabase requests from hanging indefinitely in mobile in-app browsers.
(function(){
  const nativeFetch=window.fetch.bind(window);
  const SUPA='supabase.co/rest/';
  const REQUEST_TIMEOUT=9000;
  async function resilient(input,init){
    const url=typeof input==='string' ? input : (input&&input.url)||'';
    if(!url.includes(SUPA)) return nativeFetch(input,init);
    let lastError;
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT);
      try{
        const options={...(init||{}),signal:controller.signal,cache:'no-store'};
        const response=await nativeFetch(input,options);
        clearTimeout(timer);
        return response;
      }catch(error){
        clearTimeout(timer);
        lastError=error;
        if(attempt===0) await new Promise(r=>setTimeout(r,300));
      }
    }
    throw lastError;
  }
  window.fetch=resilient;
})();
