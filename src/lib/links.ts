import { Linking } from 'react-native';
import { showAlert } from './alert';
import { LOCATION } from '../theme';

export const MERCH_STORE_URL = 'https://docsfitness.example.com/merch';
export const DECK_STORE_URL = 'https://docsfitness.example.com/shop/deck-of-wods';

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
