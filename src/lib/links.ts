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

export function openMerchStore() {
  Linking.openURL(MERCH_STORE_URL).catch(() => {
    showAlert("Doc's Merch Store", 'The store is coming soon.');
  });
}

export function openDeckStore() {
  Linking.openURL(DECK_STORE_URL).catch(() => {
    showAlert('Deck of WODs Store', 'The store is coming soon.');
  });
}

const MAPS_QUERY = encodeURIComponent(`${LOCATION.name}, ${LOCATION.city}`);
export const LOCATION_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${MAPS_QUERY}`;

export function openLocationMaps() {
  Linking.openURL(LOCATION_MAPS_URL).catch(() => {
    showAlert(LOCATION.name, "Couldn't open Maps. Search for the Boathouse in Ventnor City, NJ.");
  });
}
