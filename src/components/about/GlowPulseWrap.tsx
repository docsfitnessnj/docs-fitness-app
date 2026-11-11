import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { colors } from '../../theme';

type Props = {
  children: React.ReactNode;
  borderRadius: number;
};

const KEYFRAMES_ID = 'docs-fitness-about-glow-pulse';
const ANIMATION_NAME = 'docsFitnessAboutGlowPulse';

// A genuine CSS @keyframes animation, not react-native's own Animated API.
// Animated.Value-driven shadowOpacity/shadowRadius was tried first and
// produced no visible glow at all -- confirmed directly (the real DOM
// node's computed boxShadow read back `none` at every frame). Root cause:
// react-native-web's own style preprocessor builds the final box-shadow
// CSS string from shadowColor/shadowOffset/shadowOpacity/shadowRadius
// together at the point a style object is handed to it, which runs fine
// for four plain numbers but not for an Animated interpolation object
// standing in for one of them. A real CSS animation sidesteps the whole
// question -- the browser itself tweens between two literal box-shadow
// strings, the same "inject one small <style> tag once, dedup by id"
// technique this app already uses for its focus-ring override (see
// webFocusReset.ts's injectWebFocusStyles).
function injectGlowKeyframes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes ${ANIMATION_NAME} {
      0%, 100% { box-shadow: 0 0 6px 0 ${colors.goldBright}73; }
      50% { box-shadow: 0 0 18px 4px ${colors.goldBright}F2; }
    }
  `;
  document.head.appendChild(style);
}

const GLOW_STYLE =
  Platform.OS === 'web'
    ? ({ animation: `${ANIMATION_NAME} 3s ease-in-out infinite` } as object)
    : ({
        shadowColor: colors.goldBright,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
      } as object);

// Round 49: the one glowing element on the whole About page (START FREE
// ONLINE). Wraps the real button rather than animating the button's own
// style directly, so the button keeps its own press-state styling
// completely untouched.
export function GlowPulseWrap({ children, borderRadius }: Props) {
  useEffect(() => {
    injectGlowKeyframes();
  }, []);

  return (
    <View testID="about-start-free-glow" style={[{ borderRadius }, GLOW_STYLE]}>
      {children}
    </View>
  );
}
