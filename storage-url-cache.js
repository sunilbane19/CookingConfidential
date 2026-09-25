// In-memory signed-URL cache for private Storage objects.
// Reusing the exact signed URL lets the browser/CDN see the same cache key
// instead of generating a new token for every read.
const cache=new Map();
const pending=new Map();
const DEFAULT_EXPIRES=900;
const REFRESH_MARGIN=45;

export async function getCachedSignedUrl(client,bucket,path,expiresIn=DEFAULT_EXPIRES){
  const key=String(bucket)+'::'+String(path);
  const now=Date.now();
  const hit=cache.get(key);
  if(hit && hit.expiresAt>now+REFRESH_MARGIN*1000)return hit.url;
  if(pending.has(key))return pending.get(key);
  const request=(async()=>{
    const{data,error}=await client.storage.from(bucket).createSignedUrl(path,expiresIn);
    if(error||!data?.signedUrl)throw Error(error?.message||'Could not create a signed URL.');
    cache.set(key,{url:data.signedUrl,expiresAt:Date.now()+(Math.max(60,expiresIn-REFRESH_MARGIN)*1000)});
    return data.signedUrl;
  })();
  pending.set(key,request);
  try{return await request}finally{pending.delete(key)}
}

export function clearCachedSignedUrl(bucket,path){
  cache.delete(String(bucket)+'::'+String(path));
}
