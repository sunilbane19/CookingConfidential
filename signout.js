import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
// Use the project's proven browser-safe anon key for Auth, matching the shared client.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd210ZmJxYnluaW1xdnd4b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI3MDYsImV4cCI6MjEwMzE1ODcwNn0.pwfoCI_ajYfrON8kxIV9XWMo9k2GvzCWqwcpsMxI1As';
const CC_SITE_BASE = (window.location.hostname.endsWith('github.io') ? ('/' + (window.location.pathname.split('/').filter(Boolean)[0] || '') + '/') : '/');
const APP_URL = `${window.location.origin}${CC_SITE_BASE}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const signOutBtn = document.querySelector('#signOutBtn');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
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

const { data: { session } } = await supabase.auth.getSession();
setAuthControls(session);
supabase.auth.onAuthStateChange((_event, nextSession) => setAuthControls(nextSession));
