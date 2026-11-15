// Round 56: verifies a request genuinely came from THIS project's own
// pg_net trigger/cron calls, never a real member session — notify-new-
// signup and send-weekly-release-email both have verify_jwt = false (see
// config.toml) since a Postgres trigger/cron call carries no Supabase JWT
// at all. This is the same "verify a different way" shape stripe-webhook
// already uses with Stripe's own signature header — here the shared
// secret is set once by Doc, in two places that must match exactly: via
// `select vault.create_secret(...)` in the SQL editor (so
// migration_033.sql's trigger/cron functions can read it to send as this
// same header) and as the DB_WEBHOOK_SECRET Edge Function secret this
// checks against. See migration_033.sql's own top comment for the exact
// one-time setup steps.
export function verifyWebhookSecret(req: Request): boolean {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret) return false;
  return req.headers.get('x-webhook-secret') === secret;
}
