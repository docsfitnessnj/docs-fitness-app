// A thin wrapper over Resend's own REST API — no SDK dependency, just
// fetch(). RESEND_API_KEY is a Supabase project secret Doc sets himself
// (Project Settings -> Edge Functions -> Secrets), read from the
// environment exactly like STRIPE_SECRET_KEY — never hardcoded, never
// logged.
const RESEND_API = 'https://api.resend.com';

function getResendKey(): string {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    throw new Error('RESEND_API_KEY is not set — add it as a Supabase Edge Function secret.');
  }
  return key;
}

export type SendEmailInput = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  // Round 57: Resend's own field name, passed straight through in the
  // request body below — set on the Sunday Drop so a member who hits
  // reply reaches a real inbox (docsfitnessnj@gmail.com), never an address
  // nobody reads. Owner alerts (New Member Alert, Payment Alert) don't set
  // this at all — a reply to those is already going to the owner's own
  // inbox, there's nothing to redirect.
  reply_to?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getResendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error calling Resend.' };
  }
}

// Resend's own documented batch endpoint accepts up to 100 messages per
// call — this environment has no live network path to Resend to reconfirm
// that limit, so it's a named constant here, trivial to adjust if Resend's
// own published cap ever changes.
export const RESEND_BATCH_LIMIT = 100;

async function sendBatch(messages: SendEmailInput[]): Promise<{ ok: boolean; error?: string }> {
  if (messages.length === 0) return { ok: true };
  try {
    const res = await fetch(`${RESEND_API}/emails/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getResendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend batch ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error calling Resend batch.' };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Chunks an arbitrarily large recipient list (hundreds of members) into
// groups of RESEND_BATCH_LIMIT and issues one batch call per chunk,
// sequentially — simple and correct over clever; this app's real member
// count is nowhere near the volume where sequential chunking would be a
// real bottleneck.
export async function sendBatchChunked(messages: SendEmailInput[]): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const group of chunk(messages, RESEND_BATCH_LIMIT)) {
    const result = await sendBatch(group);
    if (!result.ok && result.error) errors.push(result.error);
  }
  return { ok: errors.length === 0, errors };
}

// Resolves the Resend Audience id for "The Weekly Kettlebell": an explicit
// RESEND_AUDIENCE_ID secret wins if Doc sets one (e.g. after creating the
// audience once by hand), otherwise looks it up by name, creating it on
// first use if it doesn't exist yet. Stateless by design — this only ever
// runs once per signup, so re-resolving by name each time costs nothing
// and needs no cache.
export async function findOrCreateAudience(name: string): Promise<string | null> {
  const envId = Deno.env.get('RESEND_AUDIENCE_ID');
  if (envId) return envId;

  try {
    const listRes = await fetch(`${RESEND_API}/audiences`, {
      headers: { Authorization: `Bearer ${getResendKey()}` },
    });
    if (listRes.ok) {
      const data = await listRes.json().catch(() => null);
      const existing = (data?.data ?? []).find(
        (a: { id: string; name: string }) => a.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) return existing.id;
    }

    const createRes = await fetch(`${RESEND_API}/audiences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getResendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json().catch(() => null);
    return created?.id ?? null;
  } catch {
    return null;
  }
}

// Adds a contact to an Audience — the app only ever ADDS, never removes;
// an unsubscribe/uncheck later is entirely Resend's own state. A contact
// that already exists (the owner's own CSV import, or a repeat signup) is
// treated as success either way — this is a best-effort sync, never worth
// failing a signup over.
export async function addContactToAudience(audienceId: string, email: string, firstName?: string): Promise<void> {
  try {
    await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getResendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, first_name: firstName, unsubscribed: false }),
    });
  } catch {
    // Best-effort — never worth failing anything over.
  }
}
