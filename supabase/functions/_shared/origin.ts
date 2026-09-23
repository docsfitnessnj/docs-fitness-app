// Where Stripe sends the member back after Checkout / the billing portal.
// Deliberately NOT built from a client-supplied URL with no validation
// (that would be an open-redirect hole) — only these known app origins are
// ever honored; anything else silently falls back to the real production
// site. Add a new dev origin here if you run the app from a different local
// port.
const ALLOWED_ORIGINS = ['https://docsfitnessnj.github.io/docs-fitness-app', 'http://localhost:8081', 'http://localhost:19006'];
const DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];

export function resolveOrigin(candidate: unknown): string {
  if (typeof candidate === 'string' && ALLOWED_ORIGINS.some((o) => candidate === o || candidate.startsWith(`${o}/`))) {
    return candidate.replace(/\/$/, '');
  }
  return DEFAULT_ORIGIN;
}
