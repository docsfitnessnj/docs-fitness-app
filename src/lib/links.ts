import { Linking } from 'react-native';
import { showAlert } from './alert';

export const MERCH_STORE_URL = 'https://docsfitness.example.com/merch';

export function openMerchStore() {
  Linking.openURL(MERCH_STORE_URL).catch(() => {
    showAlert("Doc's Merch Store", 'The store is coming soon.');
  });
}
