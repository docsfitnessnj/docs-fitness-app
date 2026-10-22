import { corsHeaders } from '../_shared/cors.ts';
import { getStripe } from '../_shared/stripe.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';
import { resolveOrigin } from '../_shared/origin.ts';
import { PlanKey, PRICE_IDS } from '../_shared/prices.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const ONE_TIME_PLANS: readonly PlanKey[] = ['ten_pack', 'drop_in'];

// Starts a real Stripe Checkout session for whichever of the 5
// member-choosable plans (online monthly/annual, in-person Monthly
// Unlimited, 10 Class Pack, or Drop In) the client asked for. The Founding
// 50 rate is never something the client asks for directly — this function
// re-checks eligibility itself (live launch window, under 50 claimed, this
// account hasn't already claimed one) and silently falls back to the
// standard $57 price the moment any of that isn't true, exactly as round
// one's brief required. Never trust what the client showed on screen.
//
// Business decisions this function enforces server-side, never trusting the
// client: the Founding 50 rate has no trial — it charges $37 immediately at
// checkout, rate locked in for as long as the membership stays active.
// Standard monthly and annual keep their 14-day trial unchanged, live
// window or not. Monthly Unlimited (IN PERSON) also has no trial — in
// person's hook is the first class free, handled entirely client-side
// before any checkout is ever started, not a Stripe trial. 10 Class Pack
// and Drop In are one-time payments, not subscriptions.
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
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const origin = resolveOrigin(body.origin);
    const admin = getSupabaseAdmin();
    const stripe = getStripe();

    // Find or create this member's Stripe customer, remembering it so the
    // next checkout (or the billing portal) doesn't create a duplicate.
    const { data: existingSub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: 'user_id' });
    }

    const rawPlan = body.plan;

    if (ONE_TIME_PLANS.includes(rawPlan)) {
      // 10 CLASS PACK ($200) or DROP IN ($25) — a one-time payment, not a
      // subscription. The webhook grants the pack / confirms the booking
      // once Stripe confirms the payment, never before.
      const planLabel: PlanKey = rawPlan;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: PRICE_IDS[planLabel], quantity: 1 }],
        client_reference_id: user.id,
        metadata: { supabase_user_id: user.id, plan: planLabel },
        allow_promotion_codes: false,
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancel`,
      });
      if (!session.url) {
        return json({ error: 'Could not start checkout.' }, 500);
      }
      return json({ url: session.url });
    }

    // Everything else is a subscription — online monthly/annual, or
    // in-person Monthly Unlimited.
    let priceId: string = PRICE_IDS.monthly;
    let planLabel: PlanKey = 'monthly';

    if (rawPlan === 'in_person_monthly') {
      priceId = PRICE_IDS.in_person_monthly;
      planLabel = 'in_person_monthly';
    } else if (rawPlan === 'annual') {
      priceId = PRICE_IDS.annual;
      planLabel = 'annual';
    } else {
      // Default/'monthly' — the only plan the Founding 50 rate can ever
      // apply to.
      const [settingsRes, claimedRes, alreadyClaimedRes] = await Promise.all([
        admin.from('founding_fifty_settings').select('starts_at, ends_at, enabled').eq('id', 1).maybeSingle(),
        admin.from('founding_fifty_members').select('id', { count: 'exact', head: true }),
        admin.from('founding_fifty_members').select('id').eq('id', user.id).maybeSingle(),
      ]);
      const now = Date.now();
      const startsAt = settingsRes.data?.starts_at ? new Date(settingsRes.data.starts_at).getTime() : null;
      const endsAt = settingsRes.data?.ends_at ? new Date(settingsRes.data.ends_at).getTime() : null;
      const windowLive = startsAt !== null && endsAt !== null && now >= startsAt && now < endsAt;
      const soldOut = (claimedRes.count ?? 0) >= 50;
      const alreadyClaimed = !!alreadyClaimedRes.data;
      // The master switch (see migration_022.sql) — re-checked here, server
      // side, same as every other eligibility condition, so a stale or
      // forged client request can never get the founding rate while Doc has
      // the launch switched off, no matter what the saved dates say.
      const enabled = !!settingsRes.data?.enabled;
      const eligibleForFounding = enabled && windowLive && !soldOut && !alreadyClaimed;
      if (eligibleForFounding) {
        priceId = PRICE_IDS.founding;
        planLabel = 'founding';
      }
    }

    // No trial on the Founding 50 rate ($37 charges immediately) or on
    // in-person Monthly Unlimited (the first-class-free hook replaces a
    // trial for in person). Standard monthly and annual keep the 14-day
    // trial.
    const noTrial = planLabel === 'founding' || planLabel === 'in_person_monthly';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(noTrial ? {} : { trial_period_days: 14 }),
        metadata: { supabase_user_id: user.id, plan: planLabel },
      },
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan: planLabel },
      allow_promotion_codes: false,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    if (!session.url) {
      return json({ error: 'Could not start checkout.' }, 500);
    }

    return json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error', err);
    return json({ error: 'Could not start checkout right now. Try again in a moment.' }, 500);
  }
});
