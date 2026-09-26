import { Linking, Platform } from 'react-native';
import { supabase } from './supabaseClient';

export type OnlineCheckoutPlan = 'monthly' | 'annual';

const GENERIC_CHECKOUT_ERROR = "Couldn't start checkout right now. Check your connection and try again.";
const GENERIC_PORTAL_ERROR = "Couldn't open billing right now. Check your connection and try again.";

// The base the Edge Function will build the Stripe success/cancel/return
// URL from — validated server-side against a known allowlist there too, so
// this is just what we ask for, not something the function blindly trusts.
function currentOrigin(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
  }
  return undefined;
}

async function openHostedUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Same-tab navigation, not a new tab — this is a redirect flow (Stripe
    // sends the member right back to this same app afterward), not an
    // external link to browse alongside the app.
    window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

// supabase-js's functions.invoke() doesn't auto-parse a non-2xx response
// body into `data` — the human-readable message our Edge Functions send
// back lives on the thrown error's `.context` Response instead.
async function messageFromInvokeError(error: unknown, fallback: string): Promise<string> {
  const withContext = error as { context?: Response };
  if (withContext?.context && typeof withContext.context.json === 'function') {
    try {
      const body = await withContext.context.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // Response body wasn't JSON (or already consumed) — fall through.
    }
  }
  return fallback;
}

// Starts a real Stripe Checkout session for Monthly or Annual (Online) and
// navigates there. The server decides — never the client — whether this
// checkout actually uses the Founding 50 rate, and whether a 14-day trial
// gets attached (standard/annual: yes; the live Founding 50 rate: no, it
// charges immediately — see create-checkout).
export async function startOnlineCheckout(plan: OnlineCheckoutPlan): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { plan, origin: currentOrigin() },
    });
    if (error) {
      return { error: await messageFromInvokeError(error, GENERIC_CHECKOUT_ERROR) };
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      return { error: GENERIC_CHECKOUT_ERROR };
    }
    await openHostedUrl(url);
    return { error: null };
  } catch {
    return { error: GENERIC_CHECKOUT_ERROR };
  }
}

// Opens Stripe's hosted billing portal for the signed-in member's own
// subscription (update card, cancel) — the MANAGE MEMBERSHIP row.
export async function openBillingPortal(): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('customer-portal', {
      body: { origin: currentOrigin() },
    });
    if (error) {
      return { error: await messageFromInvokeError(error, GENERIC_PORTAL_ERROR) };
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      return { error: GENERIC_PORTAL_ERROR };
    }
    await openHostedUrl(url);
    return { error: null };
  } catch {
    return { error: GENERIC_PORTAL_ERROR };
  }
}
