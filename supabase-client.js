import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
// Use the project's proven legacy anon key for the shared browser client.
// This is intentionally public/browser-safe and avoids the publishable-key
// path that is producing the Invalid API key response in the import modules.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpd210ZmJxYnluaW1xdnd4b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI3MDYsImV4cCI6MjEwMzE1ODcwNn0.pwfoCI_ajYfrON8kxIV9XWMo9k2GvzCWqwcpsMxI1As';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
