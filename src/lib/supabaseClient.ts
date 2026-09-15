import { createClient } from '@supabase/supabase-js';

// This app is a static site with no server (see supabase/setup.sql for the
// full backend) — every Supabase call goes straight from the browser, which
// is exactly what the publishable (anon) key below is for. It only ever
// grants what Row Level Security explicitly allows, so it's safe to commit.
// NEVER put a service role / secret key here or anywhere else in this repo.
const SUPABASE_URL = 'https://qooezwnskaqvmquydijg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NY6-jOLbU06obIonOevItg_fMs_VGqs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Keeps a signed-in member signed in across visits/app opens (fixes the
    // "asked to sign in every time" bug) — supabase-js persists the session
    // to the browser's localStorage and silently refreshes it by default.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// True once we've conclusively learned the backend is unreachable or the
// schema from supabase/setup.sql hasn't been run yet (missing table/relation
// errors) — every data context checks this so the app can show one calm,
// consistent message instead of crashing or hanging on a blank screen.
export function isBackendUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  // PostgREST: 42P01 = undefined_table, PGRST205 = table not in schema
  // cache (both mean "setup.sql hasn't been run yet" in this app's case).
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const message = (err.message ?? '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
  );
}
