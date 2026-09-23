import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every deployed Edge Function by the Supabase platform itself — Doc does
// NOT need to set these two by hand. The service role key bypasses Row
// Level Security entirely, which is exactly why only these trusted server
// functions ever get to use it — the app's browser code never sees it.
export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// A client scoped to whichever member is actually calling the function —
// forwards their own Authorization header through so auth.getUser() proves
// who they are, and any query still goes through normal Row Level Security
// (this client never bypasses anything). SUPABASE_ANON_KEY is also injected
// automatically by the platform.
export function getSupabaseForUser(authHeader: string | null) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}
