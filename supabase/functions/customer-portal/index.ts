import { corsHeaders } from '../_shared/cors.ts';
import { getStripe } from '../_shared/stripe.ts';
import { getSupabaseAdmin, getSupabaseForUser } from '../_shared/supabaseAdmin.ts';
import { resolveOrigin } from '../_shared/origin.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Opens Stripe's hosted billing portal for the signed-in member's own
// subscription — update card, cancel, view invoices. Only ever looks up
// this member's own Stripe customer id (never anyone else's, and never
// something the client can pass in), so there is no way to open someone
// else's billing portal through this function.
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
    const origin = resolveOrigin(body.origin);

    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!row?.stripe_customer_id) {
      return json({ error: "You don't have a billing account yet — start a plan first." }, 400);
    }

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/?checkout=return`,
    });

    return json({ url: portalSession.url });
  } catch (err) {
    console.error('customer-portal error', err);
    return json({ error: "Couldn't open the billing portal right now. Try again in a moment." }, 500);
  }
});
