import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const signOutBtn = document.querySelector('#signOutBtn');
const authOnly = () => document.querySelectorAll('.auth-only');

function setAuthControls(session) {
  authOnly().forEach(el => { el.hidden = !session; });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    if (signOutBtn.disabled) return;
    signOutBtn.disabled = true;
    signOutBtn.textContent = 'Signing out…';
    const { error } = await supabase.auth.signOut();
    if (error) {
      signOutBtn.disabled = false;
      signOutBtn.textContent = 'Sign out';
      alert('We could not sign you out right now. Please try again.');
      return;
    }
    setAuthControls(null);
    window.location.reload();
  });
}

// Do not call getSession() here. app.js already owns session bootstrap;
// a second getSession() can race a token refresh and produce
// “Refresh result discarded: session state changed mid-flight”.
supabase.auth.onAuthStateChange((_event, nextSession) => setAuthControls(nextSession));
