// Round 56: the pure decision behind EMAIL TEST MODE, deliberately kept in
// its own zero-import file so it can be exercised with `deno test`
// completely offline — no live Resend, no live database, no live pg_net.
// memberEmailDispatch.ts (which DOES need the Supabase admin client and
// the real Resend-calling code, both of which pull in network-resolved
// imports) wraps this with the one real side effect: reading
// email_settings.mode and actually sending.
export type Recipient = { email: string; display_name: string | null };
export type EmailEnvelope = { from: string; to: string; subject: string; html?: string; text?: string; reply_to?: string };

export const OWNER_EMAIL = 'docsfitnessnj@gmail.com';
export const FROM_MEMBER = "Doc's Fitness <doc@docsfitnessnj.com>";
export const TEST_PREVIEW_COUNT = 5;
// Round 57: a member who hits reply on the Sunday Drop needs to land in a
// real, read inbox, not an address with no mailbox — same address as
// OWNER_EMAIL, kept as its own named constant since the two mean different
// things here (one is "who gets the owner's alerts," the other is "who a
// MEMBER'S reply reaches").
export const MEMBER_REPLY_TO = 'docsfitnessnj@gmail.com';

// Given the real mode and the real recipient list, exactly what envelope(s)
// would go out. LIVE: the real recipients, unmodified. TEST (the default):
// reroute to exactly one copy, to the owner, with the subject prefixed and
// a banner stating the real recipient count and the first few real
// addresses — no member ever receives anything here, by construction (a
// `mode !== 'live'` branch can only ever produce the one owner-addressed
// envelope below; there is no code path in this function that can return
// an envelope addressed to anyone else while in TEST). Every envelope
// either branch produces carries reply_to — this function's whole job is
// "what would a member's copy of the Sunday Drop look like," and that
// email always needs a real reply address, regardless of which mode is
// deciding who it's actually addressed to.
export function decideDispatch(mode: 'test' | 'live', recipients: Recipient[], subject: string, html: string): EmailEnvelope[] {
  if (mode === 'live') {
    return recipients.map((r) => ({ from: FROM_MEMBER, to: r.email, subject, html, reply_to: MEMBER_REPLY_TO }));
  }

  const addresses = recipients.map((r) => r.email);
  const previewAddresses = addresses.slice(0, TEST_PREVIEW_COUNT);
  const banner =
    '<div style="background-color:#FDF8E7;border:1px solid #E5B80B;border-radius:8px;padding:12px 16px;margin:0 0 20px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#12211C;">' +
    `<strong>TEST MODE</strong> — this would have gone to ${recipients.length} member${recipients.length === 1 ? '' : 's'}.` +
    (previewAddresses.length > 0 ? ` First ${previewAddresses.length}: ${previewAddresses.join(', ')}` : '') +
    '</div>';

  return [{ from: FROM_MEMBER, to: OWNER_EMAIL, subject: `[TEST] ${subject}`, html: banner + html, reply_to: MEMBER_REPLY_TO }];
}
