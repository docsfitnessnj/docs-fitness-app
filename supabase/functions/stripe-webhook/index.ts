import { getStripe } from '../_shared/stripe.ts';
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { planForPriceId } from '../_shared/prices.ts';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

async function upsertSubscription(
  admin: SupabaseAdmin,
  userId: string,
  customerId: string,
  // deno-lint-ignore no-explicit-any
  subscription: any,
  planHint: string | undefined
) {
  const priceId: string | undefined = subscription.items?.data?.[0]?.price?.id;
  const plan = planHint ?? planForPriceId(priceId) ?? 'monthly';
  await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      price_id: priceId ?? null,
      plan,
      status: subscription.status,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  // Monthly Unlimited (IN PERSON) also mirrors onto profiles.in_person_plan
  // — the column has_group_chat_access() and Member Manager's roster key
  // off directly — kept in sync here so EVERY path that touches an
  // in-person-monthly subscription (checkout completing, created/updated,
  // a failed invoice re-fetching it) lands in the same place: real access
  // only while the subscription is actually active, revoked the moment it
  // isn't (past_due, canceled, unpaid, incomplete...).
  if (plan === 'in_person_monthly') {
    if (subscription.status === 'active') {
      await admin.from('profiles').update({ in_person_plan: 'monthly_unlimited' }).eq('id', userId);
    } else {
      await admin
        .from('profiles')
        .update({ in_person_plan: null })
        .eq('id', userId)
        .eq('in_person_plan', 'monthly_unlimited');
    }
  }
}

// Fallback path for events whose subscription object doesn't carry our own
// supabase_user_id metadata (shouldn't normally happen — create-checkout
// always sets it — but Stripe Dashboard-created test subscriptions won't
// have it, and this keeps the webhook resilient rather than silently
// dropping the update).
// deno-lint-ignore no-explicit-any
async function upsertSubscriptionByCustomer(admin: SupabaseAdmin, customerId: string, subscription: any) {
  const { data: row } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (!row) {
    console.error('stripe-webhook: no subscriptions row found for customer', customerId);
    return;
  }
  await upsertSubscription(admin, row.user_id, customerId, subscription, undefined);
}

// Stripe -> this app's one source of truth for who's actually paying for
// what. Verifies the request really came from Stripe (STRIPE_WEBHOOK_SECRET,
// a Supabase project secret Doc sets himself — see the pull request
// description), then writes real subscription state to the database with
// the service role key. This is the ONLY place online access is ever
// granted or revoked for real — the app's browser code never decides this
// on its own.
Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  // deno-lint-ignore no-explicit-any
  let event: any;
  try {
    // constructEventAsync (not the sync constructEvent) — Deno's crypto
    // subtle API is async-only, unlike Node's.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook: signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Log every event for Doc's future Command Center, and use the insert
  // itself to dedupe a redelivery (Stripe retries on timeout) — the event
  // id is the primary key, so a repeat insert fails and we stop here rather
  // than reprocessing side effects (like claiming a Founding 50 spot) twice.
  const { error: logError } = await admin.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event,
  });
  if (logError) {
    if (logError.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }
    console.error('stripe-webhook: failed to log event', logError);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId: string | null = session.client_reference_id ?? session.metadata?.supabase_user_id ?? null;
        const plan: string | undefined = session.metadata?.plan;
        if (!userId) break;

        if (session.subscription) {
          // Online monthly/annual/founding, or in-person Monthly Unlimited
          // — all real Stripe subscriptions, handled identically.
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(admin, userId, session.customer as string, subscription, plan);

          if (plan === 'founding') {
            const { error: claimError } = await admin.from('founding_fifty_members').insert({ id: userId });
            if (claimError) {
              // Extremely rare race (sold out in the moments between
              // starting Checkout and completing it) or a redelivered
              // event — the member keeps the subscription they already
              // paid for either way; just log it instead of failing the
              // whole webhook over it.
              console.error('stripe-webhook: could not record founding 50 claim for', userId, claimError);
            }
          }
        } else if (session.mode === 'payment' && (plan === 'ten_pack' || plan === 'drop_in')) {
          // 10 Class Pack or Drop In — a one-time payment, confirmed right
          // here. in_person_purchases is what the client polls (by this
          // Checkout Session id) to know the purchase actually went
          // through before it finalizes a booking or shows the purchase
          // celebration — never optimistically before this lands.
          const { error: purchaseError } = await admin.from('in_person_purchases').insert({
            id: session.id,
            user_id: userId,
            plan,
            amount_cents: session.amount_total ?? null,
          });
          if (purchaseError) {
            // Top-level event-id dedupe (above) already catches a true
            // redelivery — this is just the same rare-race/log-don't-fail
            // treatment as the founding 50 claim above.
            console.error('stripe-webhook: could not record in-person purchase for', userId, purchaseError);
          }

          if (plan === 'ten_pack') {
            const purchasedAt = new Date();
            const expiresAt = new Date(purchasedAt);
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            const { error: packError } = await admin.from('class_packs').insert({
              user_id: userId,
              purchased_at: purchasedAt.toISOString(),
              expires_at: expiresAt.toISOString(),
              stripe_checkout_session_id: session.id,
            });
            if (packError) {
              console.error('stripe-webhook: could not grant class pack for', userId, packError);
            }
            await admin.from('profiles').update({ in_person_plan: 'ten_pack' }).eq('id', userId);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId: string | undefined = subscription.metadata?.supabase_user_id;
        if (userId) {
          await upsertSubscription(admin, userId, subscription.customer as string, subscription, undefined);
        } else {
          await upsertSubscriptionByCustomer(admin, subscription.customer as string, subscription);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const { data: canceledRow } = await admin
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id)
          .select('user_id, plan')
          .maybeSingle();
        // in-person Monthly Unlimited going away for real (not just
        // cancel-at-period-end, which keeps status 'active' until the
        // period actually ends) — revoke the access that column grants.
        // Guarded on the current value so this can never clobber a
        // different plan set in between.
        if (canceledRow?.plan === 'in_person_monthly') {
          await admin
            .from('profiles')
            .update({ in_person_plan: null })
            .eq('id', canceledRow.user_id)
            .eq('in_person_plan', 'monthly_unlimited');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscriptionByCustomer(admin, subscription.customer as string, subscription);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Still respond 200 below — the event is already logged in
    // stripe_events for Doc to review, and returning an error here would
    // just make Stripe retry the same event indefinitely.
    console.error('stripe-webhook: error handling event', event.type, err);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
