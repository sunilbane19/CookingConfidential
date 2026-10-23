import './auth-redirect-fix.js?v=1.0.0';
// Reuse the single Supabase client created by app.js. No second Auth client/storage.
const signOutBtn = document.querySelector('#signOutBtn');
const authOnly = () => document.querySelectorAll('.auth-only');
function setAuthControls(session) {
  authOnly().forEach(el => { el.hidden = !session; });
}
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    const supabase = window.ccSupabase;
    if (!supabase || signOutBtn.disabled) return;
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
