// Keep Cooking Confidential magic-link sign-in on the CC site even though
// the shared Supabase project also serves Ivy House. This wraps only the OTP
// request and leaves the existing email-code verification flow unchanged.
const sb=window.ccSupabase;
if(sb?.auth?.signInWithOtp&&!sb.auth.__ccRedirectWrapped){
  const original=sb.auth.signInWithOtp.bind(sb.auth);
  const parts=window.location.pathname.split('/').filter(Boolean);
  const base=window.location.hostname.endsWith('github.io')&&parts[0]?'/'+parts[0]+'/':'/';
  const redirectTo=window.location.origin+base;
  sb.auth.signInWithOtp=(args={})=>original({
    ...args,
    options:{...(args.options||{}),emailRedirectTo:redirectTo}
  });
  sb.auth.__ccRedirectWrapped=true;
  console.info('[CC auth] Magic-link redirect set to',redirectTo);
}
