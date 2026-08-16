import React from 'react';
import Svg, { Circle, Defs, G, Path, TextPath, Text as SvgText } from 'react-native-svg';
import { KettlebellWaveGlyph } from './KettlebellWaveGlyph';
import { fonts } from '../../theme';

type Props = {
  color: string;
  size?: number;
};

const TOP_ARC = 'M 34 110 A 76 76 0 0 1 186 110';
const BOTTOM_ARC = 'M 34 110 A 76 76 0 0 0 186 110';

// The circular badge: kettlebell-wave mark at center, "DOC'S FITNESS" arched
// over the top, "NEW JERSEY" arched along the bottom, ringed by a dotted
// inner circle and a solid outer ring. Single-color line art via `color`, so
// it drops onto any background (white line on green, white on black, etc.).
export function DocsBadgeLogo({ color, size = 120 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220">
      <Defs>
        <Path id="badgeTopArc" d={TOP_ARC} />
        <Path id="badgeBottomArc" d={BOTTOM_ARC} />
      </Defs>

      <Circle cx={110} cy={110} r={101} fill="none" stroke={color} strokeWidth={9} />
      <Circle
        cx={110}
        cy={110}
        r={88}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray="1 8"
        strokeLinecap="round"
      />

      {/* Left / right flourishes */}
      <G>
        <Path d="M32,98 C25,103 25,117 32,122" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx={30} cy={90} r={2.2} fill={color} />
        <Circle cx={30} cy={130} r={2.2} fill={color} />
        <Path d="M188,98 C195,103 195,117 188,122" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx={190} cy={90} r={2.2} fill={color} />
        <Circle cx={190} cy={130} r={2.2} fill={color} />
      </G>

      <SvgText fill={color} fontFamily={fonts.headline} fontSize={17} letterSpacing={2.5}>
        <TextPath href="#badgeTopArc" startOffset="50%" textAnchor="middle">
          DOC'S FITNESS
        </TextPath>
      </SvgText>
      <SvgText fill={color} fontFamily={fonts.headline} fontSize={17} letterSpacing={2.5}>
        <TextPath href="#badgeBottomArc" startOffset="50%" textAnchor="middle">
          NEW JERSEY
        </TextPath>
      </SvgText>

      <G transform="translate(64,72) scale(0.92)">
        <KettlebellWaveGlyph color={color} strokeWidth={7} />
      </G>
    </Svg>
  );
}
