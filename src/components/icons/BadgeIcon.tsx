import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BadgeId } from '../../data/badges';
import { colors, fonts } from '../../theme';

type Props = {
  id: BadgeId;
  // Earned badges render gold; unearned render as flat gray silhouettes.
  earned: boolean;
  size?: number;
};

// Thin tally marks (four uprights + a diagonal strike) drawn from plain
// Views — matches the app's line-art icon language without needing an
// icon-font glyph that doesn't exist for "chalk tally marks."
function TallyMarks({ color, size }: { color: string; size: number }) {
  const strokeW = Math.max(1.5, size * 0.09);
  const strokeH = size * 0.62;
  const gap = size * 0.14;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: strokeW,
              height: strokeH,
              backgroundColor: color,
              borderRadius: strokeW / 2,
              marginLeft: i === 0 ? 0 : gap,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            width: strokeH * 1.15,
            height: strokeW,
            backgroundColor: color,
            borderRadius: strokeW / 2,
            transform: [{ rotate: '58deg' }],
          }}
        />
      </View>
    </View>
  );
}

function BadgeGlyph({ id, color, size }: { id: BadgeId; color: string; size: number }) {
  switch (id) {
    case 'joker':
      return <MaterialCommunityIcons name="cards-playing-outline" size={size} color={color} />;
    case 'on_fire':
      return <Ionicons name="flame-outline" size={size} color={color} />;
    case 'cow_killer':
      return <MaterialCommunityIcons name="cow" size={size} color={color} />;
    case 'the_regular':
      return <TallyMarks color={color} size={size} />;
    case 'day_one_doug':
      return (
        <Text style={{ fontFamily: fonts.headline, fontSize: size * 0.46, color, letterSpacing: 0.5 }}>D1D</Text>
      );
    case 'hundred_down':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="kettlebell" size={size} color={color} />
          <Text
            style={{
              position: 'absolute',
              top: size * 0.34,
              fontFamily: fonts.labelBold,
              fontSize: size * 0.24,
              color,
            }}
          >
            100
          </Text>
        </View>
      );
    default:
      return null;
  }
}

// A badge glyph inside its circular frame — gold fill/border when earned,
// gray hairline silhouette when not. Used both inline (small, next to a
// name) and large (profile grid, Trophy Case, detail modal).
export function BadgeIcon({ id, earned, size = 36 }: Props) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        earned ? styles.frameEarned : styles.frameUnearned,
      ]}
    >
      <BadgeGlyph id={id} color={earned ? colors.greenDeep : colors.textMuted} size={size * 0.56} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  frameEarned: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  frameUnearned: {
    backgroundColor: colors.background,
    borderColor: colors.hairline,
  },
});
