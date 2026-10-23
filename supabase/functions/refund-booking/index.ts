import { corsHeaders } from '../_shared/cors.ts';
import { getStripe } from '../_shared/stripe.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Called by ClassBookingContext.cancel() right after cancel_class_booking
// (migration_023) returns needs_stripe_refund: true — a cancelled drop-in
// or Downbeach Pilates booking, "auto refunded through Stripe server
// side." Deliberately takes only `bookingId`, never a Stripe session id
// the client could hand in directly — every fact this function acts on
// (whose booking it is, what was actually paid, whether it's really
// cancelled) is re-derived server-side from the booking's own row via the
// service-role client, so a client can only ever trigger a refund for a
// booking that is genuinely its own, genuinely cancelled, and genuinely
// paid — the RPC's own ownership check is not trusted to have been the
// only gate, since this is a separate HTTP endpoint with its own
// service-role reach.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseForUser = getSupabaseForUser(req.headers.get('Authorization'));
    const { data: userData, error: userError } = await supabaseForUser.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'Not signed in.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId : null;
    if (!bookingId) {
      return json({ error: 'Missing bookingId.' }, 400);
    }

    const admin = getSupabaseAdmin();
    const { data: booking, error: bookingError } = await admin
      .from('class_bookings')
      .select('user_id, payment_method, status, stripe_checkout_session_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError || !booking) {
      return json({ error: 'Booking not found.' }, 404);
    }
    if (booking.user_id !== userData.user.id) {
      return json({ error: 'Not your booking.' }, 403);
    }
    if (!['drop_in_paid', 'pilates_paid'].includes(booking.payment_method)) {
      // Nothing to refund (unlimited/pack_credit/first_class_free never
      // charged a card) — not an error, just a no-op this caller should
      // never actually hit given cancel_class_booking's own
      // needs_stripe_refund gate, but harmless either way.
      return json({ ok: true, skipped: true });
    }
    if (booking.status !== 'cancelled') {
      return json({ error: 'Booking is not cancelled.' }, 400);
    }
    if (!booking.stripe_checkout_session_id) {
      return json({ error: 'No payment on record for this booking.' }, 400);
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId) {
      return json({ error: 'No payment found for this booking.' }, 400);
    }

    // idempotency_key: a second accidental call for the same booking (the
    // UI's own state already prevents this in practice — a cancelled
    // booking stops being returned as `myBooking`, so handleCancel has
    // nothing left to cancel a second time) refunds the same charge only
    // once rather than twice, as a real backstop and not just an assumed one.
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${bookingId}` });

    return json({ ok: true });
  } catch (err) {
    console.error('refund-booking error', err);
    return json({ error: "Couldn't process the refund right now. Contact Doc if this keeps happening." }, 500);
  }
});
