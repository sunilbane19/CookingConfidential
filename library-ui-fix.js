// Network resilience is installed from this module because it is loaded immediately after the app shell starts.
// It prevents a stalled Supabase request from leaving the recipe library on an infinite loading state.
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
