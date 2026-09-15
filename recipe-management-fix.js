// Legacy compatibility shim.
// Recipe editing is now owned by recipe-edit-fix.js.
// Keep this file free of its former Supabase client/key so an old import
// can never trigger the obsolete API key error.
import './recipe-edit-fix.js?v=1.0.2';
