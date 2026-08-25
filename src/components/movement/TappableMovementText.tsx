import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { splitMovementSegments } from '../../lib/movementMatcher';
import { colors } from '../../theme';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  onOpenMovement: (movementId: string) => void;
  // Default (green + underline) reads fine on the app's usual white/card
  // backgrounds. Pass an override wherever the base text already sits on a
  // dark or colored surface (e.g. the COWS hero band) so the link stays
  // legible against it.
  linkStyle?: StyleProp<TextStyle>;
};

// Renders text with any recognized movement name(s) inside it as tappable
// spans that jump straight to that movement's video in the vault. A
// recognized movement with no video yet still renders as plain text — per
// spec, never a dead tap target.
export function TappableMovementText({ text, style, onOpenMovement, linkStyle }: Props) {
  const segments = splitMovementSegments(text);

  return (
    <Text style={style}>
      {segments.map((segment, index) => {
        if (!segment.movement?.video) return segment.text;
        const movementId = segment.movement.id;
        return (
          <Text
            key={index}
            style={linkStyle ?? styles.tappable}
            onPress={() => onOpenMovement(movementId)}
            testID={`movement-link-${movementId}`}
          >
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  tappable: {
    color: colors.green,
    textDecorationLine: 'underline',
  },
});
