import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// A generous threshold: a real keyboard opening shrinks the visible area by
// 250px+ on a phone; Safari's own toolbar collapsing/expanding moves it by
// much less, so this tells the two apart without false-positiving on chrome.
const WEB_KEYBOARD_HEIGHT_THRESHOLD = 150;

// Whether the on-screen keyboard is currently showing. Used for things like
// zeroing out safe-area bottom padding while the keyboard (not the home
// indicator) is what's actually at the bottom of the screen.
//
// Native: react-native's own Keyboard module fires real show/hide events.
//
// Web: react-native-web's Keyboard module is a permanent no-op (isVisible()
// always false, no listeners ever fire), so this falls back to comparing
// the live visualViewport height against the tallest height seen so far —
// see public/index.html's Round 5 comment for why visualViewport is the
// thing to trust here.
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const showSub = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }

    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    let maxHeight = vv.height;
    const update = () => {
      if (vv.height > maxHeight) maxHeight = vv.height;
      setVisible(maxHeight - vv.height > WEB_KEYBOARD_HEIGHT_THRESHOLD);
    };
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return visible;
}
