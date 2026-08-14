import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  name: string;
  uri?: string | null;
  size?: number;
};

export function Avatar({ name, uri, size = 36 }: Props) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} />;
  }

  return (
    <View style={[styles.fallback, dimensionStyle]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.hairline,
  },
  fallback: {
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
  },
});
