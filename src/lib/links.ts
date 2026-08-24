import { Linking, Share } from 'react-native';
import { showAlert } from './alert';
import { LOCATION } from '../theme';

export const APP_SHARE_URL = 'https://docsfitnessnj.github.io/docs-fitness-app';

// Opens the device share sheet with a short invite message + app link. Web
// only supports this when the browser implements the Web Share API
// (react-native-web's Share.share rejects otherwise), so this falls back to
// just showing the message the member can copy by hand.
export function shareInvite() {
  const message = `Doc's Fitness — kettlebell workouts, a weekly challenge, and class booking, all in one app. ${APP_SHARE_URL}`;
  Share.share({ message, url: APP_SHARE_URL, title: "Doc's Fitness" }).catch(() => {
    showAlert('Share Doc’s Fitness', message);
  });
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
