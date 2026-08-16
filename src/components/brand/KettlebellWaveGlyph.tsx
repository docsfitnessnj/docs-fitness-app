import React from 'react';
import { ClipPath, Defs, G, Path, Rect, Circle } from 'react-native-svg';

type Props = {
  color: string;
  strokeWidth?: number;
};

// The core mark: a kettlebell outline with a wave curling through its base.
// Drawn in a local 0-100 box so it can be embedded (via <G transform>) inside
// the circular badge, or wrapped standalone in KettlebellWaveMark.
export function KettlebellWaveGlyph({ color, strokeWidth = 7 }: Props) {
  return (
    <G>
      <Defs>
        <ClipPath id="kbBodyClip">
          <Circle cx={50} cy={62} r={31} />
        </ClipPath>
      </Defs>

      {/* Handle */}
      <Rect
        x={27}
        y={8}
        width={46}
        height={36}
        rx={18}
        ry={18}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />

      {/* Body */}
      <Circle cx={50} cy={62} r={34} fill="none" stroke={color} strokeWidth={strokeWidth} />

      {/* Wave, clipped to the body */}
      <G clipPath="url(#kbBodyClip)">
        <Path
          d="M12,56 C28,47 38,65 54,56 C70,47 80,65 96,56"
          stroke={color}
          strokeWidth={strokeWidth * 0.62}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M8,69 C26,58 40,80 60,69 C78,58 90,80 104,69"
          stroke={color}
          strokeWidth={strokeWidth * 0.62}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M6,84 C26,72 42,96 64,84 C80,72 94,96 108,84"
          stroke={color}
          strokeWidth={strokeWidth * 0.62}
          fill="none"
          strokeLinecap="round"
        />
      </G>
      <Path
        d="M20,90 C15,86 17,79 24,80 C29,81 28,88 23,87"
        stroke={color}
        strokeWidth={strokeWidth * 0.5}
        fill="none"
        strokeLinecap="round"
      />
    </G>
  );
}
