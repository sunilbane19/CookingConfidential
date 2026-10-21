import { supabase } from './auth-client.js?v=1.0.2';

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

try {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.warn('Cooking Confidential auth controls session check:', error.message);
  setAuthControls(data?.session || null);
} catch (error) {
  console.warn('Cooking Confidential auth controls session check failed:', error?.name || 'Error');
}

supabase.auth.onAuthStateChange((_event, nextSession) => setAuthControls(nextSession));
