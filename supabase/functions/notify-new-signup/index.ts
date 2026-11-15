import { corsHeaders } from '../_shared/cors.ts';
import { verifyWebhookSecret } from '../_shared/webhookAuth.ts';
import { sendEmail, findOrCreateAudience, addContactToAudience } from '../_shared/resend.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const OWNER_EMAIL = 'docsfitnessnj@gmail.com';
const FROM_ALERTS = "Doc's Fitness Alerts <alerts@docsfitnessnj.com>";
const NEWSLETTER_AUDIENCE_NAME = 'The Weekly Kettlebell';

function labelForSignupPath(path: string | null): string {
  switch (path) {
    case 'online_trial':
      return 'Online Trial';
    case 'book_class':
      return 'Booking';
    case 'undecided':
      return 'Undecided (left on the About page / How Do You Train screen)';
    default:
      return 'Unknown';
  }
}

// Called by migration_033.sql's handle_new_user() trigger over pg_net —
// verify_jwt is false (config.toml), since a Postgres trigger has no
// Supabase JWT at all; verifyWebhookSecret() is the real gate instead.
// Never touches dispatchToMembers/EMAIL TEST MODE at all — this is the
// owner's own alert, exempt from that switch by construction, since it
// only ever reaches the owner's inbox regardless.
//
// Two independent jobs, both best-effort: the plain operational ping to
// the owner, and — only if the signup checkbox was checked — adding the
// new member to the Resend Audience. A failure in either is logged, never
// thrown back at the trigger that called this (which already completed
// the real work, the profile row, before this ever ran).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!verifyWebhookSecret(req)) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = body.email;
  const displayName: string = body.display_name ?? 'Member';
  const signupPath: string | null = body.signup_path ?? null;
  const newsletterOptIn: boolean = !!body.newsletter_opt_in;

  if (!email) return json({ error: 'email is required' }, 400);

  const alertResult = await sendEmail({
    from: FROM_ALERTS,
    to: OWNER_EMAIL,
    subject: `New Signup: ${displayName}`,
    text: `${displayName} just signed up.\n\nEmail: ${email}\nPath: ${labelForSignupPath(signupPath)}`,
  });
  if (!alertResult.ok) {
    console.error('notify-new-signup: owner alert failed', alertResult.error);
  }

  if (newsletterOptIn) {
    try {
      const audienceId = await findOrCreateAudience(NEWSLETTER_AUDIENCE_NAME);
      if (audienceId) {
        await addContactToAudience(audienceId, email, displayName);
      } else {
        console.error('notify-new-signup: could not resolve the newsletter audience id');
      }
    } catch (err) {
      console.error('notify-new-signup: newsletter audience add failed', err);
    }
  }

  return json({ received: true });
});
