import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { sendBatchChunked } from './resend.ts';
import { decideDispatch, Recipient } from './memberEmailDispatchCore.ts';

export type { Recipient } from './memberEmailDispatchCore.ts';

// Round 56: the ONE real send site every present-and-future member-facing
// email goes through — the Sunday Drop email today, whatever's next
// tomorrow. The actual TEST/LIVE decision lives in the pure, offline-
// testable decideDispatch() (memberEmailDispatchCore.ts); this wrapper's
// only job is the one real side effect — reading email_settings.mode and
// actually calling Resend.
//
// admin-send-test-email never calls this at all — it's a separate,
// unconditional preview path that always sends the byte-for-byte real
// template to the owner regardless of mode, which is why it has no
// connection to this file (or memberEmailDispatchCore.ts) whatsoever.
export async function dispatchToMembers(subject: string, html: string, recipients: Recipient[]): Promise<{ ok: boolean; errors: string[] }> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('email_settings').select('mode').eq('id', 1).maybeSingle();
  const mode: 'test' | 'live' = data?.mode === 'live' ? 'live' : 'test';
  const envelopes = decideDispatch(mode, recipients, subject, html);
  return sendBatchChunked(envelopes);
}
