import { corsHeaders } from '../_shared/cors.ts';
import { getStripe } from '../_shared/stripe.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';
import { resolveOrigin } from '../_shared/origin.ts';
import { PlanKey, PRICE_IDS } from '../_shared/prices.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Starts a real Stripe Checkout session for one of the two member-choosable
// online plans (monthly or annual) with a 14-day free trial attached. The
// Founding 50 rate is never something the client asks for directly — this
// function re-checks eligibility itself (live launch window, under 50
// claimed, this account hasn't already claimed one) and silently falls back
// to the standard $57 price the moment any of that isn't true, exactly as
// the round's brief requires. Never trust what the client showed on screen.
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
    const requestedPlan: PlanKey = body.plan === 'annual' ? 'annual' : 'monthly';
    const origin = resolveOrigin(body.origin);

    const admin = getSupabaseAdmin();

    let priceId: string = PRICE_IDS.monthly;
    let planLabel: PlanKey = 'monthly';

    if (requestedPlan === 'monthly') {
      const [settingsRes, claimedRes, alreadyClaimedRes] = await Promise.all([
        admin.from('founding_fifty_settings').select('starts_at, ends_at').eq('id', 1).maybeSingle(),
        admin.from('founding_fifty_members').select('id', { count: 'exact', head: true }),
        admin.from('founding_fifty_members').select('id').eq('id', user.id).maybeSingle(),
      ]);
      const now = Date.now();
      const startsAt = settingsRes.data?.starts_at ? new Date(settingsRes.data.starts_at).getTime() : null;
      const endsAt = settingsRes.data?.ends_at ? new Date(settingsRes.data.ends_at).getTime() : null;
      const windowLive = startsAt !== null && endsAt !== null && now >= startsAt && now < endsAt;
      const soldOut = (claimedRes.count ?? 0) >= 50;
      const alreadyClaimed = !!alreadyClaimedRes.data;
      const eligibleForFounding = windowLive && !soldOut && !alreadyClaimed;
      if (eligibleForFounding) {
        priceId = PRICE_IDS.founding;
        planLabel = 'founding';
      }
    } else {
      priceId = PRICE_IDS.annual;
      planLabel = 'annual';
    }

    // Find or create this member's Stripe customer, remembering it so the
    // next checkout (or the billing portal) doesn't create a duplicate.
    const { data: existingSub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const stripe = getStripe();
    let customerId = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: 'user_id' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
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
