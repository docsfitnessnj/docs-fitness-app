import { Linking, Platform, Share } from 'react-native';
import { showAlert } from './alert';
import { LOCATION } from '../theme';

// Keep this in sync with public/index.html's og:url/og:image/og:title/
// og:description, which can't import these constants since that file is
// served as-is, not bundled.
export const APP_SHARE_URL = 'https://docsfitnessnj.github.io/docs-fitness-app';

// The og:title / og:description text — also what the Invite a Friend
// preview card shows as "what they'll see," so it stays a faithful preview
// of the real link card.
export const APP_SHARE_TITLE = "Join Doc's Fitness: Train Online or In Person";
export const APP_SHARE_DESCRIPTION = 'Kettlebell workouts. Class booking. Weekly challenge. All in one app.';

export const APP_SHARE_MESSAGE = `${APP_SHARE_TITLE}. ${APP_SHARE_DESCRIPTION}`;

// Opens the device share sheet with the invite message and link as separate
// fields (not one concatenated string) — iOS, Android, and the Web Share
// API all render them as distinct parts of the share sheet. Web only
// supports this when the browser implements the Web Share API
// (react-native-web's Share.share rejects otherwise); a user backing out of
// the share sheet also rejects the same promise, so only the "unsupported"
// case falls back to a plain alert with the message the member can copy by
// hand — a cancel is silently a no-op, same as it would be natively.
export function shareInvite(message: string = APP_SHARE_MESSAGE) {
  Share.share({ message, url: APP_SHARE_URL, title: "Doc's Fitness" }).catch((err) => {
    if (err?.name === 'AbortError') return;
    showAlert('Share Doc’s Fitness', `${message} ${APP_SHARE_URL}`);
  });
}

// Copies just the link — the shortcut offered alongside the full share
// sheet. Returns whether the copy actually succeeded so the caller can show
// the right confirmation state.
export async function copyInviteLink(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(APP_SHARE_URL);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const MERCH_STORE_URL =
  'https://docs-fitness-merch.myshopify.com/collections/doc-s-fitness-merch?utm_source=docs_app&utm_medium=app&utm_campaign=merch';
export const DECK_STORE_URL =
  'https://docs-fitness-merch.myshopify.com/products/doc-s-deck-of-wods?utm_source=docs_app&utm_medium=app&utm_campaign=deck';

// Every one of these leaves the app for an outside site (the merch store,
// the deck store, Google Maps, a YouTube breakdown) — never the Stripe
// checkout/billing-portal redirect, which is a same-tab part of the payment
// flow and goes through stripeCheckout.ts's openHostedUrl instead. On web,
// this opens a real new tab via window.open (not react-native-web's
// Linking.openURL, whose "defaults to a new tab" behavior isn't part of its
// typed API and isn't something to depend on) — 'noopener' keeps that new
// tab from getting a handle back to this window, and this tab is left
// exactly where it was. window.open() legitimately returns null with
// 'noopener' set even when the tab opened fine (that's the point of
// noopener — no handle back), so its return value can't be used to detect
// failure the way openURL's rejected promise can on native; a blocked
// popup already shows the browser's own UI for that, nothing further to do
// here. On native, Linking.openURL leaves the app for the external
// app/browser, which is the native equivalent.
function openExternal(url: string, fallbackTitle: string, fallbackMessage: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  Linking.openURL(url).catch(() => {
    showAlert(fallbackTitle, fallbackMessage);
  });
}

export function openMerchStore() {
  openExternal(MERCH_STORE_URL, "Doc's Merch Store", 'The store is coming soon.');
}

export function openDeckStore() {
  openExternal(DECK_STORE_URL, 'Deck of WODs Store', 'The store is coming soon.');
}

const MAPS_QUERY = encodeURIComponent(`${LOCATION.name}, ${LOCATION.city}`);
export const LOCATION_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${MAPS_QUERY}`;

export function openLocationMaps() {
  openExternal(LOCATION_MAPS_URL, LOCATION.name, "Couldn't open Maps. Search for the Boathouse in Ventnor City, NJ.");
}

// Opens a workout's breakdown video (a YouTube URL stored on the content
// itself) in the browser/YouTube app — see WatchVideoBreakdownButton, the
// one button that ever calls this.
export function openVideoBreakdown(videoUrl: string) {
  openExternal(videoUrl, 'Video Breakdown', "Couldn't open the video right now.");
}
