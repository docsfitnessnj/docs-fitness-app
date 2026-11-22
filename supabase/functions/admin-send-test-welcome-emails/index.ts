import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';
import { buildWelcomeEmail } from '../_shared/welcomeEmail.ts';
import { sendEmail } from '../_shared/resend.ts';
// Round 57/64: MEMBER_REPLY_TO only — this is the pure, zero-import core
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
// any number of times, from the EMAIL admin screen's SEND TEST WELCOME
// EMAILS button, so Doc can proof BOTH welcome-email versions on his
// phone and laptop before any real signup ever reaches either one.
// verify_jwt is true (config.toml): a real signed-in admin session is
// required, checked the same way every other admin-only Edge Function in
// this app does.
//
// Deliberately never imports memberEmailDispatch.ts / dispatchToMembers at
// all — same asymmetry as admin-send-test-email: this sends the
// byte-for-byte real template (buildWelcomeEmail is the SAME renderer
// notify-new-signup uses) straight to the owner's own inbox, independent
// of whatever EMAIL TEST MODE currently is, with no [TEST] prefix and no
// banner. Each of the two versions gets its own distinguishing subject
// prefix instead, so both land in the same inbox without being confused
// for one another.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseForUser = getSupabaseForUser(req.headers.get('Authorization'));
  const { data: userData, error: userError } = await supabaseForUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in.' }, 401);

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: 'Admin only.' }, 403);

  const online = buildWelcomeEmail('online');
  const inPerson = buildWelcomeEmail('in_person');

  const [onlineResult, inPersonResult] = await Promise.all([
    sendEmail({ from: FROM_MEMBER, to: OWNER_EMAIL, subject: `[WELCOME TEST: ONLINE] ${online.subject}`, html: online.html, reply_to: MEMBER_REPLY_TO }),
    sendEmail({
      from: FROM_MEMBER,
      to: OWNER_EMAIL,
      subject: `[WELCOME TEST: IN PERSON] ${inPerson.subject}`,
      html: inPerson.html,
      reply_to: MEMBER_REPLY_TO,
    }),
  ]);

  if (!onlineResult.ok || !inPersonResult.ok) {
    return json({ error: onlineResult.error ?? inPersonResult.error ?? 'Resend send failed.' }, 502);
  }

  return json({ sent: true });
});
