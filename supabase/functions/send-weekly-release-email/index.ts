import { corsHeaders } from '../_shared/cors.ts';
import { verifyWebhookSecret } from '../_shared/webhookAuth.ts';
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { buildWeeklyReleaseEmail } from '../_shared/weeklyReleaseEmail.ts';
import { dispatchToMembers } from '../_shared/memberEmailDispatch.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Called by migration_033.sql's release_scheduled_weeks_if_due() over
// pg_net, exactly once per week (the same `released_at is null` guard
// that already makes the release post exactly-once covers this too — see
// that function's own comment). verify_jwt is false (config.toml);
// verifyWebhookSecret() is the real gate, same as notify-new-signup.
//
// This is the ONE real send site for the Sunday Drop email — it always
// goes through dispatchToMembers (_shared/memberEmailDispatch.ts), which
// is what actually enforces EMAIL TEST MODE. Recipients and content are
// both re-resolved here from the database rather than trusted from the
// trigger's own payload (which only ever carries a week_id) — a single
// source of truth, shared verbatim with admin-send-test-email via
// buildWeeklyReleaseEmail, so the two can never render differently.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!verifyWebhookSecret(req)) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const weekId: string | undefined = body.week_id;
  if (!weekId) return json({ error: 'week_id is required' }, 400);

  const admin = getSupabaseAdmin();
  const email = await buildWeeklyReleaseEmail(admin, weekId);
  if (!email) return json({ error: 'No such scheduled week.' }, 404);

  const { data: recipients, error: recError } = await admin.rpc('weekly_release_email_recipients');
  if (recError) {
    console.error('send-weekly-release-email: could not load recipients', recError);
    return json({ error: recError.message }, 500);
  }

  const result = await dispatchToMembers(email.subject, email.html, recipients ?? []);
  if (!result.ok) {
    console.error('send-weekly-release-email: dispatch had errors', result.errors);
  }

  return json({
    sent: result.ok,
    errors: result.errors,
    recipientCount: (recipients ?? []).length,
    week: email.weekLabel,
  });
});
