// Round 56: exercises the real, unmodified TEST/LIVE decision completely
// offline — no live Resend, no live database, no live pg_net needed, since
// memberEmailDispatchCore.ts has zero imports of its own. Run with:
//   deno test supabase/functions/_shared/memberEmailDispatchCore.test.ts
// Deno's own built-in Node compat layer (no network fetch needed — this is
// bundled with the Deno binary itself, unlike a deno.land/std import).
import { strict as nodeAssert } from 'node:assert';
import { decideDispatch, OWNER_EMAIL, FROM_MEMBER, Recipient } from './memberEmailDispatchCore.ts';

function assertEquals<T>(actual: T, expected: T) {
  nodeAssert.deepStrictEqual(actual, expected);
}

const RECIPIENTS: Recipient[] = [
  { email: 'a@example.com', display_name: 'A' },
  { email: 'b@example.com', display_name: 'B' },
  { email: 'c@example.com', display_name: 'C' },
];

Deno.test('LIVE mode sends to every real recipient, unmodified subject/html', () => {
  const envelopes = decideDispatch('live', RECIPIENTS, 'THE NEW WEEK IS LIVE', '<p>body</p>');
  assertEquals(envelopes.length, RECIPIENTS.length);
  for (let i = 0; i < RECIPIENTS.length; i++) {
    assertEquals(envelopes[i].to, RECIPIENTS[i].email);
    assertEquals(envelopes[i].from, FROM_MEMBER);
    assertEquals(envelopes[i].subject, 'THE NEW WEEK IS LIVE');
    assertEquals(envelopes[i].html, '<p>body</p>');
  }
});

Deno.test('TEST mode produces exactly ONE envelope, to the owner, never to any real member', () => {
  const envelopes = decideDispatch('test', RECIPIENTS, 'THE NEW WEEK IS LIVE', '<p>body</p>');
  assertEquals(envelopes.length, 1);
  assertEquals(envelopes[0].to, OWNER_EMAIL);
  for (const r of RECIPIENTS) {
    assertEquals(envelopes[0].to === r.email, false);
  }
});

Deno.test('TEST mode prefixes the subject with [TEST]', () => {
  const envelopes = decideDispatch('test', RECIPIENTS, 'THE NEW WEEK IS LIVE', '<p>body</p>');
  assertEquals(envelopes[0].subject, '[TEST] THE NEW WEEK IS LIVE');
});

Deno.test('TEST mode banner states the real recipient count and the real addresses', () => {
  const envelopes = decideDispatch('test', RECIPIENTS, 'Subject', '<p>real content</p>');
  const html = envelopes[0].html ?? '';
  assertEquals(html.includes('3 members'), true);
  assertEquals(html.includes('a@example.com'), true);
  assertEquals(html.includes('b@example.com'), true);
  assertEquals(html.includes('c@example.com'), true);
  // the real content is still there, underneath the banner
  assertEquals(html.includes('<p>real content</p>'), true);
});

Deno.test('TEST mode banner lists only the first few addresses when the list is long', () => {
  const many: Recipient[] = Array.from({ length: 12 }, (_, i) => ({ email: `m${i}@example.com`, display_name: null }));
  const envelopes = decideDispatch('test', many, 'Subject', '<p>body</p>');
  const html = envelopes[0].html ?? '';
  assertEquals(html.includes('12 members'), true);
  assertEquals(html.includes('First 5'), true);
  assertEquals(html.includes('m0@example.com'), true);
  assertEquals(html.includes('m4@example.com'), true);
  // the 6th+ address is NOT listed in the preview
  assertEquals(html.includes('m5@example.com'), false);
});

Deno.test('TEST mode with zero recipients still produces exactly one owner-addressed envelope', () => {
  const envelopes = decideDispatch('test', [], 'Subject', '<p>body</p>');
  assertEquals(envelopes.length, 1);
  assertEquals(envelopes[0].to, OWNER_EMAIL);
  assertEquals((envelopes[0].html ?? '').includes('0 members'), true);
});

Deno.test('singular "member" (not "members") when exactly one recipient', () => {
  const envelopes = decideDispatch('test', [RECIPIENTS[0]], 'Subject', '<p>body</p>');
  assertEquals((envelopes[0].html ?? '').includes('1 member.'), true);
});
