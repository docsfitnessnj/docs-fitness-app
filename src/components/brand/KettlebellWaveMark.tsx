import React from 'react';
import Svg from 'react-native-svg';
import { KettlebellWaveGlyph } from './KettlebellWaveGlyph';

type Props = {
  color: string;
  size?: number;
  strokeWidth?: number;
};

// Standalone kettlebell-wave mark — top bar, Doc's story avatar.
export function KettlebellWaveMark({ color, size = 24, strokeWidth = 8 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <KettlebellWaveGlyph color={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
