import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';
import { buildWeeklyReleaseEmail } from '../_shared/weeklyReleaseEmail.ts';
import { sendEmail } from '../_shared/resend.ts';
// Round 57: MEMBER_REPLY_TO only — this is the pure, zero-import core
// (no Supabase client, no email_settings read, no TEST/LIVE logic
// whatsoever), never the memberEmailDispatch.ts wrapper that actually
// enforces EMAIL TEST MODE. Reusing the one shared constant here avoids a
// second hardcoded copy of the same address without creating the
// dependency this function is deliberately built to avoid.
import { MEMBER_REPLY_TO } from '../_shared/memberEmailDispatchCore.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const OWNER_EMAIL = 'docsfitnessnj@gmail.com';
const FROM_MEMBER = "Doc's Fitness <doc@docsfitnessnj.com>";

// A PERMANENT admin feature, not a one-time verification step — reachable
// any number of times, from the EMAIL admin screen, so Doc can proof the
// Sunday Drop email on his phone and laptop before any real send, every
// week. verify_jwt is true (config.toml): a real signed-in admin session
// is required, checked the same way every other admin-only Edge Function
// in this app does (getSupabaseForUser -> auth.getUser(), then a
// service-role profiles.is_admin check — never trusting RLS alone to be
// the only gate on a privileged action).
//
// Deliberately never imports memberEmailDispatch.ts / dispatchToMembers at
// all — this sends the byte-for-byte real template (buildWeeklyReleaseEmail
// is the SAME renderer send-weekly-release-email uses) with no [TEST]
// prefix, no banner, always to the owner's own inbox, regardless of
// whatever EMAIL TEST MODE currently is. That asymmetry (this function
// has zero connection to the mode switch) is itself the static-source
// guarantee the suite checks for.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseForUser = getSupabaseForUser(req.headers.get('Authorization'));
  const { data: userData, error: userError } = await supabaseForUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in.' }, 401);

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: 'Admin only.' }, 403);

  // The next scheduled (not yet released) week, else the most recently
  // released one — resolved here, server-side, so there's no drift
  // between what the admin screen shows and what this actually sends.
  const { data: nextWeek } = await admin
    .from('scheduled_weeks')
    .select('id')
    .is('released_at', null)
    .order('release_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let weekId: string | undefined = nextWeek?.id;
  if (!weekId) {
    const { data: lastReleased } = await admin
      .from('scheduled_weeks')
      .select('id')
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    weekId = lastReleased?.id;
  }

  if (!weekId) return json({ error: 'No scheduled week exists yet to preview.' }, 404);

  const email = await buildWeeklyReleaseEmail(admin, weekId);
  if (!email) return json({ error: 'Could not render that week.' }, 500);

  const result = await sendEmail({ from: FROM_MEMBER, to: OWNER_EMAIL, subject: email.subject, html: email.html, reply_to: MEMBER_REPLY_TO });
  if (!result.ok) return json({ error: result.error ?? 'Resend send failed.' }, 502);

  return json({ sent: true, week: email.weekLabel });
});
