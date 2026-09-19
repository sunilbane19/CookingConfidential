import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
// Use the project's proven browser-safe anon key for Auth, matching the shared client.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd210ZmJxYnluaW1xdnd4b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI3MDYsImV4cCI6MjEwMzE1ODcwNn0.pwfoCI_ajYfrON8kxIV9XWMo9k2GvzCWqwcpsMxI1As';
const APP_URL = `${window.location.origin}${window.location.pathname}`;
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

// Temporary diagnostic override: keep the existing Supabase Auth flow, but
// expose the exact Auth error instead of the generic login message. This is
// deliberately isolated here so the normal app.js login implementation is
// untouched and can be restored once the root cause is identified.
if (loginForm) {
  loginForm.onsubmit = async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button');
    const email = document.querySelector('#emailInput')?.value.trim() || '';
    if (!button || button.disabled || !email) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    loginMessage.textContent = 'Sending sign-in link…';
    try {
      const result = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: APP_URL } });
      if (result.error) {
        const e = result.error;
        const details = [
          e.name ? `name=${e.name}` : '',
          e.code ? `code=${e.code}` : '',
          e.status ? `status=${e.status}` : '',
          e.message ? `message=${e.message}` : ''
        ].filter(Boolean).join(' · ');
        console.error('[Cooking Confidential auth diagnostic]', e);
        loginMessage.textContent = details || 'Auth request failed with no diagnostic details.';
        button.disabled = false;
        button.textContent = 'Send me a sign-in link';
        return;
      }
      console.info('[Cooking Confidential auth diagnostic] signInWithOtp succeeded');
      loginMessage.textContent = 'Check your email for the sign-in link.';
    } catch (e) {
      console.error('[Cooking Confidential auth diagnostic] unexpected error', e);
      loginMessage.textContent = `unexpected=${e?.name || 'Error'} · ${e?.message || String(e)}`;
      button.disabled = false;
      button.textContent = 'Send me a sign-in link';
    }
  };
}

const { data: { session } } = await supabase.auth.getSession();
setAuthControls(session);
supabase.auth.onAuthStateChange((_event, nextSession) => setAuthControls(nextSession));
