import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://yiwmtfbqbynimqvwxosu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EG30cid4BVU1vr6EeM3f9g_hztA7Wpu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
