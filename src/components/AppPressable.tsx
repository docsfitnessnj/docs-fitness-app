import React, { forwardRef } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  // The look this control switches TO on touch down, on top of its own
  // `style` (e.g. styles.sendButtonPressed with backgroundColor:
  // colors.greenDeep/goldDeep for a filled button). Omit it on a plain
  // icon/row control and it falls back to a quiet opacity dim instead —
  // either way every tappable control in the app gets SOME physical
  // acknowledgment on touch, which is the one thing this component exists
  // to guarantee without every screen reinventing it.
  pressedStyle?: StyleProp<ViewStyle>;
};

// The one shared press-feedback mechanism for every tappable control in
// the app — swap a `Pressable` import for this and touch-down already
// reads as "the app noticed," touch-up already reads as "released," with
// zero layout shift (opacity/background only, never size/padding/border).
// See useActionCompletion for the separate, opt-in "SAVED/POSTED" flash
// some of these (save, post, submit, book) also need on top of this.
export const AppPressable = forwardRef<React.ComponentRef<typeof Pressable>, Props>(
  function AppPressable({ style, pressedStyle, ...rest }, ref) {
    return (
      <Pressable
        ref={ref}
        style={(state: { pressed: boolean; hovered?: boolean }) => [
          typeof style === 'function' ? style(state) : style,
          state.pressed && (pressedStyle ?? { opacity: 0.6 }),
        ]}
        {...rest}
      />
    );
  }
);
