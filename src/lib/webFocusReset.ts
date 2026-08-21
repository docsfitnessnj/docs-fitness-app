import { Platform } from 'react-native';
import { colors } from '../theme';

// React Native Web renders TextInput as a real DOM <input>/<textarea>, which
// picks up the browser's default blue focus ring. Overriding just the
// outline color (not the outline itself) keeps the same native focus
// affordance but in the app's green, everywhere a text field exists —
// search, composer, log results, profile fields, entry forms — with a
// single app-wide rule instead of per-component styling.
export function injectWebFocusStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('docs-fitness-focus-reset')) return;

  const style = document.createElement('style');
  style.id = 'docs-fitness-focus-reset';
  style.textContent = `
    input:focus, textarea:focus, select:focus {
      outline-color: ${colors.green} !important;
    }
  `;
  document.head.appendChild(style);
}
