// Round 65 Part 4: the physical Deck of WODs gets a standing member price —
// owner decision, final. Not a sale, no countdown, no urgency copy. Every
// GET THE DECK / GET THE PHYSICAL DECK entry point in the app reads these
// same four constants, so the price, the note, and the link target can
// never drift between the Deck screen, the deck upsell popup, or the two
// Joker-verification entry points (Badge Detail, Trophy Case).
//
// Both URLs are the owner's own, used exactly as given — the MEMBERPRICE
// one is a real Shopify discount-code redirect link (its own `redirect`
// query param IS the destination), so no utm tracking is appended to
// either on top of it, unlike this app's other outbound links.
export const DECK_REGULAR_PRICE = '$52';
export const DECK_MEMBER_PRICE = '$37';

export const DECK_MEMBER_PRICE_URL =
  'https://docs-fitness-merch.myshopify.com/discount/MEMBERPRICE?redirect=/products/doc-s-deck-of-wods';
export const DECK_REGULAR_PRICE_URL = 'https://docs-fitness-merch.myshopify.com/products/doc-s-deck-of-wods';

// The quiet, muted-style note every entry point shows alongside the price —
// one line, never a banner, never its own CTA.
export const DECK_MEMBER_NOTE = 'Members get the deck for $15 off.';
export const DECK_FREE_TIER_NOTE = 'Members pay $37.';

// Round 65 follow-up: real device testing showed the Shopify product page
// itself still displays $52 (correct and unavoidable — the MEMBERPRICE
// discount applies at checkout, via deckStoreUrl's own discount-code
// redirect link, never on the product page itself), which read like the
// discount was missing. This second line, member-price tiers only, directly
// beneath DECK_MEMBER_NOTE at every entry point, heads that off. Owner's own
// exact wording, final.
export const DECK_MEMBER_CHECKOUT_NOTE = 'Your $15 member discount applies automatically at checkout.';

// Which link a GET THE DECK button opens — the member-price discount link
// for every full-content-access tier, the plain product page otherwise.
export function deckStoreUrl(fullContentAccess: boolean): string {
  return fullContentAccess ? DECK_MEMBER_PRICE_URL : DECK_REGULAR_PRICE_URL;
}
