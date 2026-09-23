// These functions are called directly from the browser (this app has no
// server of its own) — a plain, permissive CORS allowlist is standard for a
// public Supabase Edge Function gated by requiring a valid member session
// (see supabaseAdmin.ts's getSupabaseForUser), same as Supabase's own
// function-serving examples.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
